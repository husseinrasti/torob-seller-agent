import { toFaDigits } from './digits';

/** 55990000 → "۵۵٬۹۹۰٬۰۰۰" */
export function formatNumber(n: number): string {
  const rounded = Math.round(n);
  const s = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return (rounded < 0 ? '−' : '') + toFaDigits(s);
}

/** 55990000 → "۵۵٬۹۹۰٬۰۰۰ تومان" */
export function formatToman(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'قیمت ثبت نشده';
  return `${formatNumber(n)} تومان`;
}

/** Compact price for chips: 60000000 → "۶۰ میلیون", 2500000 → "۲٫۵ میلیون", 850000 → "۸۵۰ هزار" */
export function formatTomanShort(n: number): string {
  if (n >= 1_000_000_000) return `${toFaDigits(trimDecimal(n / 1_000_000_000))} میلیارد`;
  if (n >= 1_000_000) return `${toFaDigits(trimDecimal(n / 1_000_000))} میلیون`;
  if (n >= 1_000) return `${toFaDigits(trimDecimal(n / 1_000))} هزار`;
  return toFaDigits(String(n));
}

function trimDecimal(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

/** 350 → "۳۵۰ متر", 1240 → "۱٫۲ کیلومتر" */
export function formatDistance(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return 'فاصله نامشخص';
  if (m < 1000) return `${toFaDigits(String(Math.max(10, Math.round(m / 10) * 10)))} متر`;
  return `${toFaDigits(trimDecimal(m / 1000))} کیلومتر`;
}

/** Days ago → "امروز" | "دیروز" | "۳ روز پیش" | "۲ هفته پیش" | "۲ ماه پیش" | "۱ سال پیش" */
export function relativeDays(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'نامشخص';
  const d = Math.max(0, Math.floor(n));
  if (d === 0) return 'امروز';
  if (d === 1) return 'دیروز';
  if (d < 14) return `${toFaDigits(d)} روز پیش`;
  if (d < 30) return `${toFaDigits(Math.floor(d / 7))} هفته پیش`;
  if (d < 365) return `${toFaDigits(Math.floor(d / 30))} ماه پیش`;
  return `${toFaDigits(Math.floor(d / 365))} سال پیش`;
}

/** Minutes ago for follow-up confirmations: "همین الان" | "۲ دقیقه پیش" */
export function relativeMinutes(fromIso: string, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60000);
  if (mins < 1) return 'همین الان';
  if (mins < 60) return `${toFaDigits(mins)} دقیقه پیش`;
  return `${toFaDigits(Math.floor(mins / 60))} ساعت پیش`;
}

/** "19:00:00" | "19:00" → "۱۹:۰۰" */
export function formatTime(hhmm: string): string {
  return toFaDigits(hhmm.slice(0, 5));
}

/**
 * Persian digits inside free text (product titles) while keeping model codes Latin:
 * «حافظه 128 رم 4 | A17 4G» → «حافظه ۱۲۸ رم ۴ · A17 4G».
 */
export function faText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/(?<![A-Za-z0-9_.\-/])\d+(?:\.\d+)?(?![A-Za-z0-9_\-/])/g, (m) => toFaDigits(m));
}
