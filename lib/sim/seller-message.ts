import { q } from '../db/client';
import { HttpError } from '../http';
import { floorText } from '../data/mall';
import { toFaDigits } from '../fa/digits';
import { channelLinks, composeSellerMessage, type Channel, type MessageIntent } from './compose';

export type SellerContact = { channel?: string; display_number?: string; handle?: string };
export type SellerMessageOutput = {
  ui: 'seller_message';
  offer_id: string;
  shop_name: string;
  product_title: string;
  intent: MessageIntent;
  target_price: number | null;
  text: string;
  contacts: SellerContact[];
  channels: Channel[];
  disclaimer: string;
};

export const DATASET_PHONES_NOTE = 'شماره‌های دیتاست آزمایشی‌اند؛ لینک‌ها واقعی کار می‌کنند ولی به شماره واقعی فروشگاه نمی‌رسند.';

/** F4: the offer's data → a ready-to-send message and links to the user's own apps (no LLM). */
export async function sellerMessage(opts: { offer_id: string; intent: MessageIntent; note?: string; target_price?: number | null }): Promise<SellerMessageOutput> {
  const [r] = await q<{
    offer_id: string;
    price: number | null;
    price_age_days: number | null;
    title: string;
    name: string;
    contacts: SellerContact[] | null;
    mall_name: string | null;
    floor_num: number | null;
    floor_label: string | null;
    unit_label: string | null;
    unit_kind: string | null;
  }>(
    `SELECT o.offer_id, o.price_toman::float8 AS price, o.price_age_days, p.persian_title AS title, s.name, s.contacts,
            s.mall_name, s.floor_num, s.floor_label, s.unit_label, s.unit_kind
       FROM offers o JOIN products p USING (product_id) JOIN shops s USING (shop_id) WHERE o.offer_id = $1`,
    [opts.offer_id],
  );
  if (!r) throw new HttpError(404, 'این پیشنهاد پیدا نشد.');
  const text = composeSellerMessage({
    shop_name: r.name,
    product_title: r.title,
    price: r.price,
    price_age_days: r.price_age_days,
    mall: r.mall_name || r.floor_num !== null || r.unit_label ? { name: r.mall_name, floor_label: floorText(r.floor_num, r.floor_label), unit_label: r.unit_label ? toFaDigits(r.unit_label) : null, unit_kind: r.unit_kind } : null,
    intent: opts.intent,
    note: opts.note,
    target_price: opts.target_price ?? null,
  });
  const contacts = r.contacts ?? [];
  return {
    ui: 'seller_message',
    offer_id: r.offer_id,
    shop_name: r.name,
    product_title: r.title.split('|')[0].trim(),
    intent: opts.intent,
    target_price: opts.target_price ?? null,
    text,
    contacts,
    channels: channelLinks(contacts, text),
    disclaimer: DATASET_PHONES_NOTE,
  };
}
