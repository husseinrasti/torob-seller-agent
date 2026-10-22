import { q } from '../db/client';
import { haversine } from '../geo';
import { floorText } from '../data/mall';
import { formatToman } from '../fa/format';
import { toFaDigits } from '../fa/digits';
import type { Freshness, PriceFlag } from '../data/quality';
import { findSellers, type MallRef, type SellerRow } from './sellers';

export type AltReason = 'out_of_stock' | 'price_changed' | 'closed' | 'no_answer';

export type SimilarOffer = {
  offer_id: string;
  product_id: string;
  title: string;
  image: string | null;
  price: number | null;
  price_flag: PriceFlag;
  freshness: Freshness;
  price_age_days: number | null;
  shop_id: string;
  shop_name: string;
  mall: MallRef | null;
  distance_m: number;
  lat: number;
  lon: number;
  same_shop: boolean;
  why: string;
};

export type AlternativesResult = {
  reason: AltReason;
  origin: { offer_id: string; shop_id: string; shop_name: string; product_id: string; product_title: string; mall_name: string | null; price: number | null };
  same_product: Array<SellerRow & { same_mall: boolean }>;
  similar: SimilarOffer[];
};

/**
 * Spec §6.2/§8: (a) the same product at other sellers — same mall first (+0.2), then by seller score;
 * (b) similar products (same category, price ±20%) in the same shop or the same mall. Max 3 + 3.
 */
export async function findAlternatives(opts: {
  offerId: string;
  reason: AltReason;
  lat: number;
  lon: number;
  radius_m: number;
  now: Date;
  excludeShopIds?: string[];
}): Promise<AlternativesResult | null> {
  const [o] = await q<{
    offer_id: string;
    product_id: string;
    shop_id: string;
    price: number | null;
    shop_name: string;
    mall_key: string | null;
    mall_name: string | null;
    persian_title: string;
    category_name: string | null;
    median_price: number | null;
  }>(
    `SELECT o.offer_id, o.product_id, o.shop_id, o.price_toman::float8 AS price, s.name AS shop_name, s.mall_key, s.mall_name,
            p.persian_title, p.category_name, p.median_price::float8 AS median_price
       FROM offers o JOIN shops s USING (shop_id) JOIN products p USING (product_id) WHERE o.offer_id = $1`,
    [opts.offerId],
  );
  if (!o) return null;
  const exclude = new Set([o.shop_id, ...(opts.excludeShopIds ?? [])]);

  // (a) same product elsewhere (widen the radius a little so there is something to offer)
  const sellers = await findSellers({
    product_ids: [o.product_id],
    lat: opts.lat,
    lon: opts.lon,
    radius_m: Math.max(opts.radius_m, 2000),
    intent: opts.reason === 'closed' || opts.reason === 'no_answer' ? 'now' : 'balanced',
    now: opts.now,
  });
  const same = sellers.rows
    .filter((r) => !exclude.has(r.shop_id) && (opts.reason !== 'closed' || r.open.open !== false))
    .map((r) => ({ ...r, same_mall: Boolean(o.mall_key && r.mall?.key === o.mall_key) }))
    .sort((a, b) => b.score + (b.same_mall ? 0.2 : 0) - (a.score + (a.same_mall ? 0.2 : 0)))
    .slice(0, 3)
    .map((r) => {
      const where = r.same_mall ? `همین پاساژ${r.mall?.floor_label ? ` · ${r.mall.floor_label}` : ''}` : r.why[0] ?? `${toFaDigits(Math.round(r.distance_m))} متر`;
      const price = r.price !== null ? formatToman(r.price) : 'قیمت ثبت نشده';
      return { ...r, why: [`همین کالا، ${where}`, price] };
    });

  // (b) similar products in the same shop or the same mall
  const ref = o.price ?? o.median_price;
  let similar: SimilarOffer[] = [];
  if (ref && o.category_name) {
    const rows = await q<{
      offer_id: string;
      product_id: string;
      persian_title: string;
      primary_image: string | null;
      price: number;
      price_flag: PriceFlag;
      freshness: Freshness;
      price_age_days: number | null;
      shop_id: string;
      name: string;
      mall_key: string | null;
      mall_name: string | null;
      floor_label: string | null;
      floor_num: number | null;
      unit_label: string | null;
      unit_kind: string | null;
      lat: number;
      lon: number;
    }>(
      `SELECT o.offer_id, o.product_id, p.persian_title, p.primary_image, o.price_toman::float8 AS price, o.price_flag, o.freshness,
              o.price_age_days, s.shop_id, s.name, s.mall_key, s.mall_name, s.floor_label, s.floor_num, s.unit_label, s.unit_kind, s.lat, s.lon
         FROM offers o JOIN products p USING (product_id) JOIN shops s USING (shop_id)
        WHERE p.category_name = $1 AND o.product_id <> $2 AND o.price_flag = 'ok'
          AND o.price_toman BETWEEN $3 AND $4
          AND (o.shop_id = $5 OR ($6::text IS NOT NULL AND s.mall_key = $6))
        ORDER BY (o.shop_id = $5) DESC, p.seller_count DESC, abs(o.price_toman - $7) ASC
        LIMIT 20`,
      [o.category_name, o.product_id, ref * 0.8, ref * 1.2, o.shop_id, o.mall_key, ref],
    );
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.product_id)) continue;
      seen.add(r.product_id);
      const sameShop = r.shop_id === o.shop_id;
      const diff = Math.round(((r.price - ref) / ref) * 100);
      const priceNote = diff === 0 ? 'هم‌قیمت' : diff < 0 ? `${toFaDigits(-diff)}٪ ارزان‌تر` : `${toFaDigits(diff)}٪ گران‌تر`;
      similar.push({
        offer_id: r.offer_id,
        product_id: r.product_id,
        title: r.persian_title,
        image: r.primary_image,
        price: r.price,
        price_flag: r.price_flag,
        freshness: r.freshness,
        price_age_days: r.price_age_days,
        shop_id: r.shop_id,
        shop_name: r.name,
        mall: r.mall_key || r.floor_num !== null || r.unit_label
          ? { key: r.mall_key, name: r.mall_name, floor_label: floorText(r.floor_num, r.floor_label), floor_num: r.floor_num, unit_label: r.unit_label ? toFaDigits(r.unit_label) : null, unit_kind: r.unit_kind }
          : null,
        distance_m: Math.round(haversine(opts.lat, opts.lon, r.lat, r.lon)),
        lat: r.lat,
        lon: r.lon,
        same_shop: sameShop,
        why: `${sameShop ? 'مشابه، در همین مغازه' : `مشابه در ${r.mall_name ?? 'همین پاساژ'}${r.floor_num !== null ? ` · ${floorText(r.floor_num, r.floor_label)}` : ''}`} · ${priceNote}`,
      });
      if (similar.length >= 3) break;
    }
  }
  similar = similar.slice(0, 3);

  return {
    reason: opts.reason,
    origin: { offer_id: o.offer_id, shop_id: o.shop_id, shop_name: o.shop_name, product_id: o.product_id, product_title: o.persian_title, mall_name: o.mall_name, price: o.price },
    same_product: same,
    similar,
  };
}
