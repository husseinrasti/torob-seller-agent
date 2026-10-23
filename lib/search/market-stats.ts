import { toFaDigits } from '../fa/digits';
import { formatDistance, formatToman, formatTomanShort, relativeDays } from '../fa/format';
import type { Freshness } from '../data/quality';

/** Pure market math for the bargaining card (F5). */
export type PriceStats = { n: number; min: number; p25: number; median: number; p75: number; max: number };

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

export function priceStats(prices: number[]): PriceStats | null {
  const s = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (!s.length) return null;
  return { n: s.length, min: s[0], p25: quantile(s, 0.25), median: quantile(s, 0.5), p75: quantile(s, 0.75), max: s[s.length - 1] };
}

export type Position = 'below_median' | 'near_median' | 'above_median';

export function positionOf(price: number, median: number): { position: Position; delta_pct: number } {
  const delta = (price - median) / median;
  return { position: delta < -0.03 ? 'below_median' : delta > 0.03 ? 'above_median' : 'near_median', delta_pct: Math.round(delta * 1000) / 10 };
}

/** max(cheapest nearby, median × 0.97) rounded to 10,000 — only when this offer is above it. */
export function targetPrice(price: number, median: number, minNearby: number | null): number | null {
  const t = Math.round(Math.max(minNearby ?? 0, median * 0.97) / 10_000) * 10_000;
  return price > t ? t : null;
}

export type CheaperNearby = { shop_name: string; price: number; distance_m: number; mall: string | null };

export function talkingPoints(o: {
  price: number;
  stats: PriceStats;
  position: Position;
  delta_pct: number;
  cheaper: CheaperNearby | null;
  freshness: Freshness;
  price_age_days: number | null;
  warranty_gap: string | null;
}): string[] {
  const pts: string[] = [];
  const pct = toFaDigits(Math.abs(Math.round(o.delta_pct)));
  if (o.position === 'above_median') pts.push(`قیمت ثبت‌شده‌تان ${pct}٪ بالای میانه بازار است (میانه ${formatTomanShort(o.stats.median)} از ${toFaDigits(o.stats.n)} فروشنده در ترب).`);
  else if (o.position === 'below_median') pts.push(`قیمت ثبت‌شده‌تان ${pct}٪ زیر میانه بازار است؛ چانه‌زنی زیادی لازم نیست.`);
  else pts.push(`قیمت ثبت‌شده‌تان نزدیک میانه بازار است (${formatTomanShort(o.stats.median)}).`);
  if (o.cheaper) pts.push(`«${o.cheaper.shop_name}»${o.cheaper.mall ? ` در ${o.cheaper.mall}` : ''}، ${formatDistance(o.cheaper.distance_m)} آن‌طرف‌تر، همین کالا را ${formatToman(o.cheaper.price)} ثبت کرده.`);
  if (o.freshness === 'stale' || o.freshness === 'unknown') pts.push(`قیمت شما ${o.freshness === 'unknown' ? 'تاریخ ندارد' : `${relativeDays(o.price_age_days)} ثبت شده`}؛ قیمت امروز را بپرسید.`);
  else pts.push(`قیمت شما ${relativeDays(o.price_age_days)} به‌روز شده؛ با قیمت ثبت‌شده در ترب مقایسه کنید.`);
  if (o.warranty_gap) pts.push(o.warranty_gap);
  return pts.slice(0, 4);
}
