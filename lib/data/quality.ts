import { toFaDigits } from '../fa/digits';

export type Freshness = 'fresh' | 'recent' | 'stale' | 'unknown';
export type PriceFlag = 'ok' | 'suspicious_low' | 'suspicious_high' | 'missing';

const DAY_MS = 86_400_000;
export const SANE_MIN = 10_000;
export const SANE_MAX = 10_000_000_000;

/** DATASET_AS_OF as the end of that day in Tehran (prices changed "today" are 0 days old). */
export function datasetAsOf(value = process.env.DATASET_AS_OF || '2026-10-13'): Date {
  return new Date(`${value}T23:59:59+03:30`);
}

export function priceAgeDays(lastChanged: Date | string | null | undefined, asOf: Date): number | null {
  if (!lastChanged) return null;
  const t = new Date(lastChanged).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((asOf.getTime() - t) / DAY_MS));
}

export function freshnessOf(days: number | null | undefined): Freshness {
  if (days === null || days === undefined) return 'unknown';
  if (days <= 7) return 'fresh';
  if (days <= 30) return 'recent';
  return 'stale';
}

export function isSanePrice(p: number | null | undefined): p is number {
  return p !== null && p !== undefined && p >= SANE_MIN && p <= SANE_MAX;
}

/**
 * Price sanity vs the product median (over sane prices). With fewer than two sane offers only the
 * absolute bounds apply.
 */
export function priceFlagOf(price: number | null | undefined, median: number | null, saneCount: number): PriceFlag {
  if (price === null || price === undefined) return 'missing';
  if (price > SANE_MAX) return 'suspicious_high';
  if (price < SANE_MIN) return 'suspicious_low';
  if (median && saneCount >= 2) {
    if (price < 0.2 * median) return 'suspicious_low';
    if (price > 5 * median) return 'suspicious_high';
  }
  return 'ok';
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// --- payment options -----------------------------------------------------------

export type PaymentOption = {
  provider_name?: string | null;
  channel?: string | null;
  min_price_toman?: number | null;
  max_price_toman?: number | null;
};

const squash = (s: string) => s.replace(/[\s‌]/g, '');
const CANONICAL_PROVIDERS: Record<string, string> = {
  تربپی: 'ترب‌پی',
  اسنپپی: 'اسنپ‌پی',
  دیجیپی: 'دیجی‌پی',
  تارا: 'تارا',
  ازکیوام: 'ازکی‌وام',
};
const INSTALLMENT = new Set(['اسنپ‌پی', 'تارا', 'ازکی‌وام', 'دیجی‌پی']);

export type PaymentFlags = {
  has_installment: boolean;
  has_torobpay: boolean;
  payment_providers: string[];
  /** true when at least one installment/Torob Pay option is declared for in-person purchases */
  installment_in_person: boolean;
  torobpay_in_person: boolean;
};

export function paymentFlags(options: PaymentOption[] | null | undefined): PaymentFlags {
  const providers = new Set<string>();
  let installment = false;
  let torobpay = false;
  let instInPerson = false;
  let tpInPerson = false;
  for (const o of options ?? []) {
    const raw = (o.provider_name ?? '').trim();
    if (!raw) continue;
    const name = CANONICAL_PROVIDERS[squash(raw)] ?? raw;
    providers.add(name);
    const inPerson = o.channel === 'in_person';
    if (INSTALLMENT.has(name) || o.min_price_toman != null || o.max_price_toman != null) {
      installment = true;
      instInPerson ||= inPerson;
    }
    if (name === 'ترب‌پی') {
      torobpay = true;
      tpInPerson ||= inPerson;
    }
  }
  return {
    has_installment: installment,
    has_torobpay: torobpay,
    payment_providers: [...providers],
    installment_in_person: instInPerson,
    torobpay_in_person: tpInPerson,
  };
}

// --- warranty --------------------------------------------------------------------

export type WarrantyRaw = { provider?: string | null; period_months?: number | null; description?: string | null } | null;
export type WarrantyInfo = { provider: string | null; months: number | null; text: string | null; has_warranty: boolean };

const NO_WARRANTY = new Set(['بدون گارانتی']);
const NOT_A_WARRANTY = new Set(['بدون گارانتی', 'تست و تحویل در حضور مشتری']);

export function warrantyInfo(w: WarrantyRaw): WarrantyInfo {
  if (!w) return { provider: null, months: null, text: null, has_warranty: false };
  const provider = w.provider?.trim() || null;
  const months = w.period_months && w.period_months > 0 ? w.period_months : null;
  let text: string | null;
  if (provider && NO_WARRANTY.has(provider)) text = 'بدون گارانتی';
  else if (provider && NOT_A_WARRANTY.has(provider)) text = provider;
  else if (provider || months) {
    text = ['گارانتی', months ? `${toFaDigits(months)} ماهه` : null, provider].filter(Boolean).join(' ');
  } else text = w.description?.trim() || null;
  const has = Boolean(months) || Boolean(provider && !NOT_A_WARRANTY.has(provider));
  return { provider, months, text, has_warranty: has };
}
