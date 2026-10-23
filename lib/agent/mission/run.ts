import { q } from '../../db/client';
import { findSellers, type SellerRow, type SellersResult } from '../../search/sellers';
import { searchProducts } from '../../search/products';
import type { Filters } from '../../search/score';
import { awaitFollowups, SIM_DISCLAIMER, startFollowups, type FollowupItem } from '../../sim/followups';
import { buildPlan } from '../../plan/service';
import { formatDistance, formatTomanShort } from '../../fa/format';
import { toFaDigits } from '../../fa/digits';
import { DEFAULT_LOCATION, haversine } from '../../geo';
import { productSearch } from '../product-search';
import { visitTime, type VisitTimeOutput } from '../../search/visit-time';
import type { SessionState } from '../state';
import type { Suggestion } from '../suggest';
import type { PlanOutput } from '../types';
import { COVERAGE_STEPS, widenUntil } from './coverage';
import { geocodeText, placeIndex, placeSuggestions, type GeoPlace } from './geocode';
import { bandLabel, effectivePrice, noRecommendationNote, pickRecommendation, verdictFor, type Band } from './verdict';
import type { Mission, MissionProgress, MissionResult, MissionRow, MissionStep, Understood } from './types';

/**
 * Deterministic mission executor: the same service functions the tools use (geocoder, product search,
 * seller search, simulated follow-ups, visit plan), run end to end with progress events. The LLM only
 * extracts the mission before and writes ≤ 3 sentences after.
 */

export type MissionCtx = { sessionId: string; state: SessionState; now: Date; emit?: (p: MissionProgress) => void };
export type MissionOverrides = { radius_m?: number; location_text?: string; drop?: string[] };

const MISSION_BUDGET_MS = 20_000;
const AWAIT_MS = 8_000;
const MAX_ROWS = 8;
const CONDITION_FILTER: Record<string, keyof Filters> = { installment: 'installment', torobpay: 'torobpay', fast_delivery: 'fast_delivery', warranty: 'warranty_required' };
const CONDITION_LABEL: Record<string, string> = { open_now: 'الان باز', installment: 'قسطی', torobpay: 'ترب‌پی', fast_delivery: 'ارسال فوری', warranty: 'گارانتی‌دار' };

/** Chip edits («بدون قسطی»، «شعاع ۵ کیلومتر»، «مرکز شهر») applied on top of the extracted mission. */
export function applyOverrides(mission: Mission, o: MissionOverrides = {}): Mission {
  const m: Mission = structuredClone(mission);
  if (o.location_text) m.location = { text: o.location_text, ...(o.radius_m ? { radius_m: o.radius_m } : {}) };
  else if (o.radius_m) m.location = { ...(m.location ?? {}), radius_m: o.radius_m };
  for (const k of o.drop ?? []) {
    if (k === 'budget') m.budget = null;
    else if (k === 'location') m.location = null;
    else if (k === 'verify') m.verify = {};
    else if (k === 'plan') delete m.output.want_plan;
    else if (k === 'hours') {
      delete m.verify.hours;
      delete m.conditions.open_now;
    } else if (k in CONDITION_LABEL) delete m.conditions[k as keyof Mission['conditions']];
    else if (k === 'warranty_required') delete m.conditions.warranty;
  }
  return m;
}

function bandOf(m: Mission): Band {
  if (!m.budget) return null;
  return { ...(m.budget.min ? { min: m.budget.min } : {}), ...(m.budget.max ? { max: m.budget.max } : {}) };
}

export function understoodOf(m: Mission, placeLabel?: string): Understood[] {
  const u: Understood[] = [];
  if (m.product) u.push({ key: 'product', label: m.product.brand && !m.product.query.includes(m.product.brand) ? `${m.product.query} ${m.product.brand}` : m.product.query });
  if (m.budget) {
    const b = m.budget;
    const label =
      b.mode === 'about' && b.min && b.max
        ? `حدود ${formatTomanShort(Math.round((b.min + b.max) / 2))} (${bandLabel(b)})`
        : b.mode === 'range'
          ? `${bandLabel(b)} تومان`
          : b.mode === 'min'
            ? `از ${formatTomanShort(b.min!)} به بالا`
            : `تا ${formatTomanShort(b.max!)}`;
    u.push({ key: 'budget', label });
  }
  if (m.location?.text) u.push({ key: 'location', label: `محدوده ${placeLabel ?? m.location.text}` });
  if (m.location?.radius_m) u.push({ key: 'radius', label: `شعاع ${formatDistance(m.location.radius_m)}` });
  for (const [k, v] of Object.entries(m.conditions)) if (v && k !== 'open_now') u.push({ key: k as Understood['key'], label: CONDITION_LABEL[k] });
  if (m.verify.price_freshness) u.push({ key: 'verify', label: 'بررسی به‌روز بودن قیمت' });
  else if (m.verify.contact_sellers || m.verify.availability) u.push({ key: 'verify', label: m.channel === 'call' ? 'تماس و پرسیدن موجودی' : 'پرسیدن موجودی از فروشنده' });
  if (m.verify.hours || m.conditions.open_now) u.push({ key: m.verify.hours ? 'hours' : 'open_now', label: 'باز بودن الان' });
  if (m.intent === 'cheapest') u.push({ key: 'intent', label: 'ارزان‌ترین اول' });
  if (m.intent === 'nearest') u.push({ key: 'intent', label: 'نزدیک‌ترین اول' });
  if (m.output.top_n) u.push({ key: 'top_n', label: `${toFaDigits(m.output.top_n)} فروشنده` });
  if (m.output.want_plan) u.push({ key: 'plan', label: 'برنامه مراجعه' });
  return u;
}

/** The original text with another place name (for «منظورت … بود؟» chips). */
function withPlace(text: string, phrase: string, name: string): string {
  const pattern = new RegExp(phrase.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ا/g, '[اآ]')).join('[\\s\\u200c]*'), 'u');
  return pattern.test(text) ? text.replace(pattern, name) : `${text} — محدوده ${name}`;
}

async function nearestPlaceName(lat: number, lon: number): Promise<string | null> {
  let best: { name: string; d: number } | null = null;
  for (const list of (await placeIndex()).values()) {
    for (const p of list) {
      if (p.kind === 'mall') continue;
      const d = haversine(lat, lon, p.lat, p.lon);
      if (!best || d < best.d) best = { name: p.name, d };
    }
  }
  return best && best.d <= 2500 ? best.name : null;
}

export async function runMission(mission: Mission, text: string, ctx: MissionCtx, opts: { awaitMs?: number; budgetMs?: number } = {}): Promise<MissionResult> {
  const deadline = Date.now() + (opts.budgetMs ?? MISSION_BUDGET_MS);
  const st = ctx.state;
  const m = mission;
  const band = bandOf(m);
  const steps: MissionStep[] = [
    { id: 'understand', label: 'فهمیدن درخواست', status: 'done' },
    { id: 'locate', label: 'پیدا کردن محل', status: 'running' },
    { id: 'search', label: 'پیدا کردن کالا', status: 'pending' },
    { id: 'sellers', label: 'فروشنده‌های نزدیک', status: 'pending' },
    { id: 'verify', label: 'پیگیری از فروشنده‌ها', status: 'pending' },
    ...(m.output.want_plan ? [{ id: 'plan', label: 'برنامه مراجعه', status: 'pending' as const }] : []),
    { id: 'report', label: 'گزارش', status: 'pending' },
  ];
  const emit = (done = false) => ctx.emit?.({ steps: steps.map((s) => ({ ...s })), done });
  const set = (id: string, patch: Partial<MissionStep>) => {
    Object.assign(steps.find((s) => s.id === id)!, patch);
    emit();
  };
  const finish = (result: Omit<MissionResult, 'ui' | 'text' | 'steps' | 'channel' | 'suggested_actions' | 'intent'>): MissionResult => {
    for (const s of steps) if (s.status === 'pending' || s.status === 'running') s.status = 'skipped';
    set('report', { status: 'done', detail: 'گزارش آماده' });
    emit(true);
    return { ui: 'mission', text, steps: steps.map((s) => ({ ...s })), channel: m.channel, intent: m.intent, suggested_actions: result.next_actions, ...result };
  };

  // 1. locate
  let place: GeoPlace | null = null;
  let understood = understoodOf(m);
  steps[0].detail = understood.map((u) => u.label).join('، ');
  emit();
  if (m.location?.text) {
    place = await geocodeText(m.location.text);
    if (!place) {
      const phrase = m.location.text;
      set('locate', { status: 'failed', detail: `«${phrase}» را پیدا نکردم` });
      const chips = placeSuggestions(phrase).map((name) => ({ label: name, text: withPlace(text, phrase, name) }));
      return finish({
        understood,
        band,
        location: { label: st.location.label, lat: st.location.lat, lon: st.location.lon, kind: st.location.source },
        coverage: { requested_radius_m: st.radius_m, used_radius_m: st.radius_m, sellers_in_requested_radius: 0, tried: [] },
        rows: [],
        total_sellers: 0,
        recommendation: null,
        recommendation_note: `محل «${phrase}» را در داده‌ها و فهرست محله‌ها پیدا نکردم.`,
        next_actions: [],
        clarify: { question: `منظورتان از «${phrase}» کدام است؟`, chips },
      });
    }
    st.location = { lat: place.lat, lon: place.lon, label: place.name, source: 'text' };
    // F2: a mall as the location → in-mall mode (rows grouped by floor)
    if (place.kind === 'mall' && place.mall_key) {
      st.mode = 'in_mall';
      st.mall = { key: place.mall_key, name: place.name };
    } else {
      delete st.mode;
      delete st.mall;
    }
    understood = understoodOf(m, place.name);
    steps[0].detail = understood.map((u) => u.label).join('، ');
    set('locate', { status: 'done', detail: `${place.name} پیدا شد` });
  } else {
    set('locate', { status: 'done', detail: `محل فعلی: ${st.location.label}` });
  }
  const requested = m.location?.radius_m ?? (place ? place.radius_m : st.radius_m);
  const location = {
    label: st.location.label,
    lat: st.location.lat,
    lon: st.location.lon,
    kind: place?.kind ?? (st.mode === 'in_mall' ? 'mall' : st.location.source),
    ...(st.mode === 'in_mall' && st.mall ? { mall_key: st.mall.key } : {}),
  };

  // 2. products (band, prefer ones with ≥ 2 sellers)
  set('search', { status: 'running' });
  let productIds: string[] = [];
  const words = m.product ? [m.product.query, m.product.brand && !m.product.query.includes(m.product.brand) ? m.product.brand : null].filter(Boolean).join(' ') : '';
  if (m.product?.product_id) productIds = [m.product.product_id];
  else if (m.product) {
    const res = await productSearch(st, { text: words, budget: band ?? undefined, limit: 6 });
    productIds = [...res.products]
      .sort((a, b) => Number(b.seller_count >= 2) - Number(a.seller_count >= 2))
      .slice(0, 4)
      .map((p) => p.product_id);
  } else {
    const id = st.chosenProduct ?? st.candidates[0];
    if (id) productIds = [id];
  }
  if (!productIds.length) {
    set('search', { status: 'failed', detail: 'کالایی با این مشخصات پیدا نشد' });
    return finish({
      understood,
      band,
      location,
      coverage: { requested_radius_m: requested, used_radius_m: requested, sellers_in_requested_radius: 0, tried: [] },
      rows: [],
      total_sellers: 0,
      recommendation: null,
      recommendation_note: 'پیشنهادی ندارم چون کالایی با این مشخصات در داده‌های ترب پیدا نشد؛ نام کالا یا برند را دقیق‌تر بگویید.',
      next_actions: [],
    });
  }
  const noun = m.product?.product_id ? 'کالای قبلی' : (m.product?.query.split(' ')[0] ?? 'کالا');
  set('search', { status: 'done', detail: m.product?.product_id ? `همان ${m.product.query}` : `${toFaDigits(productIds.length)} ${/^[a-z0-9]/i.test(noun) ? 'مدل' : noun}${band ? ` در بازه ${bandLabel(band)}` : ''}` });

  // 3. sellers, widening the radius until ≥ 3 (or the steps run out)
  set('sellers', { status: 'running' });
  const filters: Filters = {};
  for (const [k, f] of Object.entries(CONDITION_FILTER)) if (m.conditions[k as keyof Mission['conditions']]) (filters as Record<string, unknown>)[f] = true;
  st.filters = { ...filters, ...(m.conditions.open_now ? { open_now: true } : {}) };
  st.intent = m.intent;
  let last: SellersResult | null = null;
  const search = (ids: string[]) =>
    widenUntil(requested, async (r) => {
      last = await findSellers({ product_ids: ids, lat: st.location.lat, lon: st.location.lon, radius_m: r, filters, intent: m.intent, now: ctx.now, price_band: band });
      return last.rows;
    });
  let cov = await search(productIds);
  // a generic request («پاوربانک ۲۰ هزار») is not about these exact models: when they are not sold nearby,
  // look at similar models in the same band too (a model code such as «A17» stays exact)
  let widenedModels = 0;
  if (cov.rows.length < 3 && m.product && !m.product.product_id && !/[a-z]\d/i.test(m.product.query)) {
    const more = await searchProducts({ text: words, categories: st.categories, budget: band ?? undefined, limit: 30 });
    const ids = [...new Set([...productIds, ...more.products.map((p) => p.product_id)])];
    if (ids.length > productIds.length) {
      const wider = await search(ids);
      if (wider.rows.length > cov.rows.length) {
        cov = wider;
        widenedModels = ids.length;
        productIds = ids;
      }
    }
  }
  const final = last as SellersResult | null;
  st.radius_m = cov.used;
  set('sellers', {
    status: 'done',
    detail: `${cov.tried.map((t) => `در ${formatDistance(t.radius_m)}: ${toFaDigits(t.sellers)}`).join(' · ')} فروشنده${widenedModels ? ` (با ${toFaDigits(widenedModels)} مدل مشابه در همین بازه)` : ''}`,
  });
  const titles = new Map(
    (await q<{ product_id: string; persian_title: string }>('SELECT product_id, persian_title FROM products WHERE product_id = ANY($1::text[])', [[...new Set(cov.rows.map((r) => r.product_id).concat(productIds.slice(0, 1)))]])).map(
      (p) => [p.product_id, p.persian_title.split('|')[0].trim()],
    ),
  );

  let sellers: SellerRow[] = cov.rows;
  let conditionsNote: string | undefined;
  if (m.conditions.open_now && sellers.length) {
    const open = sellers.filter((r) => r.open.open === true);
    if (open.length) {
      if (open.length < sellers.length) conditionsNote = `${toFaDigits(sellers.length - open.length)} فروشنده دیگر الان بسته‌اند یا ساعت کاری‌شان ثبت نشده و کنار گذاشته شدند.`;
      sellers = open;
    } else conditionsNote = 'هیچ‌کدام الان باز نیستند (یا ساعت کاری‌شان ثبت نشده)؛ همه را با وضعیت باز/بسته آورده‌ام.';
  }
  const relax = !sellers.length ? final?.relaxations[0] : undefined;
  if (relax) conditionsNote = `با شرط «${relax.label}» فروشنده‌ای پیدا نشد؛ بدون این شرط ${toFaDigits(relax.would_add)} فروشنده هست.`;
  // nothing at all: is it the budget band and/or a condition? (same category, any price, at the widest radius)
  let probeChip: Suggestion | undefined;
  const conditionKeys = Object.keys(CONDITION_FILTER).filter((k) => m.conditions[k as keyof Mission['conditions']]);
  if (!sellers.length && !relax && m.product && !m.product.product_id && (band || conditionKeys.length)) {
    const free = (await searchProducts({ text: words, categories: st.categories, limit: 30 })).products.map((p) => p.product_id);
    if (free.length) {
      const at = async (f: Filters) => (await findSellers({ product_ids: free, lat: st.location.lat, lon: st.location.lon, radius_m: cov.used, filters: f, intent: m.intent, now: ctx.now })).rows;
      const withConditions = conditionKeys.length ? await at(filters) : [];
      const any = withConditions.length ? withConditions : await at({});
      const cheapest = Math.min(...any.map((r) => r.price ?? Infinity));
      const from = Number.isFinite(cheapest) ? ` (ارزان‌ترین ${formatTomanShort(cheapest)} تومان)` : '';
      const labels = conditionKeys.map((k) => CONDITION_LABEL[k]).join('، ');
      if (band && withConditions.length) {
        conditionsNote = `در این شعاع فروشنده‌ای در بازه ${bandLabel(band)} تومان نیست؛ بیرون از این بازه ${toFaDigits(withConditions.length)} فروشنده هست${from}.`;
        probeChip = { kind: 'action', label: 'بدون محدودیت بودجه', text: 'همین را بدون محدودیت بودجه بررسی کن', tool: 'run_mission', input: { text, drop: ['budget'] } };
      } else if (any.length) {
        const drop = [...conditionKeys, ...(band ? ['budget'] : [])];
        conditionsNote = `با شرط «${labels || 'بودجه'}»${band && labels ? ' و این بودجه' : ''} فروشنده‌ای در این شعاع نیست؛ بدون ${drop.length > 1 ? 'این شرط‌ها' : 'این شرط'} ${toFaDigits(any.length)} فروشنده هست${from}.`;
        probeChip = { kind: 'action', label: drop.length > 1 ? 'بدون این شرط‌ها' : `بدون ${labels || 'محدودیت بودجه'}`, text: 'همین را بدون این شرط‌ها بررسی کن', tool: 'run_mission', input: { text, drop } };
      }
    }
  }
  if (m.intent === 'cheapest') sellers = [...sellers].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  else if (m.intent === 'nearest') sellers = [...sellers].sort((a, b) => a.distance_m - b.distance_m);

  // 4. delegated checks: simulated follow-ups, awaited with a deadline
  const followups = new Map<string, FollowupItem>();
  const wantsContact = Boolean(m.verify.contact_sellers || m.verify.availability);
  if (wantsContact && sellers.length) {
    const n = Math.min(5, m.output.top_n ?? (m.output.want_plan ? 3 : 5));
    const targets = sellers.filter((r) => r.price_flag !== 'suspicious_low' && r.price_flag !== 'suspicious_high').slice(0, n);
    set('verify', { status: 'running', detail: `${m.channel === 'call' ? 'تماس با' : 'پیام به'} ${toFaDigits(targets.length)} فروشنده…` });
    const started = await startFollowups({ sessionId: ctx.sessionId, offerIds: targets.map((t) => t.offer_id), channel: m.channel, now: ctx.now });
    for (const it of started) st.followups = { ...st.followups, [it.offer_id]: 'contacting' };
    const waitMs = Math.max(500, Math.min(opts.awaitMs ?? AWAIT_MS, deadline - Date.now()));
    for (const it of await awaitFollowups(started.map((i) => i.id), { timeoutMs: waitMs, sessionId: ctx.sessionId })) {
      followups.set(it.offer_id, it);
      st.followups = { ...st.followups, [it.offer_id]: it.status };
    }
    const count = (s: string) => [...followups.values()].filter((f) => f.status === s).length;
    const parts = [
      [count('confirmed'), 'تأیید'],
      [count('price_changed'), 'قیمت جدید'],
      [count('out_of_stock'), 'ناموجود'],
      [count('no_answer'), 'بی‌پاسخ'],
      [count('contacting') + count('pending'), 'در راه'],
    ].filter(([c]) => Number(c) > 0);
    set('verify', { status: 'done', detail: parts.map(([c, l]) => `${toFaDigits(Number(c))} ${l}`).join(' · ') });
  } else {
    set('verify', {
      status: 'skipped',
      detail: wantsContact ? 'فروشنده‌ای برای پیگیری نبود' : m.verify.price_freshness ? 'تازگی قیمت‌ها از داده ترب گزارش شد' : 'درخواست نشده',
    });
  }

  // 5. report rows with deterministic verdicts
  const rows: MissionRow[] = sellers.slice(0, Math.max(MAX_ROWS, followups.size)).map((r) => {
    const f = followups.get(r.offer_id);
    const base = {
      offer_id: r.offer_id,
      shop_id: r.shop_id,
      product_id: r.product_id,
      shop_name: r.shop_name,
      product_title: titles.get(r.product_id) ?? '',
      price: r.price,
      price_flag: r.price_flag,
      freshness: r.freshness,
      price_age_days: r.price_age_days,
      open: { known: r.open.known, open: r.open.open, label: r.open.label, ...(r.open.opensAt ? { opensAt: r.open.opensAt } : {}) },
      distance_m: r.distance_m,
      lat: r.lat,
      lon: r.lon,
      mall: r.mall,
      followup: f ? { id: f.id, status: f.status, new_price: f.new_price, replied_at: f.resolved_at } : null,
    };
    const v = verdictFor(base, band);
    return { ...base, verdict: v.verdict, verdict_reason: v.reason };
  });
  const recommendation = pickRecommendation(rows, m.intent);
  st.candidates = productIds;
  st.chosenProduct = rows.find((r) => r.offer_id === recommendation?.offer_id)?.product_id ?? rows[0]?.product_id ?? productIds[0];

  // 6. optional visit plan from recommended / confirmed sellers
  let plan: PlanOutput | undefined;
  const planIds = rows.filter((r) => r.verdict === 'recommended' || r.followup?.status === 'confirmed').map((r) => r.offer_id).slice(0, 4);
  if (m.output.want_plan) {
    set('plan', { status: 'running' });
    const res = planIds.length ? await buildPlan({ sessionId: ctx.sessionId, state: st, now: ctx.now, offerIds: planIds }) : null;
    if (res) {
      st.planId = res.plan_id;
      plan = { ui: 'plan', plan_id: res.plan_id, share_path: `/plan/${res.plan_id}`, ...res.payload, suggested_actions: [] };
      set('plan', { status: 'done', detail: `${toFaDigits(planIds.length)} مغازه · حدود ${toFaDigits(res.payload.total_minutes)} دقیقه` });
    } else set('plan', { status: 'skipped', detail: 'فروشنده پیشنهادی یا تأییدشده‌ای برای برنامه نبود' });
  }

  // F11: «الان باز هستند؟» also gets the opening-hours picture of the reported sellers
  let visit: VisitTimeOutput | undefined;
  if (m.verify.hours && rows.length) {
    visit = await visitTime({ scope: 'sellers', shop_ids: rows.map((r) => r.shop_id), title: 'فروشنده‌های این گزارش', state: st, now: ctx.now });
  }

  // coverage: say plainly when the requested area has no / few listed sellers
  let note: string | undefined;
  const nearest = [...sellers].sort((a, b) => a.distance_m - b.distance_m)[0];
  const farFromCentre = haversine(st.location.lat, st.location.lon, DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon) > 3000;
  if (!sellers.length && !relax && !probeChip) {
    note = `در شعاع ${formatDistance(cov.used)} از «${st.location.label}» فروشنده‌ای برای این کالا در داده‌های ترب ثبت نشده است${farFromCentre ? '؛ بیشتر فروشگاه‌های این داده در مرکز شهر (فردوسی، شیخ‌هادی، بهارستان) هستند' : ''}.`;
  } else if (cov.used > requested && nearest) {
    const near = await nearestPlaceName(nearest.lat, nearest.lon);
    note =
      cov.inRequested === 0
        ? `در خود ${st.location.label} (شعاع ${formatDistance(requested)}) فروشنده‌ای برای این کالا در داده‌های ترب ثبت نشده؛ نزدیک‌ترین‌ها در فاصله ${formatDistance(nearest.distance_m)}${near && near !== st.location.label ? ` (${near})` : ''} هستند.`
        : `در شعاع ${formatDistance(requested)} فقط ${toFaDigits(cov.inRequested)} فروشنده ثبت شده بود؛ جست‌وجو تا ${formatDistance(cov.used)} گسترش یافت.`;
  }

  // next steps the user can tap
  const next: Suggestion[] = [];
  if (!plan && planIds.length) next.push({ kind: 'action', label: 'برنامه مراجعه', text: 'برنامه مراجعه را بچین', tool: 'plan_trip', input: { offer_ids: planIds } });
  const uncontacted = rows.filter((r) => !r.followup && r.verdict !== 'avoid').slice(0, 3);
  if (uncontacted.length) {
    const label = `پیگیری ${toFaDigits(uncontacted.length)} تای ${followups.size ? 'بعدی' : 'اول'}`;
    next.push({ kind: 'action', label, text: `موجودی و قیمت ${toFaDigits(uncontacted.length)} فروشنده ${followups.size ? 'بعدی' : 'اول'} را پیگیری کن`, tool: 'contact_seller', input: { offer_ids: uncontacted.map((r) => r.offer_id), channel: m.channel } });
  }
  const oos = rows.find((r) => r.followup?.status === 'out_of_stock');
  if (oos) next.push({ kind: 'action', label: 'جایگزین ناموجود', text: `برای «${oos.shop_name}» جایگزین پیدا کن`, tool: 'find_alternatives', input: { offer_id: oos.offer_id, reason: 'out_of_stock' } });
  if (probeChip) next.push(probeChip);
  if (relax) {
    const key = relax.filter === 'warranty_required' ? 'warranty' : relax.filter;
    next.push({ kind: 'action', label: `بدون شرط ${relax.label}`, text: `همین را بدون شرط «${relax.label}» بررسی کن`, tool: 'run_mission', input: { text, drop: [key] } });
  }
  const wider = COVERAGE_STEPS.find((r) => r > cov.used);
  if (wider && rows.length < 5) next.push({ kind: 'action', label: `شعاع ${formatDistance(wider)}`, text: `همین را در شعاع ${formatDistance(wider)} بررسی کن`, tool: 'run_mission', input: { text, radius_m: wider } });
  if (farFromCentre && (rows.length < 3 || cov.used > requested)) {
    next.push({ kind: 'action', label: 'مرکز شهر را هم ببین', text: 'همین را در مرکز شهر (فردوسی) هم بررسی کن', tool: 'run_mission', input: { text, location_text: 'فردوسی' } });
  }

  return finish({
    understood,
    band,
    location,
    coverage: { requested_radius_m: requested, used_radius_m: cov.used, sellers_in_requested_radius: cov.inRequested, tried: cov.tried, ...(note ? { note } : {}) },
    rows,
    total_sellers: sellers.length,
    recommendation,
    ...(recommendation ? {} : { recommendation_note: noRecommendationNote(rows, band) }),
    ...(conditionsNote ? { conditions_note: conditionsNote } : {}),
    next_actions: next.slice(0, 5),
    ...(plan ? { plan } : {}),
    ...(visit ? { visit_time: visit } : {}),
    ...(followups.size ? { disclaimer: SIM_DISCLAIMER } : {}),
  });
}

/** Compact projection for the LLM: it writes ≤ 3 sentences from this, numbers only from here. */
export function missionForModel(o: MissionResult) {
  return {
    understood: o.understood.map((u) => u.label),
    location: o.location.label,
    coverage_note: o.coverage.note ?? null,
    requested_radius_m: o.coverage.requested_radius_m,
    used_radius_m: o.coverage.used_radius_m,
    sellers_found: o.total_sellers,
    conditions_note: o.conditions_note ?? null,
    recommendation: o.recommendation ? { ...o.recommendation, shop: o.rows.find((r) => r.offer_id === o.recommendation!.offer_id)?.shop_name } : null,
    recommendation_note: o.recommendation_note ?? null,
    clarify: o.clarify?.question ?? null,
    rows: o.rows.slice(0, 6).map((r) => ({
      shop: r.shop_name,
      price: effectivePrice(r),
      freshness: r.freshness,
      price_age_days: r.price_age_days,
      open: r.open.label,
      followup: r.followup?.status ?? null,
      verdict: r.verdict,
      reason: r.verdict_reason,
    })),
    plan: o.plan ? { plan_id: o.plan.plan_id, total_minutes: o.plan.total_minutes } : null,
    next_steps: o.next_actions.map((s) => s.label),
  };
}
