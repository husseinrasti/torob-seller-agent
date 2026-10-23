// A rule-based stand-in for an LLM (LLM_PROVIDER=offline, or when no API key is configured).
// It plugs into the same AI SDK streamText loop and tools; it only decides which tool to call and
// writes short templated Persian text from tool results. Every number it prints comes from a tool output.
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { formatDistance, formatToman, formatTomanShort } from '../fa/format';
import { toFaDigits } from '../fa/digits';
import { normalizeForSearch } from '../fa/normalize';

type Decision = { tool?: { name: string; input: Record<string, unknown> }; text?: string };
type Json = Record<string, unknown>;

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

function lastUserText(prompt: LanguageModelV4Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i];
    if (m.role === 'user') return m.content.map((c) => (c.type === 'text' ? c.text : '')).join(' ').trim();
  }
  return '';
}

/** Tool results of the trailing tool/assistant messages (the current step's inputs). */
function trailingToolResults(prompt: LanguageModelV4Prompt): Array<{ toolName: string; value: Json | null; error?: string }> {
  const out: Array<{ toolName: string; value: Json | null; error?: string }> = [];
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i];
    if (m.role === 'user' || m.role === 'system') break;
    if (m.role === 'tool' || m.role === 'assistant') {
      for (const c of m.content) {
        if (c.type !== 'tool-result') continue;
        const o = c.output;
        if (o.type === 'json') out.unshift({ toolName: c.toolName, value: o.value as Json });
        else if (o.type === 'error-text' || o.type === 'error-json') out.unshift({ toolName: c.toolName, value: null, error: String(o.value) });
        else if (o.type === 'text') out.unshift({ toolName: c.toolName, value: { text: o.value } });
      }
    }
  }
  return out;
}

/** Most recent find_sellers result anywhere in the conversation. */
function lastSellers(prompt: LanguageModelV4Prompt): Json | null {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i];
    if (m.role !== 'tool' && m.role !== 'assistant') continue;
    for (let j = m.content.length - 1; j >= 0; j--) {
      const c = m.content[j];
      if (c.type === 'tool-result' && c.toolName === 'find_sellers' && c.output.type === 'json') return c.output.value as Json;
    }
  }
  return null;
}

const pct = (x: unknown) => `${toFaDigits(Math.round(Number(x) * 100))}٪`;

function explainTop(sellers: Json): string {
  const top = (sellers.top as Json[] | undefined)?.[0];
  if (!top) return 'هنوز فهرستی از فروشنده‌ها ندارم؛ اول فروشنده‌های نزدیک را پیدا کنیم.';
  const b = (top.score_breakdown ?? {}) as Json;
  const why = (top.why as string[] | undefined)?.join(' و ') || 'امتیاز کلی بالاتر';
  return `«${top.shop}» اول شد چون ${why}. سهم هر معیار در امتیاز: قیمت ${pct(b.price)}، فاصله ${pct(b.distance)}، تازگی قیمت ${pct(b.freshness)}، باز بودن ${pct(b.open)} و شرایط خرید ${pct(b.conditions)}.`;
}

function summarize(toolName: string, v: Json | null, error?: string): string {
  if (error || !v) return 'این مرحله با خطا روبه‌رو شد؛ دوباره تلاش کنید یا از دکمه‌ها استفاده کنید.';
  switch (toolName) {
    case 'search_products': {
      const products = (v.products as Json[]) ?? [];
      if (!products.length) return 'کالای مناسبی پیدا نکردم؛ لطفاً نام کالا یا برند را دقیق‌تر بگویید.';
      const budget = (v.budget_toman as Json | null)?.max as number | undefined;
      return `${toFaDigits(products.length)} گزینه پیدا کردم${budget ? ` با بودجه تا ${formatTomanShort(budget)} تومان` : ''}. می‌توانید دو مورد را مقایسه کنید یا «فروشنده‌های نزدیک» یکی را ببینید.`;
    }
    case 'compare_products':
      return 'تفاوت‌ها در جدول آمده؛ هر کدام را «انتخاب» کنید تا فروشنده‌های نزدیکش را پیدا کنم.';
    case 'find_sellers': {
      const count = Number(v.count ?? 0);
      const radius = formatDistance(Number(v.location_radius_m ?? 1000));
      if (!count) {
        const relax = (v.relaxations as Json[] | undefined)?.[0];
        return `در شعاع ${radius} فروشنده‌ای با این شرایط پیدا نشد${relax ? `؛ با حذف فیلتر «${relax.label}» ${toFaDigits(Number(relax.would_add))} فروشنده اضافه می‌شود` : ''}.`;
      }
      const top = (v.top as Json[])[0];
      const cluster = (v.clusters as Json[] | undefined)?.[0];
      const price = top.price ? formatToman(Number(top.price)) : 'قیمت ثبت نشده';
      const relax = count < 3 ? (v.relaxations as Json[] | undefined)?.[0] : undefined;
      return `${toFaDigits(count)} فروشنده در شعاع ${radius} پیدا شد${cluster ? `؛ ${toFaDigits(Number(cluster.sellers))} تا در ${cluster.mall}` : ''}. «${top.shop}» اول است (${price}). ${relax ? `با حذف «${relax.label}» ${toFaDigits(Number(relax.would_add))} فروشنده دیگر هم می‌آید.` : 'برای اطمینان از موجودی، «پیگیری ۳ تای اول» را بزنید.'}`;
    }
    case 'set_context': {
      const changes = (v.changes as string[] | undefined) ?? [];
      const miss = v.unresolved_location ? ` محل «${v.unresolved_location}» را در داده‌ها پیدا نکردم؛ از «موقعیت من» یا نقشه استفاده کنید.` : '';
      return `${changes.length ? `تنظیمات به‌روز شد: ${changes.join('، ')}.` : ''}${miss}`.trim() || 'تنظیمات بدون تغییر ماند.';
    }
    case 'shop_details':
      return `«${v.shop}»${v.mall ? ` — ${v.mall}` : ''}؛ ${v.open}.`;
    case 'contact_seller': {
      const n = ((v.started as Json[] | undefined) ?? []).length;
      return `به ${toFaDigits(n)} فروشنده پیام دادم؛ جواب‌ها چند ثانیه دیگر روی تابلو پیگیری می‌آید و اگر کسی کالا را نداشت، خودم جایگزین پیدا می‌کنم.`;
    }
    case 'find_alternatives': {
      const same = (v.same_product as Json[] | undefined) ?? [];
      const similar = (v.similar as Json[] | undefined) ?? [];
      if (!same.length && !similar.length) return 'جایگزین مناسبی در این محدوده پیدا نشد؛ شعاع را بیشتر کنید.';
      const s0 = same[0];
      const first = s0
        ? `همین کالا در «${s0.shop}»${s0.same_mall ? ' در همین پاساژ' : ''}${s0.mall ? ` (${s0.mall})` : ''} ${s0.price ? `با ${formatToman(Number(s0.price))}` : 'با قیمت ثبت‌نشده'} هست`
        : '';
      const sim = similar.length ? `${first ? '؛ ' : ''}${toFaDigits(similar.length)} کالای مشابه هم در همان مغازه/پاساژ پیدا شد` : '';
      return `${first}${sim}. برای اطمینان، پیگیری‌اش کنید.`;
    }
    case 'plan_trip':
      return 'برنامه مراجعه آماده است؛ ترتیب، زمان رسیدن و باز بودن هر مغازه را ببینید و لینکش را به اشتراک بگذارید.';
    case 'purchase_checklist':
      return 'این نکته‌ها را هنگام خرید حضوری چک کنید.';
    case 'explain_rank': {
      const shares = (v.shares_percent ?? {}) as Record<string, number>;
      const top = Object.entries(shares).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${toFaDigits(n)}٪`).join('، ');
      return `«${String(v.shop)}» رتبه ${toFaDigits(Number(v.rank))} شد چون ${((v.why as string[]) ?? []).join(' و ') || 'امتیاز کلی بالاتری دارد'}؛ سهم معیارها: ${top}.`;
    }
    case 'product_specs_qa':
      return `${String(v.answer)}.`;
    case 'best_time_to_visit':
      return `${String(v.sentence)}.`;
    case 'run_mission': {
      if (v.clarify) return String(v.clarify);
      const rec = v.recommendation as Json | null;
      const parts = [
        v.coverage_note as string | null,
        rec ? `پیشنهاد من ${String(rec.reason)}.` : (v.recommendation_note as string | null),
        (v.conditions_note as string | null) ?? (v.next_steps as string[] | undefined)?.[0]?.concat(' را هم می‌توانید بزنید.'),
      ].filter(Boolean);
      return parts.slice(0, 3).join(' ');
    }
    default:
      return 'انجام شد.';
  }
}

const LOCATION_RE = /(?:نزدیک|اطراف|حوالی|توی|تو|در)\s+(?!من\b|خودم\b)((?:پاساژ|مجتمع|بازار)?\s*[\p{L}\d]+(?:\s+[\p{L}\d]+)?)/u;
const RADIUS_RE = /(\d+(?:\.\d+)?)\s*(کیلومتر|کیلو|متر)/u;

function decide(options: LanguageModelV4CallOptions): Decision {
  const prompt = options.prompt;
  const results = trailingToolResults(prompt);
  const forced = options.toolChoice?.type === 'tool' ? options.toolChoice.toolName : undefined;
  if (forced) return { tool: { name: forced, input: {} } };
  if (results.length) {
    return { text: results.map((r) => summarize(r.toolName, r.value, r.error)).join(' ') };
  }
  const text = lastUserText(prompt);
  const norm = normalizeForSearch(text);
  if (/چرا|دلیل/u.test(norm)) {
    const sellers = lastSellers(prompt);
    if (sellers) return { text: explainTop(sellers) };
  }
  const radius = norm.match(RADIUS_RE);
  const loc = norm.match(LOCATION_RE);
  const filters: Json = {};
  if (/قسطی|اقساط|اعتباری/u.test(norm)) filters.installment = true;
  if (/الان باز|باز باشه|باز باشد/u.test(norm)) filters.open_now = true;
  if (/ترب ?پی/u.test(norm)) filters.torobpay = true;
  const wantsContext = radius || (loc && !/^(من|خودم)$/u.test(loc[1])) || Object.keys(filters).length;
  const hasSellers = Boolean(lastSellers(prompt));
  if (wantsContext && hasSellers) {
    const input: Json = {};
    if (radius) input.radius_m = Math.round(Number(radius[1]) * (radius[2] === 'متر' ? 1 : 1000));
    if (loc) input.location_text = loc[1];
    if (Object.keys(filters).length) input.filters = filters;
    return { tool: { name: 'set_context', input } };
  }
  if (!text) return { text: 'چه کالایی می‌خواهید بخرید؟' };
  return { tool: { name: 'search_products', input: { text } } };
}

let seq = 0;

export function offlineModel(modelId = 'rules-v1'): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'offline',
    modelId,
    supportedUrls: {},
    async doGenerate(options) {
      const d = decide(options);
      const content: LanguageModelV4Content[] = [];
      if (d.text) content.push({ type: 'text', text: d.text });
      if (d.tool) content.push({ type: 'tool-call', toolCallId: `off_${Date.now()}_${seq++}`, toolName: d.tool.name, input: JSON.stringify(d.tool.input) });
      return {
        content,
        finishReason: { unified: d.tool ? 'tool-calls' : 'stop', raw: undefined },
        usage,
        warnings: [],
      };
    },
    async doStream(options) {
      const d = decide(options);
      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          if (d.text) {
            const id = `t${seq++}`;
            controller.enqueue({ type: 'text-start', id });
            for (const piece of d.text.match(/\S+\s*/g) ?? [d.text]) controller.enqueue({ type: 'text-delta', id, delta: piece });
            controller.enqueue({ type: 'text-end', id });
          }
          if (d.tool) {
            controller.enqueue({ type: 'tool-call', toolCallId: `off_${Date.now()}_${seq++}`, toolName: d.tool.name, input: JSON.stringify(d.tool.input) });
          }
          controller.enqueue({ type: 'finish', usage, finishReason: { unified: d.tool ? 'tool-calls' : 'stop', raw: undefined } });
          controller.close();
        },
      });
      return { stream };
    },
  };
}
