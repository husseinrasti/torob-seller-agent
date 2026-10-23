import { randomUUID } from 'node:crypto';
import { q } from '../db/client';
import { productSearch } from '../agent/product-search';
import type { BasketItem, FollowupStatus, SessionState } from '../agent/state';
import type { PlanOutput } from '../agent/types';
import type { Suggestion } from '../agent/suggest';
import { findSellers, type MallRef, type SellerRow } from '../search/sellers';
import { awaitFollowups, SIM_DISCLAIMER, startFollowups } from '../sim/followups';
import { formatDistance } from '../fa/format';
import { normalizeForSearch } from '../fa/normalize';
import { toFaDigits } from '../fa/digits';
import type { Freshness, PriceFlag } from '../data/quality';
import { buildPlan } from './service';
import { CANDIDATES_PER_ITEM, hasCode, modelCodeOf, planBasket, type BasketCoverage, type BasketItemCandidates } from './basket';

const RADII = [1000, 2000, 3000];
const AWAIT_MS = 8000;
const VERIFY_BUDGET_MS = 14_000;
const ANSWERED = new Set(['confirmed', 'price_changed', 'out_of_stock', 'no_answer']);

export type BasketPickRow = {
  offer_id: string;
  shop_id: string;
  shop_name: string;
  product_title: string;
  price: number | null;
  price_flag: PriceFlag;
  freshness: Freshness;
  price_age_days: number | null;
  distance_m: number;
  mall: MallRef | null;
  open: { known: boolean; open: boolean | null; label: string };
  followup_status: FollowupStatus | null;
  via: 'mall' | 'nearest';
  /** the seller this one replaced after a follow-up said out of stock / no answer */
  replaced?: string;
};
export type BasketPlanItem = { item_id: string; text: string; title: string | null; candidates: number; pick: BasketPickRow | null };
export type BasketPlanOutput = {
  ui: 'basket_plan';
  location: string;
  radius_m: number;
  items: BasketPlanItem[];
  coverage: BasketCoverage;
  /** stops in visit order of the plan: a mall (several items) or a single shop */
  stops: Array<{ key: string; mall: string | null; item_ids: string[] }>;
  summary: string;
  plan: PlanOutput | null;
  verified: boolean;
  disclaimer?: string;
  suggested_actions: Suggestion[];
};
export type BasketOutput = { ui: 'basket'; added: string[]; removed: string[]; items: BasketItem[]; suggested_actions: Suggestion[] };

/**
 * Resolve a basket line («کاور A17») to its products; the session's search is left untouched. A model code
 * stays exact (A17 never becomes A07); a generic accessory («گلس») borrows the code of the basket's phone
 * («گلس A17») when such products exist. Otherwise the top 3 matches.
 */
export async function resolveBasketItem(text: string, state: SessionState, hint?: string | null): Promise<BasketItem> {
  const search = async (t: string) => (await productSearch(structuredClone(state), { text: t, limit: 8 }).catch(() => null))?.products ?? [];
  const code = modelCodeOf(text) ?? hint ?? null;
  let products: Array<{ product_id: string; title: string }> = await search(text);
  if (code) {
    let exact = products.filter((p) => hasCode(p.title, code));
    if (!exact.length) exact = (await search(`${text} ${code}`)).filter((p) => hasCode(p.title, code));
    // the search may rank «کاور A26» above «کاور A17»: same head word + the exact code, most-listed first
    if (!exact.length) exact = await byHeadAndCode(text, code);
    if (exact.length || modelCodeOf(text)) products = exact.length ? exact : products;
  }
  products = products.slice(0, code ? 4 : 3);
  return { id: randomUUID().slice(0, 8), text, title: products[0]?.title.split('|')[0].trim() ?? null, product_ids: products.map((p) => p.product_id) };
}

async function byHeadAndCode(text: string, code: string): Promise<Array<{ product_id: string; title: string }>> {
  const head = normalizeForSearch(text).split(' ').find((w) => w.length >= 2 && !/[a-z0-9]/.test(w));
  if (!head || !/^[a-z0-9]+$/.test(code)) return [];
  return q<{ product_id: string; title: string }>(
    `SELECT product_id, persian_title AS title FROM products
      WHERE persian_title ~* ('\\m' || $1 || '\\M') AND persian_title LIKE '%' || $2 || '%'
      ORDER BY seller_count DESC NULLS LAST LIMIT 4`,
    [code, head],
  );
}

/** All lines of a basket request: the first model code found («گوشی A17») is the hint for generic lines. */
export async function resolveBasketItems(texts: string[], state: SessionState): Promise<BasketItem[]> {
  const hint = texts.map(modelCodeOf).find(Boolean) ?? null;
  return Promise.all(texts.map((t) => resolveBasketItem(t, state, hint)));
}

const shortTitle = (t: string) => t.split('|')[0].trim();

/** Candidate sellers per item: top by score within the session radius, widened up to 3 km when an item has none. */
async function candidatesFor(item: BasketItem, state: SessionState, now: Date): Promise<SellerRow[]> {
  if (!item.product_ids.length) return [];
  // one budget does not fit a phone and its case: the basket ignores max_price
  const { max_price: _drop, ...filters } = state.filters;
  void _drop;
  let rows: SellerRow[] = [];
  for (const r of [...new Set([state.radius_m, ...RADII.filter((x) => x > state.radius_m)])]) {
    const res = await findSellers({ product_ids: item.product_ids, lat: state.location.lat, lon: state.location.lon, radius_m: r, filters, intent: state.intent, now });
    rows = res.rows.filter((x) => x.price_flag !== 'suspicious_low' && x.price_flag !== 'suspicious_high');
    if (rows.length) break;
  }
  return rows.slice(0, CANDIDATES_PER_ITEM);
}

/**
 * F3: one seller per item, as many items as possible in one mall (greedy set cover), the rest from the
 * nearest seller; the picks become a visit plan. With `verify` the picks are followed up (simulated,
 * awaited ≤ 8 s) and items whose seller is out of stock / did not answer are re-planned without it.
 */
export async function basketPlan(opts: { state: SessionState; sessionId: string | null; now: Date; verify?: boolean }): Promise<BasketPlanOutput> {
  const st = opts.state;
  const items = st.basket ?? [];
  if (items.length < 2) throw new Error('برای برنامه‌ی یکجا دست‌کم دو قلم لازم است؛ چیزهای دیگری که می‌خواهید را بگویید.');
  const found = await Promise.all(items.map((it) => candidatesFor(it, st, opts.now)));
  const rowsOf = new Map(items.map((it, i) => [it.id, found[i]] as const));
  const byOffer = new Map(found.flat().map((r) => [r.offer_id, r] as const));
  const cover: BasketItemCandidates[] = items.map((it) => ({
    item_id: it.id,
    candidates: (rowsOf.get(it.id) ?? []).map((r) => ({ offer_id: r.offer_id, shop_id: r.shop_id, mall_key: r.mall?.key ?? null, price: r.price, distance_m: r.distance_m })),
  }));

  // sellers that already said «ناموجود» / did not answer in this chat are never picked
  const bad = new Set(Object.entries(st.followups).filter(([, v]) => v === 'out_of_stock' || v === 'no_answer').map(([o]) => o));
  let { picks, coverage } = planBasket(cover, { exclude: bad });
  const replaced = new Map<string, string>();
  let verified = false;
  if (opts.verify && picks.length) {
    // ask every picked seller not answered yet; an item whose seller is out of stock gets the next one, asked too
    const deadline = Date.now() + VERIFY_BUDGET_MS;
    for (let round = 0; round < 2 && Date.now() < deadline - 1500; round++) {
      const ask = picks.filter((p) => !ANSWERED.has(st.followups[p.offer_id] ?? '')).map((p) => p.offer_id);
      if (ask.length) {
        const started = await startFollowups({ sessionId: opts.sessionId, offerIds: ask, channel: 'message', now: opts.now });
        for (const it of started) st.followups = { ...st.followups, [it.offer_id]: 'contacting' };
        const waitMs = Math.max(500, Math.min(AWAIT_MS, deadline - Date.now()));
        for (const it of await awaitFollowups(started.map((i) => i.id), { timeoutMs: waitMs, sessionId: opts.sessionId ?? undefined })) {
          st.followups = { ...st.followups, [it.offer_id]: it.status };
        }
      }
      const now = picks.filter((p) => st.followups[p.offer_id] === 'out_of_stock' || st.followups[p.offer_id] === 'no_answer');
      if (!now.length) break;
      for (const p of now) bad.add(p.offer_id);
      const before = new Map(picks.map((p) => [p.item_id, p.offer_id]));
      ({ picks, coverage } = planBasket(cover, { exclude: bad }));
      for (const p of picks) {
        const old = before.get(p.item_id);
        if (old && old !== p.offer_id && bad.has(old) && !replaced.has(p.item_id)) replaced.set(p.item_id, byOffer.get(old)?.shop_name ?? '');
      }
    }
    verified = true;
  }

  const res = picks.length ? await buildPlan({ sessionId: opts.sessionId, state: st, now: opts.now, offerIds: picks.map((p) => p.offer_id) }) : null;
  if (res) st.planId = res.plan_id;
  const plan: PlanOutput | null = res ? { ui: 'plan', plan_id: res.plan_id, share_path: `/plan/${res.plan_id}`, ...res.payload, suggested_actions: [] } : null;

  const titles = new Map(
    (await q<{ product_id: string; persian_title: string }>('SELECT product_id, persian_title FROM products WHERE product_id = ANY($1::text[])', [picks.map((p) => byOffer.get(p.offer_id)?.product_id ?? '')])).map((r) => [r.product_id, shortTitle(r.persian_title)]),
  );
  const planItems: BasketPlanItem[] = items.map((it) => {
    const p = picks.find((x) => x.item_id === it.id);
    const r = p ? byOffer.get(p.offer_id) : undefined;
    return {
      item_id: it.id,
      text: it.text,
      title: it.title,
      candidates: rowsOf.get(it.id)?.length ?? 0,
      pick:
        p && r
          ? {
              offer_id: r.offer_id,
              shop_id: r.shop_id,
              shop_name: r.shop_name,
              product_title: titles.get(r.product_id) ?? it.title ?? it.text,
              price: r.price,
              price_flag: r.price_flag,
              freshness: r.freshness,
              price_age_days: r.price_age_days,
              distance_m: r.distance_m,
              mall: r.mall,
              open: { known: r.open.known, open: r.open.open, label: r.open.label },
              followup_status: st.followups[r.offer_id] ?? null,
              via: p.via,
              ...(replaced.has(it.id) ? { replaced: replaced.get(it.id) } : {}),
            }
          : null,
    };
  });

  // stops follow the plan's visit order
  const order = plan ? plan.groups.flatMap((g) => g.steps.map((s) => s.offer_id)) : [];
  const stops: BasketPlanOutput['stops'] = [];
  for (const it of [...planItems].sort((a, b) => order.indexOf(a.pick?.offer_id ?? '') - order.indexOf(b.pick?.offer_id ?? ''))) {
    if (!it.pick) continue;
    const key = it.pick.mall?.key ?? `shop:${it.pick.shop_id}`;
    const s = stops.find((x) => x.key === key) ?? (stops.push({ key, mall: it.pick.mall?.key ? (it.pick.mall.name ?? it.pick.mall.key) : null, item_ids: [] }), stops[stops.length - 1]);
    s.item_ids.push(it.item_id);
  }
  const bigMall = stops.filter((s) => s.mall).sort((a, b) => b.item_ids.length - a.item_ids.length)[0];
  const summary = [
    bigMall && bigMall.item_ids.length >= 2
      ? `${toFaDigits(bigMall.item_ids.length)} از ${toFaDigits(items.length)} قلم یکجا در ${bigMall.mall}`
      : `${toFaDigits(picks.length)} از ${toFaDigits(items.length)} قلم پیدا شد`,
    `${toFaDigits(stops.length)} توقف`,
    coverage.uncovered.length ? `${toFaDigits(coverage.uncovered.length)} قلم در ${formatDistance(RADII[RADII.length - 1])} فروشنده‌ی ثبت‌شده ندارد` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const suggested: Suggestion[] = verified
    ? [{ kind: 'action', label: 'چک‌لیست خرید', text: 'چک‌لیست خرید حضوری را بده', tool: 'purchase_checklist', input: {} }]
    : [{ kind: 'action', label: 'پیگیری همه', text: 'موجودی همه‌ی قلم‌های سبد را بپرس', tool: 'basket_plan', input: { verify: true } }];
  return {
    ui: 'basket_plan',
    location: st.location.label,
    radius_m: st.radius_m,
    items: planItems,
    coverage,
    stops,
    summary,
    plan,
    verified,
    ...(verified ? { disclaimer: SIM_DISCLAIMER } : {}),
    suggested_actions: suggested,
  };
}
