import { normalizeForSearch } from '../fa/normalize';
import { toEnDigits } from '../fa/digits';

/**
 * F3 multi-item trip (pure): pick one seller per basket item so that as many items as possible are bought
 * in one mall. Greedy set cover over malls — each step takes the mall that covers the most still-open items
 * (ties: lower total price of those items there, then shorter distance) — while a mall covers ≥ 2 open
 * items; every item left is bought from its nearest seller.
 */

export type BasketCandidate = {
  offer_id: string;
  shop_id: string;
  mall_key: string | null;
  price: number | null;
  distance_m: number;
};
export type BasketItemCandidates = { item_id: string; candidates: BasketCandidate[] };
export type BasketPick = { item_id: string; offer_id: string; shop_id: string; mall_key: string | null; via: 'mall' | 'nearest' };
export type BasketCoverage = { items_total: number; items_in_one_mall: number; malls_used: number; stops: number; uncovered: string[] };

/** Top candidates per item: a few per shop at most once, sane price first, then score order as given. */
export const CANDIDATES_PER_ITEM = 8;

const cheaper = (a: BasketCandidate, b: BasketCandidate) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.distance_m - b.distance_m;

export function planBasket(items: BasketItemCandidates[], opts: { exclude?: Set<string> } = {}): { picks: BasketPick[]; coverage: BasketCoverage } {
  const cands = new Map(items.map((it) => [it.item_id, it.candidates.filter((c) => !opts.exclude?.has(c.offer_id)).slice(0, CANDIDATES_PER_ITEM)]));
  const open = new Set(items.filter((it) => cands.get(it.item_id)!.length).map((it) => it.item_id));
  const picks: BasketPick[] = [];
  let inOneMall = 0;

  for (;;) {
    // mall → the best candidate there for each open item
    const malls = new Map<string, Map<string, BasketCandidate>>();
    for (const id of open) {
      for (const c of cands.get(id)!) {
        if (!c.mall_key) continue;
        const m = malls.get(c.mall_key) ?? new Map<string, BasketCandidate>();
        const cur = m.get(id);
        if (!cur || cheaper(c, cur) < 0) m.set(id, c);
        malls.set(c.mall_key, m);
      }
    }
    let best: { key: string; picks: Map<string, BasketCandidate>; total: number; dist: number } | null = null;
    for (const [key, m] of malls) {
      if (m.size < 2) continue;
      const list = [...m.values()];
      const total = list.reduce((a, c) => a + (c.price ?? 0), 0);
      const dist = Math.min(...list.map((c) => c.distance_m));
      if (!best || m.size > best.picks.size || (m.size === best.picks.size && (total < best.total || (total === best.total && dist < best.dist)))) best = { key, picks: m, total, dist };
    }
    if (!best) break;
    for (const [id, c] of best.picks) {
      picks.push({ item_id: id, offer_id: c.offer_id, shop_id: c.shop_id, mall_key: c.mall_key, via: 'mall' });
      open.delete(id);
    }
    inOneMall = Math.max(inOneMall, best.picks.size);
  }

  for (const id of open) {
    const c = [...cands.get(id)!].sort((a, b) => a.distance_m - b.distance_m || (a.price ?? Infinity) - (b.price ?? Infinity))[0];
    picks.push({ item_id: id, offer_id: c.offer_id, shop_id: c.shop_id, mall_key: c.mall_key, via: 'nearest' });
  }
  if (picks.length) inOneMall = Math.max(inOneMall, 1);

  const order = new Map(items.map((it, i) => [it.item_id, i]));
  picks.sort((a, b) => order.get(a.item_id)! - order.get(b.item_id)!);
  const mallsUsed = new Set(picks.flatMap((p) => (p.mall_key ? [p.mall_key] : [])));
  const stops = new Set(picks.map((p) => p.mall_key ?? `shop:${p.shop_id}`));
  return {
    picks,
    coverage: {
      items_total: items.length,
      items_in_one_mall: inOneMall,
      malls_used: mallsUsed.size,
      stops: stops.size,
      uncovered: items.filter((it) => !picks.some((p) => p.item_id === it.item_id)).map((it) => it.item_id),
    },
  };
}

/**
 * Items of a «یکجا» request: «گوشی A17، کاور A17، گلس، پاوربانک ۲۰ هزار، همه یکجا نزدیک فردوسی» →
 * [گوشی A17, کاور A17, گلس, پاوربانک ۲۰ هزار]. The place phrase must be removed by the caller.
 */
export function splitBasketItems(text: string): string[] {
  const cleaned = text
    .replace(/[؟?!.]/gu, ' ')
    .replace(/(?:^|\s)(?:همه(?:\s*(?:ش|شون|شو|رو|را))?\s*)?(?:یک ?جا|یه ?جا|با هم|باهم)(?:\s*(?:بخرم|بگیرم|می ?خوام|میخوام|بخر|پیدا کن|باشه|باشن))*(?=\s|$)/gu, ' ')
    .replace(/(?:^|\s)(?:می ?خوام|میخوام|لازم دارم|بخرم|بگیرم|برام پیدا کن|پیدا کن|کجا بخرم)(?=\s|$)/gu, ' ');
  return cleaned
    .split(/\s*(?:[،,+؛;]|\sو\s)\s*/u)
    .map((s) => s.replace(/\s+/gu, ' ').trim())
    .filter((s) => s.length >= 2 && !/^(?:و|با|همه|نزدیک|اطراف)$/u.test(s));
}

// words of a mission clause, not of a product line («حدود ۵۰ میلیون»، «محدوده سعادت آباد»، «خودت بپرس»)
const CLAUSE_WORDS = /میلیون|تومن|تومان|محدوده|نزدیک|اطراف|حوالی|بپرس|پرس|چک|پیگیری|آپدیت|اپدیت|باز|برنامه|ساعت|شعاع|کیلومتر|متر|مطمئن|باشه|باشن|می ?خوام|میخوام/u;
const productLike = (part: string) => part.split(/\s+/).length <= 4 && !CLAUSE_WORDS.test(part);

/** «… یکجا»، «+» — or ≥ 3 short product lines («گوشی A17، کاور، گلس، شارژر») — is a basket, not one search. */
export function looksLikeBasket(text: string): boolean {
  const parts = splitBasketItems(text);
  if (parts.length < 2) return false;
  if (/یک ?جا|یه ?جا|همه ?(?:ش|شو|شون|رو|را)? ?با ?هم|\+/u.test(text)) return true;
  return parts.length >= 3 && parts.filter(productLike).length >= parts.length - 1 && parts.filter(productLike).length >= 3 && !/بپرس|چک کن|پیگیری کن|مطمئن شو/u.test(text);
}

const MODEL_CODE = /(?:^|[^a-z0-9])([a-z]{1,3}\d{1,3}[a-z]?)(?=[^a-z0-9]|$)/u;
const SKIP_CODES = new Set(['4g', '5g', '3g']);

/** «A17», «S24» … in a line (normalized, lowercase), not network names. */
export function modelCodeOf(text: string): string | null {
  const m = normalizeForSearch(toEnDigits(text)).match(MODEL_CODE);
  return m && !SKIP_CODES.has(m[1]) ? m[1] : null;
}

export const hasCode = (title: string, code: string) => new RegExp(`(?:^|[^a-z0-9])${code}(?:[^a-z0-9]|$)`, 'u').test(normalizeForSearch(title));
