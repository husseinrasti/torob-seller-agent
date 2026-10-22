import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { routeCategories } from '../search/categories';
import { compareProducts, searchProducts } from '../search/products';
import { findSellers, shopDetails } from '../search/sellers';
import { matchPlace } from '../search/places';
import { q } from '../db/client';
import { formatDistance, formatTomanShort } from '../fa/format';
import { toFaDigits } from '../fa/digits';
import { FILTER_LABEL, type Filters } from '../search/score';
import type { SessionState } from './state';
import type { Suggestion } from './suggest';
import type {
  ClarifyOutput,
  CompareOutput,
  ContextOutput,
  ProductsOutput,
  SellersOutput,
  ShopOutput,
} from './types';

export type ToolCtx = { sessionId: string; state: SessionState; now: Date };

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
    max_price: z.number().nullable().describe('toman; null removes the price cap'),
  })
  .partial();

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
      const route = await routeCategories(text, { budget: hinted });
      const budget = route.budget ?? hinted;
      const res = await searchProducts({ text, keywords: route.keywords, categories: route.categories, budget, limit: i.limit ?? 4 });
      const st = ctx.state;
      st.need = i.text;
      st.categories = route.categories;
      st.candidates = res.products.map((p) => p.product_id);
      st.chosenProduct = undefined;
      if (budget) st.budget = budget;
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
      location_text: z.string().max(80).optional().describe('place name as the user said it'),
      radius_m: z.number().int().min(200).max(20000).optional(),
      filters: FiltersInput.optional(),
      intent: z.enum(['balanced', 'cheapest', 'nearest', 'now']).optional(),
      chosen_product: z.string().optional().describe('product_id'),
    }),
    run: async (i, ctx): Promise<ContextOutput> => {
      const st = ctx.state;
      const changes: string[] = [];
      let unresolved: string | undefined;
      if (i.location_text) {
        const place = await matchPlace(i.location_text);
        if (place) {
          st.location = { lat: place.lat, lon: place.lon, label: place.name, source: 'text' };
          changes.push(`📍 ${place.name}`);
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
      return { ui: 'sellers', ...res, suggested_actions: sellerSuggestions({ ui: 'sellers', ...res }, st) };
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
        why: r.why,
      })),
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
      payment: o.payment,
      other_offers: o.other_offers.map((x) => ({ title: x.title, price: x.price, price_age_days: x.price_age_days })),
    }),
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
