import { toEnDigits } from '../fa/digits';
import { formatToman, relativeDays } from '../fa/format';

/**
 * F4 — a message the user can send themselves (WhatsApp / SMS / Bale / copy). Pure; the text is a
 * template (≤ 450 chars) built only from the offer's data, so it can be shown and edited instantly.
 */
export type MessageIntent = 'availability' | 'price' | 'hours' | 'reserve' | 'custom';
export const INTENT_LABEL: Record<MessageIntent, string> = { availability: 'موجودی', price: 'قیمت', hours: 'ساعت کاری', reserve: 'رزرو', custom: 'دلخواه' };

export type ComposeInput = {
  shop_name: string;
  product_title: string;
  price: number | null;
  price_age_days: number | null;
  mall: { name: string | null; floor_label: string | null; unit_label: string | null; unit_kind?: string | null } | null;
  intent: MessageIntent;
  note?: string;
  target_price?: number | null;
};

export const MAX_MESSAGE = 450;

const shortTitle = (t: string) => t.split('|')[0].replace(/\s+/g, ' ').trim();

export function composeSellerMessage(i: ComposeInput): string {
  let title = shortTitle(i.product_title);
  const about = () =>
    i.price
      ? `درباره «${title}» با قیمت ${formatToman(i.price)} که در ترب ثبت کرده‌اید (آخرین تغییر قیمت ${relativeDays(i.price_age_days)} در ترب) سؤال داشتم.`
      : `درباره «${title}» که در ترب ثبت کرده‌اید سؤال داشتم.`;
  const ask: Record<MessageIntent, string> = {
    availability: 'الان موجود دارید و قیمت امروزش همین است؟',
    price: i.target_price ? `قیمت نهایی امروز چند است؟ اگر با ${formatToman(i.target_price)} ممکن است، همین امروز حضوری می‌آیم.` : 'قیمت نهایی امروزش همین است؟',
    hours: 'امروز تا چه ساعتی باز هستید؟',
    reserve: 'اگر موجود است، تا امروز عصر برایم نگه می‌دارید؟',
    custom: i.note?.trim() || 'لطفاً موجودی و قیمت امروز را بفرمایید.',
  };
  const place = i.mall && (i.mall.name || i.mall.floor_label || i.mall.unit_label)
    ? `آدرس را درست دارم؟ ${[i.mall.name, i.mall.floor_label, i.mall.unit_label ? `${i.mall.unit_kind ?? 'واحد'} ${i.mall.unit_label}` : null].filter(Boolean).join('، ')}`
    : null;
  const build = () => [`سلام وقت بخیر، ${i.shop_name}.`, about(), ask[i.intent], i.intent !== 'custom' && i.note?.trim() ? i.note.trim() : null, place, 'ممنون.'].filter(Boolean).join('\n');
  let text = build();
  while (text.length > MAX_MESSAGE && title.length > 20) {
    title = `${title.slice(0, Math.max(20, title.length - 15)).trim()}…`;
    text = build();
  }
  return text.slice(0, MAX_MESSAGE);
}

export type Channel = { type: 'whatsapp' | 'sms' | 'bale' | 'copy'; label: string; url?: string };

/** «۰۲۱۲۶۴۶۷۱۸۰» → national «02126467180» and international «982126467180» (null when not a number). */
export function phoneDigits(display: string): { national: string; international: string } | null {
  const d = toEnDigits(display).replace(/[^\d+]/g, '');
  if (d.length < 8) return null;
  const national = d.startsWith('+98') ? `0${d.slice(3)}` : d.startsWith('98') && d.length > 11 ? `0${d.slice(2)}` : d;
  return { national, international: `98${national.replace(/^0/, '')}` };
}

/** Links that open the user's own apps with the text filled in; copy is always offered. */
export function channelLinks(contacts: Array<{ channel?: string; display_number?: string; handle?: string }> | null, text: string): Channel[] {
  const out: Channel[] = [];
  const phone = (contacts ?? []).map((c) => (c.channel === 'phone' && c.display_number ? phoneDigits(c.display_number) : null)).find(Boolean);
  const body = encodeURIComponent(text);
  if (phone) {
    out.push({ type: 'whatsapp', label: 'واتس‌اپ', url: `https://wa.me/${phone.international}?text=${body}` });
    out.push({ type: 'sms', label: 'پیامک', url: `sms:${phone.national}?body=${body}` });
  }
  const bale = (contacts ?? []).find((c) => c.channel === 'bale' && c.handle);
  if (bale?.handle) out.push({ type: 'bale', label: 'بله', url: `https://ble.ir/${bale.handle.replace(/^@/, '')}` });
  out.push({ type: 'copy', label: 'کپی متن' });
  return out;
}
