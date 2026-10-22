import { toEnDigits, toFaDigits } from '../fa/digits';
import { normalizeFa } from '../fa/normalize';

export type Spec = { key: string; section?: string; value: string };
export type KeySpec = { k: string; v: string };

// Card-worthy specs in priority order: [label, key matcher]
const KEY_SPECS: Array<[string, RegExp]> = [
  ['حافظه', /^حافظه داخلی$/u],
  ['رم', /^(رم|رم اجرایی|مقدار RAM|حافظه RAM|حافظه رم)$/u],
  ['نمایشگر', /^(ابعاد نمایشگر|اندازه صفحه نمایش|اندازه نمایشگر|سایز صفحه نمایش)$/u],
  ['باتری', /^ظرفیت باتری$/u],
  ['دوربین', /^(دوربین اصلی|دوربین اصلی - واید\/استاندارد|رزولوشن دوربین اصلی)$/u],
  ['ظرفیت', /^(ظرفیت|ظرفیت مخزن|ظرفیت پاوربانک)$/u],
  ['توان', /^(توان|توان مصرفی|قدرت|توان خروجی|حداکثر توان خروجی)$/u],
  ['اتصال', /^(نوع اتصال|نحوه اتصال)$/u],
  ['بلوتوث', /^(نسخه بلوتوث|بلوتوث)$/u],
  ['شارژدهی', /^(شارژدهی ایرفون|مدت زمان استفاده در حالت موسیقی|شارژدهی)$/u],
  ['کاربرد', /^کاربرد$/u],
  ['نوع', /^نوع$/u],
  ['جنس', /^(جنس|جنس بدنه)$/u],
];

/** Shortened spec value: first clause, unit abbreviations, ≤ 28 chars. */
export function shortValue(v: string): string {
  let s = v.split(/[،,؛(]/u)[0].trim();
  s = s.replace(/گیگابایت/gu, 'گیگ').replace(/میلی‌?آمپر ?ساعت/gu, 'mAh').replace(/مگاپیکسل/gu, 'مگاپیکسل');
  if (s.length > 28) s = s.slice(0, 27) + '…';
  return s;
}

/** Up to `n` card specs ({k: label, v: value}). */
export function keySpecs(specs: Spec[] | null | undefined, n = 5): KeySpec[] {
  if (!specs?.length) return [];
  const out: KeySpec[] = [];
  for (const [label, re] of KEY_SPECS) {
    if (out.length >= n) break;
    const s = specs.find((x) => x?.key && re.test(x.key.trim()) && x.value && x.value !== 'ندارد');
    if (s) out.push({ k: label, v: shortValue(s.value) });
  }
  return out;
}

/** First number in a spec value («۶ گیگابایت» → 6, «۵۰۰۰ میلی‌آمپرساعت» → 5000). */
export function specNumber(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = toEnDigits(v).match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function specValue(specs: Spec[] | null | undefined, label: string): string | null {
  const entry = KEY_SPECS.find(([l]) => l === label);
  if (!entry || !specs) return null;
  return specs.find((x) => x?.key && entry[1].test(x.key.trim()))?.value ?? null;
}

export type CompareRow = { key: string; values: Array<string | null> };

/**
 * Spec keys whose values differ across products (≤ maxRows), card-worthy keys first.
 * Missing values are null so the UI can print «ثبت نشده».
 */
export function diffSpecs(all: Array<Spec[] | null>, maxRows = 12): CompareRow[] {
  const maps = all.map((specs) => {
    const m = new Map<string, string>();
    for (const s of specs ?? []) if (s?.key && s.value && !m.has(s.key.trim())) m.set(s.key.trim(), s.value.trim());
    return m;
  });
  const keyOrder: string[] = [];
  const seen = new Set<string>();
  // priority keys first
  for (const [, re] of KEY_SPECS)
    for (const m of maps)
      for (const k of m.keys())
        if (re.test(k) && !seen.has(k)) {
          seen.add(k);
          keyOrder.push(k);
        }
  // then keys present in at least two products
  const counts = new Map<string, number>();
  for (const m of maps) for (const k of m.keys()) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const [k, c] of counts) if (c >= Math.min(2, maps.length) && !seen.has(k)) {
    seen.add(k);
    keyOrder.push(k);
  }
  const rows: CompareRow[] = [];
  for (const k of keyOrder) {
    const values = maps.map((m) => m.get(k) ?? null);
    const distinct = new Set(values.map((v) => (v === null ? '∅' : normalizeFa(v))));
    if (distinct.size <= 1) continue;
    if (values.some((v) => v && v.length > 60)) continue;
    rows.push({ key: k, values: values.map((v) => (v ? toFaDigits(shortValue(v)) : null)) });
    if (rows.length >= maxRows) break;
  }
  return rows;
}
