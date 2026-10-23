import { formatToman, formatTomanShort, relativeDays } from '../../fa/format';
import { toFaDigits } from '../../fa/digits';
import type { MissionRow, Verdict } from './types';

/** Pure verdict rules shared by the server (report) and the client (live follow-up updates). */

export type Band = { min?: number; max?: number } | null;
type RowIn = Pick<MissionRow, 'price' | 'price_flag' | 'freshness' | 'price_age_days' | 'open' | 'followup'>;

/** The price to judge: a quoted new price after a follow-up, else the listed one. */
export function effectivePrice(r: Pick<MissionRow, 'price' | 'followup'>): number | null {
  return r.followup?.status === 'price_changed' && r.followup.new_price ? r.followup.new_price : r.price;
}

export function inBand(price: number | null, band: Band): boolean {
  if (price === null) return false;
  if (!band) return true;
  return (!band.min || price >= band.min) && (!band.max || price <= band.max);
}

export function bandLabel(band: Band): string {
  if (!band) return '';
  if (band.min && band.max) return `${formatTomanShort(band.min).replace(' میلیون', '')}–${formatTomanShort(band.max)}`;
  if (band.max) return `تا ${formatTomanShort(band.max)}`;
  return `از ${formatTomanShort(band.min!)}`;
}

/**
 * recommended = in the budget band AND (follow-up confirmed OR fresh price) AND open (or hours unknown, not closed);
 * avoid = out of stock OR suspicious price OR closed with no opening later today;
 * unknown = not confirmed and the price is stale/undated; otherwise ok.
 */
export function verdictFor(r: RowIn, band: Band): { verdict: Verdict; reason: string } {
  const st = r.followup?.status;
  const confirmed = st === 'confirmed' || st === 'price_changed';
  const price = effectivePrice({ price: r.price, followup: r.followup });
  if (st === 'out_of_stock') return { verdict: 'avoid', reason: 'فروشنده گفت این کالا را ندارد' };
  if (!confirmed && (r.price_flag === 'suspicious_low' || r.price_flag === 'suspicious_high')) {
    return { verdict: 'avoid', reason: r.price_flag === 'suspicious_low' ? 'قیمت ثبت‌شده به‌طور مشکوکی پایین است' : 'قیمت ثبت‌شده به‌طور مشکوکی بالاست' };
  }
  if (r.open.known && r.open.open === false && !r.open.opensAt) return { verdict: 'avoid', reason: `امروز دیگر باز نمی‌شود (${r.open.label})` };

  const fresh = r.freshness === 'fresh';
  const okBand = inBand(price, band);
  const notClosed = r.open.open !== false;
  const stockWhy = st === 'confirmed' ? 'موجودی تأیید شد' : st === 'price_changed' ? `موجود با قیمت جدید ${formatToman(price)}` : null;
  const priceWhy = fresh ? `قیمت ${relativeDays(r.price_age_days)} به‌روز شده` : null;
  const openWhy = r.open.open === true ? 'الان باز است' : 'ساعت کاری ثبت نشده';
  if (okBand && (confirmed || fresh) && notClosed) {
    return { verdict: 'recommended', reason: [band ? 'در بازه بودجه' : null, stockWhy ?? priceWhy, openWhy].filter(Boolean).join(' · ') };
  }
  const why: string[] = [];
  if (price === null) why.push('قیمت ثبت نشده');
  else if (!okBand) why.push(`خارج از بازه بودجه (${formatTomanShort(price)})`);
  if (!confirmed) {
    if (st === 'no_answer') why.push('به پیگیری جواب نداد');
    else if (st === 'pending' || st === 'contacting') why.push('در انتظار پاسخ فروشنده');
    if (r.freshness === 'stale') why.push(`قیمت ${relativeDays(r.price_age_days)} ثبت شده و تأیید نشده`);
    else if (r.freshness === 'unknown') why.push('تاریخ قیمت نامعلوم و تأیید نشده');
    else if (r.freshness === 'recent') why.push(`قیمت ${relativeDays(r.price_age_days)} ثبت شده`);
  } else if (stockWhy) why.push(stockWhy);
  if (r.open.open === false) why.push(r.open.label);
  if (!confirmed && (r.freshness === 'stale' || r.freshness === 'unknown')) return { verdict: 'unknown', reason: why.join(' · ') };
  return { verdict: 'ok', reason: why.join(' · ') || 'گزینه قابل قبول' };
}

/** Best recommended row: cheapest for «ارزان‌ترین», else the first by the seller ranking. */
export function pickRecommendation(rows: MissionRow[], intent: string): { offer_id: string; reason: string } | null {
  const ok = rows.filter((r) => r.verdict === 'recommended');
  if (!ok.length) return null;
  const best = intent === 'cheapest' ? [...ok].sort((a, b) => (effectivePrice(a) ?? Infinity) - (effectivePrice(b) ?? Infinity))[0] : ok[0];
  const price = effectivePrice(best);
  return { offer_id: best.offer_id, reason: `«${best.shop_name}»${price ? ` با ${formatToman(price)}` : ''}: ${best.verdict_reason}` };
}

/** «پیشنهادی ندارم چون…» — the dominant reason no row qualifies. */
export function noRecommendationNote(rows: MissionRow[], band: Band): string {
  if (!rows.length) return 'پیشنهادی ندارم چون در این محدوده فروشنده‌ای برای این کالا در داده‌های ترب ثبت نشده است.';
  const inBandRows = rows.filter((r) => inBand(effectivePrice(r), band));
  if (!inBandRows.length) {
    if (!band) return 'پیشنهادی ندارم چون قیمت هیچ‌کدام ثبت نشده است.';
    const mid = ((band.min ?? band.max ?? 0) + (band.max ?? band.min ?? 0)) / 2;
    const closest = rows
      .map((r) => effectivePrice(r))
      .filter((p): p is number => p !== null)
      .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    return `پیشنهادی ندارم چون قیمت هیچ فروشنده‌ای داخل بازه ${bandLabel(band)} تومان نیست${closest ? `؛ نزدیک‌ترین قیمت ${formatToman(closest)} است` : ''}.`;
  }
  const usable = inBandRows.filter((r) => r.verdict !== 'avoid');
  if (!usable.length) {
    const one = inBandRows.length === 1 ? inBandRows[0] : null;
    return one
      ? `پیشنهادی ندارم چون تنها فروشنده داخل بازه («${one.shop_name}») کنار گذاشته شد: ${one.verdict_reason}.`
      : `پیشنهادی ندارم چون هر ${toFaDigits(inBandRows.length)} فروشنده داخل بازه کنار گذاشته شدند (ناموجود، قیمت مشکوک یا تعطیل امروز).`;
  }
  if (usable.some((r) => r.followup && (r.followup.status === 'pending' || r.followup.status === 'contacting'))) {
    return 'هنوز پیشنهاد قطعی ندارم: جواب بعضی فروشنده‌ها در راه است و این جدول خودش به‌روز می‌شود.';
  }
  if (usable.every((r) => r.open.open === false)) return 'پیشنهادی ندارم چون فروشنده‌های داخل بازه الان بسته‌اند؛ زمان بازگشایی‌شان در جدول آمده.';
  return `پیشنهادی ندارم چون قیمت ${toFaDigits(usable.length)} فروشنده داخل بازه نه تازه است و نه با پیگیری تأیید شد.`;
}
