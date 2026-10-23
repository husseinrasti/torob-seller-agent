import { generateText, Output } from 'ai';
import { z } from 'zod';
import { normalizeForSearch } from '../../fa/normalize';
import { toEnDigits } from '../../fa/digits';
import { parseBudget, parseQuery } from '../../search/query';
import { llmConfigured, model } from '../../llm';
import { q } from '../../db/client';
import type { SessionState } from '../state';
import { placeIndex, scanLocation, type LocationMatch, type PlaceIndex } from './geocode';
import type { Mission, MissionGoal } from './types';

/**
 * Mission extraction: deterministic rules first (budget, place, conditions, delegated checks — reliable
 * and testable), then the fast LLM fills the product words and anything the rules missed.
 */

const BRANDS = [
  'سامسونگ', 'شیائومی', 'اپل', 'آیفون', 'هواوی', 'آنر', 'نوکیا', 'موتورولا', 'ریلمی', 'انکر', 'سونی', 'ال جی', 'جی پلاس', 'پاناسونیک',
  'بوش', 'فیلیپس', 'شارپ', 'ایسوس', 'لنوو', 'اچ پی', 'دل', 'ایسر', 'تسکو', 'بیاند', 'هایک ویژن', 'داهوا', 'کیو سی وای', 'کاسیو', 'جی بی ال',
  'بیسوس', 'هیسنس', 'دلونگی', 'مولینکس', 'براون', 'تفال',
];

// conditions («فقط اونایی که الان بازن»، «قسطی باشه»)
const OPEN_NOW_RE = /الان باز|باز (?:باشه|باشن|باشند|باشد|هستن|هستند|ان|اند)|(?:^| )بازن(?: |$)|فقط باز|(?:^| )بازه(?: |$)/u;
const INSTALLMENT_RE = /قسطی|اقساط|اعتباری/u;
const TOROBPAY_RE = /ترب ?پی/u;
const FAST_RE = /ارسال (?:فوری|سریع)/u;
const WARRANTY_RE = /گارانتی/u;
// delegated checks («خودت بپرس»، «چک کن»، «پیگیری کن»، «مطمئن شو»)
const CONTACT_RE = /بپرس|پرسیدن|سوال کن|سؤال کن|پیگیری کن|پیگیری بکن|پیگیری کنی|استعلام|پیام بده|پیام بدی|زنگ بزن|زنگ بزنی|تماس بگیر|چک کن|چک بکن|چک کنی|مطمئن شو|مطمئن بشو/u;
const CALL_RE = /زنگ|تماس/u;
const AVAILABILITY_RE = /موجود (?:دار|داره|دارن|دارند|هست|باشه)|موجوده|موجودی|(?:دارن|داره|دارند) یا نه|موجود داره|موجود دارن/u;
const FRESHNESS_RE = /آپدیت|اپدیت|به روز|بروز|قیمت(?: ?ها)?(?:شون)? (?:درسته|درست|واقعی)|قیمت جدید|تازه/u;
const HOURS_RE = /(?:ببین|چک کن|بپرس)[^.؟?]{0,30}باز|باز (?:هستن|هستند|هست|ان|اند)(?: یا نه)?|ساعت کاری|کی باز/u;
// outputs
const PLAN_RE = /برنامه(?: ی)? ?مراجعه|برنامه (?:بده|بریز|بچین)|برنامه ریزی|مسیر(?: رو)? (?:بده|بچین)/u;
const COMPARE_RE = /مقایسه/u;
const TOP_N_RE = /(?:^| )(\d{1,2}) ?تا(?: (?:فروشنده|مغازه|فروشگاه|گزینه)(?: ?ها)?)?(?= |$)/u;
const RADIUS_RE = /(?:شعاع |تا |در )?(\d+(?:\.\d+)?) ?(کیلومتر|کیلو|متر)(?:ی)?/u;
const CHEAPEST_RE = /ارزون ?ترین|ارزان ?ترین|کمترین قیمت|ارزون تر|ارزان تر/u;
const NEAREST_RE = /نزدیک ?ترین/u;
const NEARBY_RE = /نزدیک من|نزدیکم|اطراف من|اطرافم|همین اطراف|دور و بر من|همین دور و بر/u;
const PREVIOUS_RE = /(?:همون|همان|همین)(?: \S+){0,2} (?:قبلی|قبلیه)|(?:کالای|گوشی|محصول|همون|همان) قبلی|همونی که|همون که/u;

// mission words that are not product words (on top of the generic filler of parseQuery)
const STOP = new Set(
  (
    'خودت خودتون بپرس بپرسی بپرسید ببین ببینی چک کن بکن کنی پیگیری استعلام پیام بده بدی زنگ بزن بزنی تماس بگیر مطمئن شو بشو ' +
    'اپدیت آپدیت اپدیته آپدیته بروزه بروز به روز هست هستش هستن هستند یا نه اینکه که و باشه باشن باشند محدوده قیمت قیمتا قیمتها ها هاشون شون شونو ' +
    'الان باز بازن بازه فقط اونایی اونا کیه کی کدوم موجود موجودی موجوده داره دارن دارند برنامه مراجعه بریز بچین مقایسه ' +
    'ارزون ارزان ترین اول بهتر بهترین فروشنده فروشنده ها مغازه مغازه ها فروشگاه فروشگاه ها گزینه رو را این بار دفعه همون همین همان قبلی ' +
    'ساعت کاری لطفا سوال سؤال درسته درست واقعی جدید تازه نزدیک ترین اطراف من تو توی در سمت حوالی شعاع کیلومتر متر'
  ).split(/\s+/),
);

export type MissionDraft = { mission: Mission; goals: MissionGoal[]; location: LocationMatch | null; nearby: boolean };

function emptyMission(): Mission {
  return { product: null, budget: null, location: null, conditions: {}, verify: {}, output: {}, intent: 'balanced', channel: 'message' };
}

export function missionGoals(m: Mission): MissionGoal[] {
  const g: MissionGoal[] = [];
  if (m.product) g.push('find');
  if (m.location?.text) g.push('where');
  if (Object.values(m.conditions).some(Boolean)) g.push('conditions');
  if (Object.values(m.verify).some(Boolean)) g.push('verify');
  if (m.output.want_plan) g.push('plan');
  if (m.output.want_compare) g.push('compare');
  return g;
}

/**
 * A message is a mission when it has ≥ 2 goals (find + place, find + checks, …) or delegates a check
 * («خودت بپرس»، «چک کن»…) — and there is a product to act on (named now or chosen earlier).
 */
export function isMission(m: Mission, opts: { hasProductContext?: boolean } = {}): boolean {
  if (!m.product && !opts.hasProductContext) return false;
  const delegated = Boolean(m.verify.contact_sellers || m.verify.availability || m.verify.price_freshness || m.verify.hours);
  return missionGoals(m).length >= 2 || delegated;
}

/** Deterministic pass (pure; `index` = places, `chosen` = the session's chosen product for «همون گوشی قبلی»). */
export function parseMission(text: string, opts: { index: PlaceIndex; chosen?: { id: string; title: string } | null }): MissionDraft {
  const m = emptyMission();
  const norm = normalizeForSearch(toEnDigits(text));
  const tokens = norm.split(' ').filter(Boolean);

  // place: remove its span (and the marker before it) from the product words
  const location = scanLocation(text, opts.index);
  let rest = location ? [...tokens.slice(0, location.span[0]), ...tokens.slice(location.span[1])].join(' ') : norm;
  if (location) m.location = { text: location.phrase };
  const nearby = NEARBY_RE.test(norm);

  const b = parseBudget(rest);
  rest = b.rest;
  if (b.budget) {
    if ((b.mode === 'about' || b.mode === 'plain') && b.amount) m.budget = { min: Math.round(b.amount * 0.9), max: Math.round(b.amount * 1.1), mode: 'about' };
    else if (b.mode === 'range') m.budget = { min: b.budget.min, max: b.budget.max, mode: 'range' };
    else if (b.mode === 'min') m.budget = { min: b.budget.min, mode: 'min' };
    else m.budget = { max: b.budget.max, mode: 'max' };
  }

  const radius = rest.match(RADIUS_RE);
  if (radius) {
    const v = Number(radius[1]) * (radius[2] === 'متر' ? 1 : 1000);
    if (v >= 100 && v <= 20000) m.location = { ...(m.location ?? {}), radius_m: Math.round(v) };
    rest = rest.replace(radius[0], ' ');
  }
  const top = rest.match(TOP_N_RE);
  if (top && Number(top[1]) >= 1 && Number(top[1]) <= 10) {
    m.output.top_n = Number(top[1]);
    rest = rest.replace(top[0], ' ');
  }

  if (OPEN_NOW_RE.test(norm) || HOURS_RE.test(norm)) m.conditions.open_now = true;
  if (INSTALLMENT_RE.test(norm)) m.conditions.installment = true;
  if (TOROBPAY_RE.test(norm)) m.conditions.torobpay = true;
  if (FAST_RE.test(norm)) m.conditions.fast_delivery = true;
  if (WARRANTY_RE.test(norm)) m.conditions.warranty = true;

  if (CONTACT_RE.test(norm)) m.verify.contact_sellers = true;
  if (AVAILABILITY_RE.test(norm)) m.verify.availability = true;
  if (FRESHNESS_RE.test(norm)) m.verify.price_freshness = true;
  if (HOURS_RE.test(norm)) m.verify.hours = true;
  if (CALL_RE.test(norm)) m.channel = 'call';

  if (PLAN_RE.test(norm)) m.output.want_plan = true;
  if (COMPARE_RE.test(norm)) m.output.want_compare = true;
  m.intent = CHEAPEST_RE.test(norm) ? 'cheapest' : NEAREST_RE.test(norm) ? 'nearest' : 'balanced';

  const brand = BRANDS.find((x) => ` ${norm} `.includes(` ${normalizeForSearch(x)} `));
  if (opts.chosen && PREVIOUS_RE.test(norm)) {
    m.product = { query: opts.chosen.title, product_id: opts.chosen.id };
  } else {
    const words = parseQuery(rest)
      .keywords.split(' ')
      .filter((w) => w && !STOP.has(w));
    const query = words.join(' ').trim();
    // «A17» or «پاوربانک ۲۰ هزار» are products; leftovers like a lone number are not
    if (query.length >= 2 && /\p{L}/u.test(query)) m.product = { query, ...(brand ? { brand } : {}) };
  }
  return { mission: m, goals: missionGoals(m), location, nearby };
}

const LlmMission = z.object({
  product_query: z.string().nullable().describe('only the product words, e.g. «گوشی سامسونگ», «هدفون بلوتوثی»; null if none'),
  brand: z.string().nullable(),
  category_hint: z.string().nullable().describe('a Persian product category, e.g. «گوشی موبایل»'),
  budget_min_toman: z.number().nullable(),
  budget_max_toman: z.number().nullable(),
  budget_mode: z.enum(['about', 'max', 'min', 'range']).nullable(),
  location_text: z.string().nullable().describe('a named Tehran place (neighbourhood, square, mall); null for «نزدیک من»'),
  radius_m: z.number().nullable(),
  open_now: z.boolean(),
  installment: z.boolean(),
  torobpay: z.boolean(),
  fast_delivery: z.boolean(),
  warranty: z.boolean(),
  verify_price_freshness: z.boolean().describe('user wants to know if listed prices are up to date'),
  verify_contact_sellers: z.boolean().describe('user asked the assistant to ask/contact/check with sellers'),
  verify_availability: z.boolean(),
  verify_hours: z.boolean().describe('user wants to know whether shops are open'),
  top_n: z.number().nullable(),
  want_plan: z.boolean(),
  want_compare: z.boolean(),
  intent: z.enum(['balanced', 'cheapest', 'nearest', 'now']),
  channel: z.enum(['message', 'call']),
});

async function llmMission(text: string): Promise<z.infer<typeof LlmMission> | null> {
  if (!llmConfigured()) return null;
  try {
    const { output } = await generateText({
      model: model('fast'),
      output: Output.object({ schema: LlmMission }),
      system:
        'Extract a shopping mission from a Persian message for an in-person shopping assistant in Tehran. ' +
        'Budgets are in toman («۵۰ میلیون» = 50000000; «حدود/تقریباً» → about; «تا/حداکثر/زیر» → max; «بین/از … تا …» → range). ' +
        'Never invent values that are not in the message; use null/false when absent.',
      prompt: text,
      timeout: 5000,
      maxRetries: 0,
    });
    return output ?? null;
  } catch (err) {
    console.warn('[mission] llm extraction failed, rules only:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Rules win on numbers, place and checks they found; the LLM fills product words and gaps. */
export function mergeMission(rules: Mission, llm: z.infer<typeof LlmMission> | null): Mission {
  if (!llm) return rules;
  const m: Mission = structuredClone(rules);
  if (!m.product?.product_id && llm.product_query?.trim()) {
    m.product = { query: llm.product_query.trim(), ...(llm.brand || m.product?.brand ? { brand: llm.brand ?? m.product?.brand } : {}), ...(llm.category_hint ? { category_hint: llm.category_hint } : {}) };
  }
  if (!m.budget && (llm.budget_min_toman || llm.budget_max_toman)) {
    m.budget = { min: llm.budget_min_toman ?? undefined, max: llm.budget_max_toman ?? undefined, mode: llm.budget_mode ?? (llm.budget_min_toman && llm.budget_max_toman ? 'range' : llm.budget_max_toman ? 'max' : 'min') };
  }
  if (!m.location?.text && llm.location_text?.trim()) m.location = { ...(m.location ?? {}), text: llm.location_text.trim() };
  if (!m.location?.radius_m && llm.radius_m && llm.radius_m >= 100 && llm.radius_m <= 20000) m.location = { ...(m.location ?? {}), radius_m: Math.round(llm.radius_m) };
  m.conditions = {
    open_now: m.conditions.open_now || llm.open_now || undefined,
    installment: m.conditions.installment || llm.installment || undefined,
    torobpay: m.conditions.torobpay || llm.torobpay || undefined,
    fast_delivery: m.conditions.fast_delivery || llm.fast_delivery || undefined,
    warranty: m.conditions.warranty || llm.warranty || undefined,
  };
  m.verify = {
    price_freshness: m.verify.price_freshness || llm.verify_price_freshness || undefined,
    contact_sellers: m.verify.contact_sellers || llm.verify_contact_sellers || undefined,
    availability: m.verify.availability || llm.verify_availability || undefined,
    hours: m.verify.hours || llm.verify_hours || undefined,
  };
  if (m.verify.hours) m.conditions.open_now = true;
  if (!m.output.top_n && llm.top_n && llm.top_n >= 1 && llm.top_n <= 10) m.output.top_n = Math.round(llm.top_n);
  m.output.want_plan = m.output.want_plan || llm.want_plan || undefined;
  m.output.want_compare = m.output.want_compare || llm.want_compare || undefined;
  if (m.intent === 'balanced' && llm.intent !== 'balanced') m.intent = llm.intent;
  if (llm.channel === 'call') m.channel = 'call';
  for (const o of [m.conditions, m.verify, m.output] as Array<Record<string, unknown>>) for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return m;
}

async function chosenOf(state: SessionState): Promise<{ id: string; title: string } | null> {
  const id = state.chosenProduct ?? state.candidates[0];
  if (!id) return null;
  const [p] = await q<{ persian_title: string }>('SELECT persian_title FROM products WHERE product_id = $1', [id]);
  return p ? { id, title: p.persian_title.split('|')[0].trim() } : null;
}

/** Rules only (fast, no LLM): used by the chat route to decide whether a message is a mission. */
export async function detectMission(text: string, state: SessionState): Promise<MissionDraft & { mission_like: boolean }> {
  const draft = parseMission(text, { index: await placeIndex(), chosen: await chosenOf(state) });
  return { ...draft, mission_like: isMission(draft.mission, { hasProductContext: Boolean(state.chosenProduct || state.candidates.length) }) };
}

/** Full extraction: rules, then (when a provider is configured and `llm` is on) the fast model merged in. */
export async function extractMission(text: string, state: SessionState, opts: { llm?: boolean } = {}): Promise<MissionDraft> {
  const draft = parseMission(text, { index: await placeIndex(), chosen: await chosenOf(state) });
  if (opts.llm === false) return draft;
  const merged = mergeMission(draft.mission, await llmMission(text));
  return { ...draft, mission: merged, goals: missionGoals(merged) };
}
