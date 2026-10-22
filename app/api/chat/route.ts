import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import { getOrCreateSession, saveState, type SessionState } from '@/lib/agent/state';
import { ACTION_TOOLS, buildTools, runTool, type ToolCtx } from '@/lib/agent/tools';
import { systemPrompt } from '@/lib/agent/system-prompt';
import { appNow } from '@/lib/data/hours';
import { chatModel, llmMode } from '@/lib/llm';
import { q } from '@/lib/db/client';
import type { ActionMetadata } from '@/lib/agent/types';

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
  for (const key of Object.keys(prev) as Array<keyof SessionState>) if (!(key in state)) delete latest[key];
  await saveState(sessionId, latest as SessionState);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { messages?: UIMessage[] } | null;
  const messages = (body?.messages ?? []).slice(-MAX_HISTORY);
  if (!messages.length) return new Response('messages required', { status: 400 });

  const session = await getOrCreateSession();
  const before = JSON.stringify(session.state);
  const ctx: ToolCtx = { sessionId: session.id, state: session.state, now: appNow(session.state.demoTime) };
  const tools = buildTools(ctx);
  const last = messages[messages.length - 1];
  const meta = (last?.role === 'user' ? (last.metadata as ActionMetadata | undefined) : undefined) ?? {};
  const action = meta.action && ACTION_TOOLS.has(meta.action.tool) ? meta.action : undefined;

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const extra: UIMessage[] = [];
      if (action) {
        // UI action: run the tool right away so cards appear without waiting for the LLM
        const toolCallId = `act_${Date.now().toString(36)}`;
        writer.write({ type: 'start' });
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

      const productTitle = ctx.state.chosenProduct
        ? (await q<{ persian_title: string }>('SELECT persian_title FROM products WHERE product_id = $1', [ctx.state.chosenProduct]))[0]?.persian_title
        : undefined;
      const system =
        systemPrompt(ctx.state, ctx.now, { productTitle }) +
        (action ? `\n\nکاربر با لمس دکمه، ابزار ${action.tool} را اجرا کرد و نتیجه‌اش نمایش داده شد. همان ابزار را دوباره صدا نزن؛ فقط در ۱ تا ۲ جمله نتیجه را جمع‌بندی کن و قدم بعدی را پیشنهاد بده.` : '');

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
        stopWhen: stepCountIs(5),
        timeout: { stepMs: 25_000 },
        maxRetries: 1,
      });
      writer.merge(result.toUIMessageStream({ sendStart: !action, onError: persianError }));
    },
    onError: persianError,
    onEnd: async () => {
      await persist(session.id, before, ctx.state).catch((e) => console.error('[api/chat] persist', e));
    },
  });

  return createUIMessageStreamResponse({ stream, headers: { 'x-llm-mode': llmMode() } });
}
