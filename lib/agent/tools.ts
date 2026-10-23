import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { compareProducts } from '../search/products';
import { productSearch } from './product-search';
import { findSellers, shopDetails } from '../search/sellers';
import { geocodeText } from './mission/geocode';
import { normalizeForSearch } from '../fa/normalize';
import { q } from '../db/client';
import { formatDistance, formatTomanShort } from '../fa/format';
import { toFaDigits } from '../fa/digits';
import { FACTOR_LABEL, FILTER_LABEL, INTENT_WEIGHTS, type Breakdown, type Filters, type Weights } from '../search/score';
import { paymentWording } from '../data/trust';
import type { SessionState } from './state';
import type { Suggestion } from './suggest';
import { SIM_DISCLAIMER, startFollowups } from '../sim/followups';
import { findAlternatives } from '../search/alternatives';
import { purchaseChecklist } from './checklist';
import { buildPlan } from '../plan/service';
import { visitTime, type VisitTimeOutput } from '../search/visit-time';
import { specProductIds, specQa, type SpecAnswerOutput } from './spec-qa';
import { sellerMessage, type SellerMessageOutput } from '../sim/seller-message';
import { bargainingCard, type BargainOutput } from '../search/market';
import { mallView, type MallViewOutput } from '../search/mall-view';
import { loadPlaces } from '../search/places';
import { basketPlan, resolveBasketItem, resolveBasketItems, type BasketOutput, type BasketPlanOutput } from '../plan/basket-service';
import { modelCodeOf } from '../plan/basket';
import { photoMatch, VisionInput, type PhotoMatchOutput } from '../vision/photo-match';
import { isMission } from './mission/extract';
import { haversine } from '../geo';
import { WEEK, visitSentence } from '../data/hours-stats';
import { atLocalTime, FA_DAY } from '../data/hours';
import { extractMission } from './mission/extract';
import { applyOverrides, missionForModel, runMission } from './mission/run';
import type { MissionProgress, MissionResult } from './mission/types';
import type {
  AlternativesOutput,
  ChecklistOutput,
  ClarifyOutput,
  CompareOutput,
  ContextOutput,
  FollowupsOutput,
  PlanOutput,
  ProductsOutput,
  SellersOutput,
  ShopOutput,
} from './types';

export { SIM_DISCLAIMER } from '../sim/followups';

export type RankExplainOutput = {
  ui: 'rank_explain';
  rank: number;
  count: number;
  shop_name: string;
  shop_id: string;
  offer_id: string;
  why: string[];
  breakdown: Breakdown;
  weights: Weights;
  intent: string;
  next: { shop_name: string; score: number } | null;
};

export type ToolCtx = {
  sessionId: string;
  state: SessionState;
  now: Date;
  /** writes a custom UI stream part (mission progress) when the request streams */
  write?: (part: { type: `data-${string}`; id?: string; data: unknown }) => void;
  /** false = rules only (no LLM calls inside tools), e.g. golden scripts */
  llm?: boolean;
};

type Def<I extends z.ZodType, O> = {
  description: string;
  input: I;
  run: (input: z.infer<I>, ctx: ToolCtx) => Promise<O>;
  /** compact projection the LLM sees (the UI always gets the full output) */
  toModel: (output: O) => unknown;
};

const def = <I extends z.ZodType, O>(d: Def<I, O>) => d;

const INTENT_LABEL: Record<string, string> = { balanced: 'متعادل', cheapest: 'ارزان‌ترین', nearest: 'نزدیک‌ترین', now: 'الان باز' };

const FiltersInput = z
  .object({
    open_now: z.boolean(),
    installment: z.boolean(),
    torobpay: z.boolean(),
    fast_delivery: z.boolean(),
    warranty_required: z.boolean(),
    hide_stale: z.boolean(),
    hide_suspicious: z.boolean(),
  })
  .partial();
// no max_price here: a budget said in chat stays state.budget; the hard price cap is the ContextBar's (#25)

function mallText(m: SellersOutput['rows'][number]['mall']): string | null {
  if (!m) return null;
  return [m.name, m.floor_label, m.unit_label ? `${m.unit_kind ?? 'واحد'} ${m.unit_label}` : null].filter(Boolean).join(' · ');
}

function sellerSuggestions(out: Omit<SellersOutput, 'suggested_actions'>, state: SessionState): Suggestion[] {
  const s: Suggestion[] = [];
  const top3 = out.rows.slice(0, 3).map((r) => r.offer_id);
  if (top3.length) {
    s.push({ kind: 'action', label: `پیگیری ${toFaDigits(top3.length)} تای اول`, text: `موجودی و قیمت ${toFaDigits(top3.length)} فروشنده اول را پیگیری کن`, tool: 'contact_seller', input: { offer_ids: top3, channel: 'message' } });
  }
  if (out.radius_suggestion) {
    s.push({ kind: 'patch', label: `شعاع ${formatDistance(out.radius_suggestion.radius_m)}`, patch: { radius_m: out.radius_suggestion.radius_m } });
  }
  if (!state.filters.open_now && out.rows.some((r) => r.open.open === false)) s.push({ kind: 'patch', label: 'فقط باز الان', patch: { filters: { open_now: true } } });
  if (state.intent !== 'cheapest') s.push({ kind: 'patch', label: 'ارزان‌ترین‌ها اول', patch: { intent: 'cheapest' } });
  s.push({ kind: 'message', label: 'چرا این اول شد؟', text: 'چرا این اول شد؟' });
  return s;
}

function basketSuggestions(st: SessionState): Suggestion[] {
  return (st.basket?.length ?? 0) >= 2 ? [{ kind: 'action', label: 'برنامه‌ی یکجا', text: 'همه‌ی قلم‌های سبد را یکجا برنامه بچین', tool: 'basket_plan', input: {} }] : [];
}

export const TOOL_DEFS = {
  clarify_need: def({
    description:
      'Ask ONE short clarifying question with up to 4 tappable answer chips. Use only when budget or use-case is missing AND the request is too broad (e.g. spans >3 categories). Never twice in a row.',
    input: z.object({ question: z.string().max(140), chips: z.array(z.string().max(40)).min(2).max(4) }),
    run: async (i): Promise<ClarifyOutput> => ({ ui: 'clarify', question: i.question, chips: i.chips }),
    toModel: (o) => ({ shown_question: o.question, chips: o.chips }),
  }),

  search_products: def({
    description:
      'Step 1: find candidate products for a need («گوشی سامسونگ تا ۶۰ میلیون»). Pass the user words in `text`; budget in toman if known. Returns ≤4 cards with a templated «why». Updates session candidates.',
    input: z.object({
      text: z.string().min(1).max(200).describe('what the user wants, in Persian, as they said it'),
      budget_max: z.number().positive().nullable().optional(),
      budget_min: z.number().positive().nullable().optional(),
      must_have: z.array(z.string()).max(5).optional(),
      limit: z.number().int().min(2).max(8).optional(),
    }),
    run: async (i, ctx): Promise<ProductsOutput> => {
      const hinted = i.budget_max || i.budget_min ? { max: i.budget_max ?? undefined, min: i.budget_min ?? undefined } : undefined;
      const text = [i.text, ...(i.must_have ?? [])].join(' ');
      const res = await productSearch(ctx.state, { text, budget: hinted, limit: i.limit });
      ctx.state.need = i.text;
      const suggested: Suggestion[] = res.products.slice(0, 2).map((p) => ({
        kind: 'action',
        label: `فروشنده‌های ${p.title.split('|')[0].trim().slice(0, 28)}`,
        text: `فروشنده‌های نزدیکِ «${p.title}» را نشان بده`,
        tool: 'find_sellers',
        input: { product_id: p.product_id },
      }));
      if (res.products.length >= 2) {
        suggested.push({ kind: 'action', label: 'مقایسه دو گزینه اول', text: 'دو گزینه اول را مقایسه کن', tool: 'compare_products', input: { product_ids: res.products.slice(0, 2).map((p) => p.product_id) } });
      }
      return { ui: 'products', ...res, suggested_actions: suggested };
    },
    toModel: (o) => ({
      budget_toman: o.budget ?? null,
      budget_relaxed: o.budget_relaxed,
      categories: o.categories,
      products: o.products.map((p) => ({
        product_id: p.product_id,
        title: p.title,
        sellers: p.seller_count,
        min_price: p.min_price,
        median_price: p.median_price,
        budget_note: p.budget_note,
        why: p.why,
        specs: p.key_specs.map((s) => `${s.k}: ${s.v}`).join('؛ '),
      })),
    }),
  }),

  compare_products: def({
    description: 'Step 1: side-by-side comparison of 2–4 products (differing specs only + price/seller rows).',
    input: z.object({ product_ids: z.array(z.string()).min(2).max(4) }),
    run: async (i): Promise<CompareOutput> => ({ ui: 'compare', ...(await compareProducts(i.product_ids)) }),
    toModel: (o) => ({ products: o.products.map((p) => ({ product_id: p.product_id, title: p.title })), rows: o.rows.slice(0, 10) }),
  }),

  set_context: def({
    description:
      'Change search context from conversation: location by place name («نزدیک تجریش», «پاساژ علاءالدین»), radius («تا ۲ کیلومتر»), filters («فقط قسطی», «الان باز»), ranking intent, or the chosen product. Call this BEFORE find_sellers when the user mentions any of these.',
    input: z.object({
      location_text: z
        .string()
        .max(80)
        .optional()
        .describe('a DIFFERENT place the user named («نزدیک تجریش», «پاساژ علاءالدین»); omit for «نزدیک من»/«اطراف من» — that is the current location'),
      radius_m: z.number().int().min(200).max(20000).optional(),
      filters: FiltersInput.optional(),
      intent: z.enum(['balanced', 'cheapest', 'nearest', 'now']).optional(),
      chosen_product: z.string().optional().describe('product_id'),
    }),
    run: async (i, ctx): Promise<ContextOutput> => {
      const st = ctx.state;
      const changes: string[] = [];
      let unresolved: string | undefined;
      const sameAsCurrent = (t: string) => normalizeForSearch(st.location.label.replace(/\(.*?\)/g, '')) === normalizeForSearch(t);
      if (i.location_text && !/^(من|خودم|اینجا|همین جا|همینجا)$/u.test(i.location_text.trim()) && !sameAsCurrent(i.location_text)) {
        const place = await geocodeText(i.location_text);
        if (place) {
          st.location = { lat: place.lat, lon: place.lon, label: place.name, source: 'text' };
          changes.push(`📍 ${place.name}`);
          // a mall is a building: search right around it unless the user also gave a radius (F2: in-mall mode)
          if (place.kind === 'mall' && !i.radius_m && st.radius_m > 500) {
            st.radius_m = place.radius_m;
            changes.push(`شعاع ${formatDistance(place.radius_m)}`);
          }
          if (place.kind === 'mall' && place.mall_key) {
            st.mode = 'in_mall';
            st.mall = { key: place.mall_key, name: place.name };
          } else {
            delete st.mode;
            delete st.mall;
          }
        } else unresolved = i.location_text;
      }
      if (i.radius_m) {
        st.radius_m = i.radius_m;
        changes.push(`شعاع ${formatDistance(i.radius_m)}`);
      }
      if (i.filters) {
        const f = { ...st.filters } as Filters;
        for (const [k, v] of Object.entries(i.filters)) {
          const key = k as keyof Filters;
          if (v === null || v === false) {
            delete f[key];
            changes.push(`بدون ${FILTER_LABEL[key]}`);
          } else {
            (f as Record<string, unknown>)[key] = v;
            changes.push(key === 'max_price' ? `تا ${formatTomanShort(Number(v))} تومان` : FILTER_LABEL[key]);
          }
        }
        st.filters = f;
      }
      if (i.intent) {
        st.intent = i.intent;
        changes.push(`ترتیب: ${INTENT_LABEL[i.intent]}`);
      }
      if (i.chosen_product) st.chosenProduct = i.chosen_product;
      return { ui: 'context', changes, unresolved_location: unresolved, location: st.location, radius_m: st.radius_m, intent: st.intent, filters: st.filters };
    },
    toModel: (o) => ({ changes: o.changes, unresolved_location: o.unresolved_location ?? null, location: o.location.label, radius_m: o.radius_m, filters: o.filters, intent: o.intent }),
  }),

  find_sellers: def({
    description:
      'Steps 2–3: shops that list the product near the session location, filtered and ranked (price, distance, freshness, open now, conditions). Uses the session context; product_id defaults to the chosen product. Returns top rows, mall clusters, category-only shops and relaxation hints.',
    input: z.object({ product_id: z.string().optional() }),
    run: async (i, ctx): Promise<SellersOutput> => {
      const st = ctx.state;
      const productId = i.product_id ?? st.chosenProduct ?? st.candidates[0];
      if (!productId) throw new Error('هنوز کالایی انتخاب نشده است');
      st.chosenProduct = productId;
      const res = await findSellers({
        product_ids: [productId],
        lat: st.location.lat,
        lon: st.location.lon,
        radius_m: st.radius_m,
        filters: st.filters,
        intent: st.intent,
        now: ctx.now,
      });
      const suggested = sellerSuggestions({ ui: 'sellers', ...res }, st);
      // F2: standing in (or right next to) a mall → its floor-by-floor view
      const mall = (await loadPlaces()).find((p) => p.kind === 'mall' && p.mall_key && haversine(st.location.lat, st.location.lon, p.lat, p.lon) <= 150);
      if (mall?.mall_key) suggested.unshift({ kind: 'action', label: `نمای داخل ${mall.name}`, text: `الان توی ${mall.name} هستم؛ طبقه‌به‌طبقه نشان بده`, tool: 'mall_view', input: { mall_key: mall.mall_key } });
      return { ui: 'sellers', ...res, suggested_actions: suggested };
    },
    toModel: (o) => ({
      product: o.product?.title,
      product_median_price: o.product?.median_price,
      location_radius_m: o.params.radius_m,
      filters: o.params.filters,
      intent: o.params.intent,
      count: o.count,
      total_in_radius_before_filters: o.total_in_radius,
      clusters: o.clusters.map((c) => ({ mall: c.mall_name, sellers: c.count, best_price: c.best_price })),
      relaxations: o.relaxations,
      radius_suggestion: o.radius_suggestion,
      category_only_shops: o.maybe_shops.length,
      top: o.rows.slice(0, 6).map((r, idx) => ({
        rank: idx + 1,
        offer_id: r.offer_id,
        shop_id: r.shop_id,
        shop: r.shop_name,
        price: r.price,
        price_flag: r.price_flag,
        price_age_days: r.price_age_days,
        freshness: r.freshness,
        distance_m: r.distance_m,
        open: r.open.label,
        mall: mallText(r.mall),
        installment: r.conditions.installment,
        torobpay: r.conditions.torobpay,
        warranty: r.conditions.warranty_text,
        score: r.score,
        score_breakdown: r.score_breakdown,
        info_completeness: r.trust ? `${r.trust.score}/3` : null,
        why: r.why,
      })),
    }),
  }),

  explain_rank: def({
    description:
      '«چرا این اول شد؟»: why a seller of the current list ranks where it does (default: the first), from its score breakdown — share of each factor and the intent weights. Never explain a ranking from memory.',
    input: z.object({ offer_id: z.string().optional(), rank: z.number().int().min(1).max(50).optional() }),
    run: async (i, ctx): Promise<RankExplainOutput> => {
      const st = ctx.state;
      const productId = st.chosenProduct ?? st.candidates[0];
      if (!productId) throw new Error('هنوز فهرست فروشنده‌ای نداریم.');
      const res = await findSellers({ product_ids: [productId], lat: st.location.lat, lon: st.location.lon, radius_m: st.radius_m, filters: st.filters, intent: st.intent, now: ctx.now });
      const idx = i.offer_id ? res.rows.findIndex((r) => r.offer_id === i.offer_id) : (i.rank ?? 1) - 1;
      const row = res.rows[idx];
      if (!row) throw new Error('این ردیف در فهرست فعلی نیست.');
      const next = res.rows[idx + 1];
      return {
        ui: 'rank_explain',
        rank: idx + 1,
        count: res.rows.length,
        shop_name: row.shop_name,
        shop_id: row.shop_id,
        offer_id: row.offer_id,
        why: row.why,
        breakdown: row.score_breakdown,
        weights: INTENT_WEIGHTS[st.intent],
        intent: st.intent,
        next: next ? { shop_name: next.shop_name, score: next.score } : null,
      };
    },
    toModel: (o) => ({
      rank: o.rank,
      shop: o.shop_name,
      why: o.why,
      shares_percent: Object.fromEntries((Object.keys(FACTOR_LABEL) as Array<keyof Weights>).map((k) => [FACTOR_LABEL[k], Math.round(o.breakdown[k] * 100)])),
      weights_percent: Object.fromEntries((Object.keys(FACTOR_LABEL) as Array<keyof Weights>).map((k) => [FACTOR_LABEL[k], Math.round(o.weights[k] * 100)])),
      total: o.breakdown.total,
      next: o.next,
    }),
  }),

  shop_details: def({
    description: 'Mall/floor/unit, today’s hours, payment conditions and up to 5 other offers of the same category in one shop.',
    input: z.object({ shop_id: z.string() }),
    run: async (i, ctx): Promise<ShopOutput> => {
      const cat = ctx.state.chosenProduct
        ? (await q<{ category_name: string | null }>('SELECT category_name FROM products WHERE product_id = $1', [ctx.state.chosenProduct]))[0]?.category_name
        : null;
      const d = await shopDetails(i.shop_id, { category: cat, excludeProductId: ctx.state.chosenProduct, now: ctx.now });
      if (!d) throw new Error('فروشگاه پیدا نشد');
      return { ui: 'shop', ...d };
    },
    toModel: (o) => ({
      shop: o.shop_name,
      mall: o.mall ? [o.mall.name, o.mall.floor_label, o.mall.unit_label].filter(Boolean).join(' · ') : null,
      open: o.open.label,
      today_hours: o.today_hours,
      payment: paymentWording(o.payment_options),
      info_completeness: { score: `${o.trust.score}/3`, reasons: o.trust.reasons.map((r) => r.label), website: Boolean(o.trust.website_url), instagram: Boolean(o.trust.instagram_url) },
      same_category_products: o.same_category_count,
      other_offers: o.other_offers.map((x) => ({ title: x.title, price: x.price, price_age_days: x.price_age_days })),
    }),
  }),

  contact_seller: def({
    description:
      'Step 4: follow up with sellers (simulated message or call) to confirm stock and today\'s price. Starts asynchronous follow-ups; results appear on the follow-up board within seconds. Use for up to 5 offers.',
    input: z.object({
      offer_ids: z.array(z.string()).min(1).max(5),
      channel: z.enum(['message', 'call']).default('message'),
      question: z.string().max(140).optional(),
    }),
    run: async (i, ctx): Promise<FollowupsOutput> => {
      const items = await startFollowups({ sessionId: ctx.sessionId, offerIds: i.offer_ids, channel: i.channel, question: i.question, now: ctx.now });
      for (const it of items) ctx.state.followups = { ...ctx.state.followups, [it.offer_id]: 'contacting' };
      return { ui: 'followups', channel: i.channel, items, disclaimer: SIM_DISCLAIMER, suggested_actions: [] };
    },
    toModel: (o) => ({
      started: o.items.map((x) => ({ followup_id: x.id, offer_id: x.offer_id, shop: x.shop_name, status: x.status })),
      note: 'Results arrive asynchronously on the board; the UI will ask for alternatives automatically if a seller is out of stock.',
    }),
  }),

  find_alternatives: def({
    description:
      'Step 4: when a seller is out of stock, changed the price, did not answer or is closed — (a) the same product at other sellers (same mall first) and (b) similar products in the same shop/mall within ±20% price. Call it WITHOUT asking after an out_of_stock follow-up.',
    input: z.object({ offer_id: z.string(), reason: z.enum(['out_of_stock', 'price_changed', 'closed', 'no_answer']) }),
    run: async (i, ctx): Promise<AlternativesOutput> => {
      const st = ctx.state;
      const bad = Object.entries(st.followups)
        .filter(([, v]) => v === 'out_of_stock' || v === 'no_answer')
        .map(([offer]) => offer);
      const badShops = bad.length ? (await q<{ shop_id: string }>('SELECT shop_id FROM offers WHERE offer_id = ANY($1::text[])', [bad])).map((r) => r.shop_id) : [];
      const res = await findAlternatives({ offerId: i.offer_id, reason: i.reason, lat: st.location.lat, lon: st.location.lon, radius_m: st.radius_m, now: ctx.now, excludeShopIds: badShops });
      if (!res) throw new Error('پیشنهاد اولیه پیدا نشد');
      const suggested: Suggestion[] = res.same_product.length
        ? [{ kind: 'action', label: 'پیگیری جایگزین اول', text: `موجودی «${res.same_product[0].shop_name}» را هم پیگیری کن`, tool: 'contact_seller', input: { offer_ids: [res.same_product[0].offer_id], channel: 'message' } }]
        : [];
      return { ui: 'alternatives', ...res, suggested_actions: suggested };
    },
    toModel: (o) => ({
      reason: o.reason,
      origin: { shop: o.origin.shop_name, mall: o.origin.mall_name },
      same_product: o.same_product.map((r) => ({ offer_id: r.offer_id, shop: r.shop_name, price: r.price, distance_m: r.distance_m, same_mall: r.same_mall, mall: mallText(r.mall), open: r.open.label })),
      similar: o.similar.map((x) => ({ offer_id: x.offer_id, title: x.title, price: x.price, shop: x.shop_name, why: x.why })),
    }),
  }),

  plan_trip: def({
    description:
      'Visit plan: orders the chosen shops (default: shortlist + confirmed/pending follow-ups) by mall and distance, floors ascending inside a mall, with ETA, open-at-arrival checks and navigation links. Returns a shareable link.',
    input: z.object({
      offer_ids: z.array(z.string()).max(8).optional(),
      start_at: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('HH:MM local start time («شروع از ۱۱:۰۰»)'),
      day_offset: z.number().int().min(0).max(7).optional(),
    }),
    run: async (i, ctx): Promise<PlanOutput> => {
      const now = i.start_at ? atLocalTime(ctx.now, i.start_at, i.day_offset ?? 0) : ctx.now;
      const res = await buildPlan({ sessionId: ctx.sessionId, state: ctx.state, now, offerIds: i.offer_ids });
      if (!res) throw new Error('هنوز فروشنده‌ای برای برنامه انتخاب نشده؛ اول پیگیری کنید یا «به برنامه» را بزنید.');
      ctx.state.planId = res.plan_id;
      const suggested: Suggestion[] = ctx.state.checklistOffered
        ? []
        : [{ kind: 'action', label: 'چک‌لیست خرید', text: 'چک‌لیست خرید حضوری را بده', tool: 'purchase_checklist', input: {} }];
      // F11: the plan starts outside the hours most of its shops are open → offer a better start
      const hint = res.payload.visit?.start_hint;
      if (hint) {
        const when = hint.day_offset === 0 ? '' : hint.day_offset === 1 ? 'فردا ' : `${FA_DAY[WEEK[(WEEK.indexOf(res.payload.visit!.day) + hint.day_offset) % 7]]} `;
        const offerIds = res.payload.groups.flatMap((g) => g.steps.map((st) => st.offer_id));
        suggested.unshift({ kind: 'action', label: `شروع ${when}از ${toFaDigits(hint.at)}`, text: `برنامه را برای ${when}ساعت ${toFaDigits(hint.at)} بچین`, tool: 'plan_trip', input: { offer_ids: offerIds, start_at: hint.at, day_offset: hint.day_offset } });
      }
      return { ui: 'plan', plan_id: res.plan_id, share_path: `/plan/${res.plan_id}`, ...res.payload, suggested_actions: suggested };
    },
    toModel: (o) => ({
      plan_id: o.plan_id,
      total_minutes: o.total_minutes,
      warnings: o.warnings,
      steps: o.groups.flatMap((g) => g.steps.map((s) => ({ order: s.order, shop: s.shop_name, mall: s.mall, floor: s.floor_label, unit: s.unit_label, eta: s.eta_label, open_at_eta: s.open_at_eta.label, warning: s.warning }))),
    }),
  }),

  run_mission: def({
    description:
      'Multi-goal shopping mission, executed end to end and reported once: product in a budget band, a named Tehran area (radius widened honestly when the area has few listed sellers), open/closed now, simulated follow-ups with the sellers (awaited for a few seconds), optional visit plan. MUST be called — with the user message verbatim in `text` — when a message has two or more goals (product + place, product + checks, place + conditions …) or delegates a check: «خودت بپرس»، «بپرس»، «چک کن»، «پیگیری کن»، «ببین باز هستن»، «مطمئن شو»، «زنگ بزن». Do not call other tools for the same request.',
    input: z.object({
      text: z.string().min(2).max(400).describe('the user message, verbatim'),
      radius_m: z.number().int().min(100).max(20000).optional(),
      location_text: z.string().max(80).optional().describe('replace the place in the message'),
      drop: z.array(z.string().max(20)).max(6).optional().describe('constraints to remove: budget, location, open_now, installment, torobpay, fast_delivery, warranty, verify, plan'),
    }),
    run: async (i, ctx): Promise<MissionResult> => {
      const progressId = `mission_${Date.now().toString(36)}`;
      const emit = (p: MissionProgress) => ctx.write?.({ type: 'data-mission-progress', id: progressId, data: p });
      emit({ steps: [{ id: 'understand', label: 'فهمیدن درخواست', status: 'running' }], done: false });
      const draft = await extractMission(i.text, ctx.state, { llm: ctx.llm !== false });
      const mission = applyOverrides(draft.mission, { radius_m: i.radius_m, location_text: i.location_text, drop: i.drop });
      const res = await runMission(mission, i.text, { ...ctx, emit });
      const overrides = { radius_m: i.radius_m, location_text: i.location_text, drop: i.drop };
      return Object.values(overrides).some(Boolean) ? { ...res, overrides } : res;
    },
    toModel: (o) => missionForModel(o),
  }),

  photo_search: def({
    description:
      'Photo search (UI only — the app calls it after the user sends a photo; never call it yourself): the identified brand/model/type → top 3 products, a shelf price against the market and nearby sellers; with a request in `text` that is a mission, the mission runs on the matched product.',
    input: z.object({ vision: VisionInput, text: z.string().max(300).optional() }),
    run: async (i, ctx): Promise<PhotoMatchOutput> => {
      const out = await photoMatch({ vision: i.vision, state: ctx.state, now: ctx.now });
      const top = out.candidates[0];
      if (!i.text?.trim() || !top) return out;
      const draft = await extractMission(i.text, ctx.state, { llm: false });
      if (!isMission(draft.mission, { hasProductContext: true })) return out;
      const progressId = `mission_${Date.now().toString(36)}`;
      const emit = (p: MissionProgress) => ctx.write?.({ type: 'data-mission-progress', id: progressId, data: p });
      ctx.state.chosenProduct = top.product_id;
      const mission = { ...draft.mission, product: { query: out.query ?? top.title, product_id: top.product_id } };
      return { ...out, mission: await runMission(mission, i.text, { ...ctx, emit }), suggested_actions: [] };
    },
    toModel: (o) => ({
      recognized: o.recognized,
      identified: o.label,
      message: o.message,
      candidates: o.candidates.map((c) => ({ product_id: c.product_id, title: c.title.split('|')[0].trim(), sellers: c.seller_count, median_price: c.median_price })),
      shelf_price: o.shelf ? { price: o.shelf.price, market_median: o.shelf.stats?.median ?? null, position: o.shelf.position, delta_pct: o.shelf.delta_pct, cheaper_nearby: o.shelf.cheaper_nearby, cheapest_nearby: o.shelf.nearby[0] ?? null } : null,
      ...(o.mission ? { mission: missionForModel(o.mission) } : {}),
    }),
  }),

  best_time_to_visit: def({
    description:
      '«کی برم؟»: from the weekly opening hours of the current seller list (scope sellers), a mall (mall_key) or one shop (shop_id) — share of open shops per hour for each day, the best window, Friday closures and shops without hours. Use for «کی برم؟», «چه ساعتی بازن؟», «جمعه بازه؟».',
    input: z.object({
      scope: z.enum(['sellers', 'mall', 'shop']).default('sellers'),
      mall_key: z.string().optional(),
      shop_id: z.string().optional(),
      day: z.enum(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']).optional(),
    }),
    run: async (i, ctx): Promise<VisitTimeOutput> => visitTime({ ...i, state: ctx.state, now: ctx.now }),
    toModel: (o) => {
      const day = o.days.find((d) => d.day === o.day)!;
      const fri = o.days.find((d) => d.day === 'fri') ?? null;
      return { title: o.title, shops: o.shops, day: FA_DAY[o.day], window: day.window ? { from: day.window.start, to: day.window.end, open_share: day.window.coverage } : null, friday_closed_share: fri?.closedShare ?? null, hours_unknown: day.unknown, sentence: visitSentence(day, fri, o.noun) };
    },
  }),

  product_specs_qa: def({
    description:
      'Answer a factual question about the chosen product or two products («NFC داره؟»، «وزنش چنده؟»، «باتری؟»، «فرقش با اون یکی؟») strictly from their registered specs, with the evidence rows. Call it for ANY factual product question; never answer specs from memory. product_ids defaults to the chosen product (two candidates when comparing).',
    input: z.object({ question: z.string().min(2).max(200), product_ids: z.array(z.string()).max(3).optional() }),
    run: async (i, ctx): Promise<SpecAnswerOutput> => specQa(i.question, specProductIds(i.question, ctx.state, i.product_ids)),
    toModel: (o) => ({ answer: o.answer, evidence: o.evidence.slice(0, 6).map((e) => `${e.key}: ${e.value}`), products: o.products.map((p) => p.title), note: 'Repeat the answer; add nothing that is not in the evidence.' }),
  }),

  compose_seller_message: def({
    description:
      'A ready-to-send message the USER can send to a shop themselves (WhatsApp / SMS / copy): greeting, product, listed price and its age in Torob, the question (availability, price — optionally a target price, hours, reserve, custom note) and the mall/floor/unit to confirm. Use when the user wants to contact the shop personally («خودم پیام بدم», «متن پیام بده»).',
    input: z.object({
      offer_id: z.string(),
      intent: z.enum(['availability', 'price', 'hours', 'reserve', 'custom']).default('availability'),
      note: z.string().max(200).optional(),
      target_price: z.number().positive().optional(),
    }),
    run: async (i): Promise<SellerMessageOutput> => sellerMessage(i),
    toModel: (o) => ({ shop: o.shop_name, intent: o.intent, text: o.text, channels: o.channels.map((c) => c.type), note: o.disclaimer }),
  }),

  bargaining_card: def({
    description:
      'Before walking in: where an offer\'s listed price sits in the market (min/median/max over sane prices), the nearest cheaper seller in the current radius, warranty and freshness notes, ≤ 4 talking points and a fair target price (only when the offer is above it). Use for «چانه بزنم؟», «قیمتش منصفانه است؟», «چقدر تخفیف بگیرم؟».',
    input: z.object({ offer_id: z.string() }),
    run: async (i, ctx): Promise<BargainOutput> => bargainingCard({ offer_id: i.offer_id, state: ctx.state, now: ctx.now }),
    toModel: (o) => ({ shop: o.shop_name, price: o.price, median: o.stats.median, sellers: o.stats.n, position: o.position, delta_pct: o.delta_pct, cheaper_nearby: o.cheaper_nearby, target_price: o.target_price, fair: o.fair, talking_points: o.talking_points }),
  }),

  mall_view: def({
    description:
      '«الان توی پاساژم»: one mall floor by floor — sellers of the chosen product first (three-field prices), then same-category shops without an offer («همسایه جایگزین»), then the rest; opening hours of the mall and nearby malls. Sets in-mall mode (location = mall centroid, radius 300 m). mall_key defaults to the in-mall mall.',
    input: z.object({ mall_key: z.string().optional(), product_id: z.string().optional(), category: z.string().optional() }),
    run: async (i, ctx): Promise<MallViewOutput> => {
      const st = ctx.state;
      const key = i.mall_key ?? st.mall?.key;
      if (!key) throw new Error('کدام پاساژ؟ نام پاساژ را بگویید.');
      const out = await mallView({ mall_key: key, product_id: i.product_id, category: i.category, state: st, now: ctx.now });
      st.location = { lat: out.mall.lat, lon: out.mall.lon, label: out.mall.name, source: 'text' };
      st.radius_m = 300;
      st.mode = 'in_mall';
      st.mall = { key, name: out.mall.name };
      return out;
    },
    toModel: (o) => ({
      mall: o.mall.name,
      shops: o.mall.shop_count,
      product: o.product?.title ?? null,
      sellers_in_mall: o.sellers,
      floors: o.mall.floors.map((f) => ({ floor: f.title, shops: f.shops.length, sellers: f.sellers, neighbours: f.neighbours })),
      hours: o.hours_summary,
      nearby_malls: o.nearby_malls,
    }),
  }),

  basket_add: def({
    description:
      '«کاور و گلس هم می‌خوام»: add one or more lines to the «یکجا» basket (each line = the user words for one item, e.g. «کاور A17»، «گلس»، «پاوربانک ۲۰ هزار»). Each line is matched to products; the session search is not changed.',
    input: z.object({ items: z.array(z.string().min(2).max(80)).min(1).max(6) }),
    run: async (i, ctx): Promise<BasketOutput> => {
      const st = ctx.state;
      const have = new Set((st.basket ?? []).map((it) => normalizeForSearch(it.text)));
      const fresh = [...new Set(i.items.map((t) => t.trim()))].filter((t) => !have.has(normalizeForSearch(t)));
      const hint = [...(st.basket ?? []).map((it) => it.text), ...fresh].map(modelCodeOf).find(Boolean) ?? null;
      const added = await Promise.all(fresh.map((t) => resolveBasketItem(t, st, hint)));
      st.basket = [...(st.basket ?? []), ...added].slice(0, 8);
      return { ui: 'basket', added: added.map((a) => a.text), removed: [], items: st.basket, suggested_actions: basketSuggestions(st) };
    },
    toModel: (o) => ({ added: o.added, basket: o.items.map((it) => ({ id: it.id, text: it.text, matched: it.title })) }),
  }),

  basket_remove: def({
    description: 'Remove a line from the «یکجا» basket by its id (see session state) or by its words; «سبد را خالی کن» → all: true.',
    input: z.object({ item_id: z.string().optional(), text: z.string().optional(), all: z.boolean().optional() }),
    run: async (i, ctx): Promise<BasketOutput> => {
      const st = ctx.state;
      const items = st.basket ?? [];
      const norm = i.text ? normalizeForSearch(i.text) : null;
      const gone = items.filter((it) => i.all || it.id === i.item_id || (norm && normalizeForSearch(it.text).includes(norm)));
      st.basket = items.filter((it) => !gone.includes(it));
      return { ui: 'basket', added: [], removed: gone.map((g) => g.text), items: st.basket, suggested_actions: basketSuggestions(st) };
    },
    toModel: (o) => ({ removed: o.removed, basket: o.items.map((it) => it.text) }),
  }),

  basket_plan: def({
    description:
      '«همه یکجا»: one seller per basket item, as many items as possible in one mall (then the nearest seller for the rest), as a visit plan. `items` replaces the basket (the lines of a multi-item request); `location_text` moves the search like set_context; `verify: true` follows up all picked sellers (simulated, awaited) and re-plans items that are out of stock.',
    input: z.object({
      items: z.array(z.string().min(2).max(80)).min(2).max(8).optional(),
      location_text: z.string().max(80).optional(),
      verify: z.boolean().optional(),
    }),
    run: async (i, ctx): Promise<BasketPlanOutput> => {
      const st = ctx.state;
      if (i.location_text) await TOOL_DEFS.set_context.run({ location_text: i.location_text }, ctx);
      if (i.items?.length) st.basket = await resolveBasketItems(i.items.map((t) => t.trim()), st);
      return basketPlan({ state: st, sessionId: ctx.sessionId, now: ctx.now, verify: i.verify });
    },
    toModel: (o) => ({
      summary: o.summary,
      location: o.location,
      coverage: o.coverage,
      items: o.items.map((it) => ({
        item: it.text,
        shop: it.pick?.shop_name ?? null,
        mall: it.pick?.mall?.name ?? null,
        price: it.pick?.price ?? null,
        followup: it.pick?.followup_status ?? null,
        replaced_out_of_stock: it.pick?.replaced ?? null,
      })),
      plan_minutes: o.plan?.total_minutes ?? null,
      verified: o.verified,
    }),
  }),

  purchase_checklist: def({
    description: 'What to check in person before paying (5–7 bullets) for the chosen product\'s category. Offer it once before the visit plan.',
    input: z.object({ product_id: z.string().optional() }),
    run: async (i, ctx): Promise<ChecklistOutput> => {
      const pid = i.product_id ?? ctx.state.chosenProduct ?? ctx.state.candidates[0];
      const [p] = pid ? await q<{ persian_title: string; category_name: string | null }>('SELECT persian_title, category_name FROM products WHERE product_id = $1', [pid]) : [];
      const res = await purchaseChecklist(p?.category_name ?? null, p?.persian_title ?? 'کالا');
      ctx.state.checklistOffered = true;
      return { ui: 'checklist', product_title: p?.persian_title ?? '', category: p?.category_name ?? null, items: res.items, source: res.source };
    },
    toModel: (o) => ({ category: o.category, items: o.items }),
  }),
};

export type ToolName = keyof typeof TOOL_DEFS;
export const ACTION_TOOLS = new Set<string>(Object.keys(TOOL_DEFS));

/** AI SDK tool set bound to this request's session context. */
export function buildTools(ctx: ToolCtx): ToolSet {
  const set: ToolSet = {};
  for (const [name, d] of Object.entries(TOOL_DEFS) as Array<[ToolName, Def<z.ZodType, unknown>]>) {
    set[name] = tool({
      description: d.description,
      inputSchema: d.input,
      execute: async (input: unknown) => d.run(input, ctx),
      toModelOutput: ({ output }) => ({ type: 'json', value: JSON.parse(JSON.stringify(d.toModel(output) ?? null)) }),
    });
  }
  return set;
}

/** Run a tool directly for a UI action (same code path as the LLM's tool call). */
export async function runTool(name: string, input: unknown, ctx: ToolCtx): Promise<unknown> {
  const d = (TOOL_DEFS as Record<string, Def<z.ZodType, unknown>>)[name];
  if (!d) throw new Error(`unknown tool ${name}`);
  return d.run(d.input.parse(input ?? {}), ctx);
}
