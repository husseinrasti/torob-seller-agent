import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import { chatSession, saveMessages, saveState, type Session, type SessionState } from '@/lib/agent/state';
import { memoryForPrompt, rememberTurn } from '@/lib/agent/memory';
import { saveMemory } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { ACTION_TOOLS, buildTools, runTool, type ToolCtx } from '@/lib/agent/tools';
import { systemPrompt } from '@/lib/agent/system-prompt';
import { appNow } from '@/lib/data/hours';
import { chatModel, llmMode } from '@/lib/llm';
import { q } from '@/lib/db/client';
import type { ActionMetadata } from '@/lib/agent/types';
import { detectMission } from '@/lib/agent/mission/extract';
import { isSpecQuestion } from '@/lib/search/spec-qa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_HISTORY = 16;

function persianError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[api/chat]', msg);
  if (/timeout|timed out|aborted/i.test(msg)) return 'پاسخ دستیار بیش از حد طول کشید. دوباره بپرسید؛ کنترل‌های بالای صفحه و فهرست فروشنده‌ها همچنان کار می‌کنند.';
  return 'دستیار هوشمند الان در دسترس نیست. کنترل‌های بالای صفحه (محل، شعاع، بودجه، شرایط) و فهرست فروشنده‌ها همچنان کار می‌کنند.';
}

/** Persist only the keys this request changed, on top of the latest stored state (ContextBar may PATCH meanwhile). */
async function persist(sessionId: string, before: string, state: SessionState) {
  const prev = JSON.parse(before) as SessionState;
  const rows = await q<{ state: SessionState }>('SELECT state FROM sessions WHERE id = $1', [sessionId]);
  const latest = { ...(rows[0]?.state ?? prev) } as Record<string, unknown>;
  for (const key of Object.keys(state) as Array<keyof SessionState>) {
    if (JSON.stringify(state[key]) !== JSON.stringify(prev[key])) latest[key] = state[key];
  }
  // follow-up replies may resolve (via polling) while this turn is still streaming: a resolved status wins
  const stored = (rows[0]?.state?.followups ?? {}) as SessionState['followups'];
  const pendingish = (v?: string) => v === 'pending' || v === 'contacting';
  latest.followups = { ...(latest.followups as SessionState['followups']) };
  for (const [offer, st] of Object.entries(stored)) {
    const mine = (latest.followups as SessionState['followups'])[offer];
    if (!pendingish(st) && pendingish(mine)) (latest.followups as SessionState['followups'])[offer] = st;
  }
  for (const key of Object.keys(prev) as Array<keyof SessionState>) if (!(key in state)) delete latest[key];
  await saveState(sessionId, latest as SessionState);
}

const genId = createIdGenerator({ prefix: 'msg', size: 16 });

const titleOf = async (productId?: string) =>
  productId ? (await q<{ persian_title: string }>('SELECT persian_title FROM products WHERE product_id = $1', [productId]))[0]?.persian_title : undefined;

/** Remember searches, chosen products and the chosen location across chats. */
async function updateMemory(session: Session, before: string, state: SessionState) {
  const prev = JSON.parse(before) as SessionState;
  const productTitle = state.chosenProduct !== prev.chosenProduct ? await titleOf(state.chosenProduct) : undefined;
  const next = rememberTurn(session.user.memory, prev, state, { productTitle });
  if (next) await saveMemory(session.user.id, next);
}

const MISSION_HINT =
  'این پیام یک مأموریت چندمرحله‌ای بود؛ run_mission کامل اجرا شد و گزارشش (جدول فروشنده‌ها، پیگیری‌ها و پیشنهاد) نمایش داده شد. ابزار دیگری صدا نزن. حداکثر ۳ جمله بنویس: یادداشت پوشش محدوده (اگر هست، صریح و صادقانه)، پیشنهاد نهایی یا دلیل نبودنش، و یک قدم بعدی. هر عدد فقط از نتیجه ابزار.';

const textOf = (m?: UIMessage) => (m?.parts ?? []).map((p) => (p.type === 'text' ? p.text : '')).join(' ').trim();

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: string; messages?: UIMessage[]; mode?: string; demo_time?: string | null } | null;
  const all = body?.messages ?? [];
  const messages = all.slice(-MAX_HISTORY);
  if (!messages.length) return new Response('messages required', { status: 400 });

  let session: Session;
  try {
    session = await chatSession(body?.id);
  } catch (err) {
    return errorResponse(err);
  }
  // the page's demo clock wins over a chat created a moment ago (its PATCH may still be in flight)
  if (body && 'demo_time' in body && (session.state.demoTime ?? null) !== (body.demo_time || null)) {
    session.state.demoTime = body.demo_time || undefined;
    await saveState(session.id, session.state).catch(() => {});
  }
  const before = JSON.stringify(session.state);
  const ctx: ToolCtx = { sessionId: session.id, state: session.state, now: appNow(session.state.demoTime) };
  const tools = buildTools(ctx);
  const last = messages[messages.length - 1];
  const meta = (last?.role === 'user' ? (last.metadata as ActionMetadata | undefined) : undefined) ?? {};
  let action = meta.action && ACTION_TOOLS.has(meta.action.tool) ? meta.action : undefined;
  // auto mode: a compound request («… محدوده سعادت آباد، خودت بپرس قیمت‌ها آپدیته؟») runs as one mission
  // right away (rules decide; works without the LLM), then the model comments on the report
  if (!action && body?.mode === 'auto' && last?.role === 'user') {
    const text = textOf(last);
    const det = text ? await detectMission(text, ctx.state).catch(() => null) : null;
    if (det?.mission_like) action = { tool: 'run_mission', input: { text } };
    // «این گوشی NFC داره؟» about the product on screen → answered from its specs, never from memory
    else if (text && (ctx.state.chosenProduct || ctx.state.candidates.length) && isSpecQuestion(text)) action = { tool: 'product_specs_qa', input: { question: text } };
    // «چرا این اول شد؟» about the list on screen → its score breakdown, not the model's guess
    else if (text && ctx.state.chosenProduct && /چرا\s+(?:این|اون|اولی|\S+)?\s*(?:اول|رتبه|بالاتر|برتر)/u.test(text)) action = { tool: 'explain_rank', input: {} };
  }

  const stream = createUIMessageStream({
    originalMessages: all,
    generateId: genId,
    execute: async ({ writer }) => {
      ctx.write = (part) => writer.write(part);
      const extra: UIMessage[] = [];
      if (action) {
        // UI action: run the tool right away so cards appear without waiting for the LLM
        const toolCallId = `act_${Date.now().toString(36)}`;
        writer.write({ type: 'start', messageId: genId() });
        writer.write({ type: 'start-step' });
        writer.write({ type: 'tool-input-available', toolCallId, toolName: action.tool, input: action.input });
        try {
          const output = await runTool(action.tool, action.input, ctx);
          writer.write({ type: 'tool-output-available', toolCallId, output });
          extra.push({
            id: `${toolCallId}_m`,
            role: 'assistant',
            parts: [{ type: `tool-${action.tool}`, toolCallId, state: 'output-available', input: action.input, output } as UIMessage['parts'][number]],
          });
        } catch (err) {
          const errorText = err instanceof Error ? err.message : 'خطا در اجرای درخواست';
          writer.write({ type: 'tool-output-error', toolCallId, errorText });
          extra.push({
            id: `${toolCallId}_m`,
            role: 'assistant',
            parts: [{ type: `tool-${action.tool}`, toolCallId, state: 'output-error', input: action.input, errorText } as UIMessage['parts'][number]],
          });
        }
        writer.write({ type: 'finish-step' });
        await persist(session.id, before, ctx.state).catch(() => {});
      }

      const productTitle = await titleOf(ctx.state.chosenProduct);
      const system =
        systemPrompt(ctx.state, ctx.now, { productTitle, memory: memoryForPrompt(session.user.name, session.user.memory) }) +
        (action?.tool === 'run_mission'
          ? `\n\n${MISSION_HINT}`
          : action
            ? `\n\nکاربر با لمس دکمه، ابزار ${action.tool} را اجرا کرد و نتیجه‌اش نمایش داده شد. همان ابزار را دوباره صدا نزن؛ فقط در ۱ تا ۲ جمله نتیجه را جمع‌بندی کن و قدم بعدی را پیشنهاد بده.`
            : '');

      let noticed = false;
      const result = streamText({
        model: chatModel((err) => {
          console.warn('[api/chat] provider failed, using offline rules:', err instanceof Error ? err.message : err);
          if (noticed) return;
          noticed = true;
          writer.write({ type: 'data-notice', data: { text: 'دستیار هوشمند (مدل زبانی) در دسترس نبود؛ این پاسخ با حالت ساده و قاعده‌محور تولید شد.' } });
        }),
        system,
        messages: await convertToModelMessages([...messages, ...extra], { tools, ignoreIncompleteToolCalls: true }),
        tools,
        stopWhen: stepCountIs(10),
        timeout: { stepMs: 25_000 },
        maxRetries: 1,
      });
      writer.merge(result.toUIMessageStream({ sendStart: !action, generateMessageId: genId, onError: persianError }));
    },
    onError: persianError,
    onEnd: async ({ messages: finalMessages }) => {
      await persist(session.id, before, ctx.state).catch((e) => console.error('[api/chat] persist', e));
      await saveMessages(session.id, finalMessages).catch((e) => console.error('[api/chat] save messages', e));
      await updateMemory(session, before, ctx.state).catch((e) => console.error('[api/chat] memory', e));
    },
  });

  return createUIMessageStreamResponse({ stream, headers: { 'x-llm-mode': llmMode() } });
}
