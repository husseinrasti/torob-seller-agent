import { formatDistance, formatTime } from '../fa/format';
import { toFaDigits } from '../fa/digits';
import type { Freshness, PriceFlag } from '../data/quality';

export type Intent = 'balanced' | 'cheapest' | 'nearest' | 'now';

export type Filters = {
  max_price?: number;
  open_now?: boolean;
  installment?: boolean;
  torobpay?: boolean;
  fast_delivery?: boolean;
  warranty_required?: boolean;
  hide_stale?: boolean;
  hide_suspicious?: boolean;
};

export const FILTER_KEYS: Array<keyof Filters> = [
  'max_price',
  'open_now',
  'installment',
  'torobpay',
  'fast_delivery',
  'warranty_required',
  'hide_stale',
  'hide_suspicious',
];

export const FILTER_LABEL: Record<keyof Filters, string> = {
  max_price: 'سقف قیمت',
  open_now: 'باز الان',
  installment: 'قسطی',
  torobpay: 'ترب‌پی',
  fast_delivery: 'ارسال فوری',
  warranty_required: 'گارانتی',
  hide_stale: 'پنهان کردن قیمت‌های قدیمی',
  hide_suspicious: 'پنهان کردن قیمت‌های مشکوک',
};

/** `info` = «کامل بودن اطلاعات» (hours, web/Instagram, recent price) — a 0.05 tie-breaker, never a quality score. */
export type Weights = { price: number; distance: number; freshness: number; open: number; conditions: number; info: number };

export const INTENT_WEIGHTS: Record<Intent, Weights> = {
  balanced: { price: 0.35, distance: 0.25, freshness: 0.15, open: 0.15, conditions: 0.1, info: 0.05 },
  cheapest: { price: 0.6, distance: 0.15, freshness: 0.1, open: 0.1, conditions: 0.05, info: 0.05 },
  nearest: { price: 0.15, distance: 0.55, freshness: 0.1, open: 0.15, conditions: 0.05, info: 0.05 },
  now: { price: 0.2, distance: 0.25, freshness: 0.1, open: 0.4, conditions: 0.05, info: 0.05 },
};

/** Minimal seller facts needed for filtering/scoring (a subset of the API row). */
export type ScoreInput = {
  price: number | null;
  price_flag: PriceFlag;
  freshness: Freshness;
  price_age_days: number | null;
  distance_m: number;
  open: { known: boolean; open: boolean | null; closesAt?: string };
  installment: boolean;
  torobpay: boolean;
  fast_delivery: boolean | null;
  has_warranty: boolean;
  hours_known: boolean;
  /** 0..1, see lib/data/trust.ts */
  info_completeness?: number;
};

export type Breakdown = Weights & { total: number };

/** Persian names of the score factors (breakdown bars, «چرا این اول شد؟»). */
export const FACTOR_LABEL: Record<keyof Weights, string> = {
  price: 'قیمت',
  distance: 'فاصله',
  freshness: 'تازگی قیمت',
  open: 'باز بودن',
  conditions: 'شرایط خرید',
  info: 'کامل بودن اطلاعات',
};

const FRESH_SCORE: Record<Freshness, number> = { fresh: 1, recent: 0.6, stale: 0.2, unknown: 0.3 };

export function passesFilters(r: ScoreInput, f: Filters): boolean {
  if (f.max_price !== undefined && f.max_price !== null && (r.price === null || r.price > f.max_price)) return false;
  if (f.open_now && r.open.open !== true) return false;
  if (f.installment && !r.installment) return false;
  if (f.torobpay && !r.torobpay) return false;
  if (f.fast_delivery && r.fast_delivery !== true) return false;
  if (f.warranty_required && !r.has_warranty) return false;
  if (f.hide_stale && r.freshness === 'stale') return false;
  if (f.hide_suspicious && (r.price_flag === 'suspicious_low' || r.price_flag === 'suspicious_high')) return false;
  return true;
}

export function activeFilters(f: Filters): Array<keyof Filters> {
  return FILTER_KEYS.filter((k) => (k === 'max_price' ? f.max_price !== undefined && f.max_price !== null : Boolean(f[k])));
}

const usablePrice = (r: ScoreInput) => (r.price !== null && r.price_flag === 'ok' ? r.price : null);

/** Explainable 0..1 score per seller relative to the result set (spec §5.4). */
export function scoreSellers<T extends ScoreInput>(rows: T[], radiusM: number, intent: Intent, filters: Filters): Array<T & { score: number; score_breakdown: Breakdown }> {
  const w = INTENT_WEIGHTS[intent];
  const prices = rows.map(usablePrice).filter((p): p is number => p !== null);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const requested = (['installment', 'torobpay', 'fast_delivery', 'warranty_required'] as const).filter((k) => filters[k]);
  return rows.map((r) => {
    const p = usablePrice(r);
    const price = p === null ? 0.3 : max === min ? 1 : 1 - (p - min) / (max - min);
    const distance = Math.max(0, 1 - r.distance_m / Math.max(radiusM, 1));
    const freshness = FRESH_SCORE[r.freshness];
    const open = r.open.open === true ? 1 : r.open.open === false ? 0 : 0.5;
    const facts = { installment: r.installment, torobpay: r.torobpay, fast_delivery: r.fast_delivery === true, warranty_required: r.has_warranty };
    const conditions = requested.length
      ? requested.filter((k) => facts[k]).length / requested.length
      : [r.installment, r.torobpay, r.fast_delivery === true, r.has_warranty, r.hours_known].filter(Boolean).length / 5;
    const info = r.info_completeness ?? 0;
    const total = w.price * price + w.distance * distance + w.freshness * freshness + w.open * open + w.conditions * conditions + w.info * info;
    const round = (x: number) => Math.round(x * 1000) / 1000;
    return {
      ...r,
      score: round(total),
      score_breakdown: {
        price: round(price),
        distance: round(distance),
        freshness: round(freshness),
        open: round(open),
        conditions: round(conditions),
        info: round(info),
        total: round(total),
      },
    };
  });
}

function radiusText(m: number): string {
  return m >= 1000 ? `${toFaDigits(m / 1000)} کیلومتری` : `${toFaDigits(m)} متری`;
}

/** ≤ 2 templated Persian reasons, picked by the factors that contributed most to the score. */
export function whyPhrases(
  r: ScoreInput & { score_breakdown: Breakdown },
  ctx: { radiusM: number; intent: Intent; minPrice: number | null; minDistance: number; medianPrice: number | null },
): string[] {
  const w = INTENT_WEIGHTS[ctx.intent];
  const b = r.score_breakdown;
  const cands: Array<[number, string]> = [];
  const p = usablePrice(r);
  if (p !== null && ctx.minPrice !== null && p === ctx.minPrice) cands.push([w.price * 1.2, `ارزان‌ترین در شعاع ${radiusText(ctx.radiusM)}`]);
  else if (p !== null && ctx.medianPrice && p < ctx.medianPrice * 0.97) {
    const pct = Math.round((1 - p / ctx.medianPrice) * 100);
    cands.push([w.price * b.price, `${toFaDigits(pct)}٪ زیر میانه بازار`]);
  }
  if (r.distance_m === ctx.minDistance) cands.push([w.distance * 1.1, `نزدیک‌ترین (${formatDistance(r.distance_m)})`]);
  else if (r.distance_m <= 300) cands.push([w.distance * b.distance, `${formatDistance(r.distance_m)} فاصله`]);
  if (r.price_age_days !== null && r.price_age_days <= 7) {
    cands.push([w.freshness, r.price_age_days === 0 ? 'قیمت امروز به‌روز شده' : `قیمت ${toFaDigits(r.price_age_days)} روز پیش به‌روز شده`]);
  }
  if (r.open.open === true) cands.push([w.open, r.open.closesAt ? `الان باز است تا ${formatTime(r.open.closesAt)}` : 'الان باز است']);
  if (r.installment) cands.push([w.conditions * 1.5, 'قسطی دارد']);
  else if (r.torobpay) cands.push([w.conditions * 1.2, 'ترب‌پی دارد']);
  return cands
    .sort((a, b2) => b2[0] - a[0])
    .slice(0, 2)
    .map(([, s]) => s);
}
