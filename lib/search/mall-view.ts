import { q } from '../db/client';
import { floorText } from '../data/mall';
import { dayKeyOf, dayStats, visitSentence } from '../data/hours-stats';
import type { WeeklyHours } from '../data/hours';
import type { Freshness, PriceFlag } from '../data/quality';
import { compareFloors, floorTabLabel, groupFloors, type FloorShop } from '../data/mall-floors';
import type { ShopType } from '../data/shop-types';
import type { FollowupStatus, SessionState } from '../agent/state';
import { toFaDigits } from '../fa/digits';
import { bbox, haversine } from '../geo';
import { loadShopTypes } from './shop-types';

export type MallShop = FloorShop & {
  unit_kind: string | null;
  type: ShopType;
  offer: { offer_id: string; price: number | null; price_flag: PriceFlag; freshness: Freshness; price_age_days: number | null; followup_status: FollowupStatus | null } | null;
};
export type MallFloor = { floor_num: number | null; tab: string; title: string; shops: MallShop[]; sellers: number; neighbours: number };
export type MallViewOutput = {
  ui: 'mall_view';
  mall: { key: string; name: string; shop_count: number; lat: number; lon: number; floors: MallFloor[] };
  product: { product_id: string; title: string } | null;
  category: string | null;
  sellers: number;
  hours_summary: string;
  nearby_malls: Array<{ mall_key: string; name: string; distance_m: number; seller_count: number }>;
};

/** F2: one mall floor by floor — sellers of the product first, then same-category neighbours, then the rest. */
export async function mallView(opts: { mall_key: string; product_id?: string | null; category?: string | null; state: SessionState; now: Date }): Promise<MallViewOutput> {
  const shops = await q<{ shop_id: string; name: string; unit_label: string | null; unit_kind: string | null; floor_num: number | null; floor_label: string | null; category_names: string[] | null; weekly_hours: WeeklyHours; lat: number; lon: number; mall_name: string | null }>(
    `SELECT shop_id, name, unit_label, unit_kind, floor_num, floor_label, category_names, weekly_hours, lat, lon, mall_name FROM shops WHERE mall_key = $1`,
    [opts.mall_key],
  );
  if (!shops.length) throw new Error('این پاساژ در داده‌ها پیدا نشد.');
  const productId = opts.product_id ?? opts.state.chosenProduct ?? null;
  const [product] = productId ? await q<{ product_id: string; persian_title: string; category_name: string | null }>('SELECT product_id, persian_title, category_name FROM products WHERE product_id = $1', [productId]) : [];
  const category = opts.category ?? product?.category_name ?? null;
  const offers = product
    ? await q<{ shop_id: string; offer_id: string; price: number | null; price_flag: PriceFlag; freshness: Freshness; price_age_days: number | null }>(
        `SELECT DISTINCT ON (shop_id) shop_id, offer_id, price_toman::float8 AS price, price_flag, freshness, price_age_days
           FROM offers WHERE product_id = $1 AND shop_id = ANY($2::text[])
          ORDER BY shop_id, (price_flag = 'ok') DESC, price_toman ASC NULLS LAST`,
        [product.product_id, shops.map((s) => s.shop_id)],
      )
    : [];
  const byShop = new Map(offers.map((o) => [o.shop_id, o]));
  const types = await loadShopTypes();
  const rows: MallShop[] = shops.map((s) => {
    const o = byShop.get(s.shop_id);
    return {
      shop_id: s.shop_id,
      name: s.name,
      unit_label: s.unit_label ? toFaDigits(s.unit_label) : null,
      unit_kind: s.unit_kind,
      floor_num: s.floor_num,
      offer_price: o?.price ?? null,
      has_offer: Boolean(o),
      same_category: !o && Boolean(category && (s.category_names ?? []).includes(category)),
      type: types.get(s.shop_id) ?? 'other',
      offer: o ? { offer_id: o.offer_id, price: o.price, price_flag: o.price_flag, freshness: o.freshness, price_age_days: o.price_age_days, followup_status: opts.state.followups[o.offer_id] ?? null } : null,
    };
  });
  const floors: MallFloor[] = groupFloors(rows)
    .sort((a, b) => compareFloors(a.floor_num, b.floor_num))
    .map((f) => ({
      floor_num: f.floor_num,
      tab: floorTabLabel(f.floor_num),
      title: f.floor_num === null ? 'طبقه ثبت نشده' : (floorText(f.floor_num) ?? floorTabLabel(f.floor_num)),
      shops: f.shops,
      sellers: f.shops.filter((s) => s.has_offer).length,
      neighbours: f.shops.filter((s) => s.same_category).length,
    }));
  const lat = shops.reduce((a, s) => a + s.lat, 0) / shops.length;
  const lon = shops.reduce((a, s) => a + s.lon, 0) / shops.length;
  const name = shops.find((s) => s.mall_name)?.mall_name ?? opts.mall_key;
  const today = dayStats(shops, dayKeyOf(opts.now));
  const fri = dayStats(shops, 'fri');

  // other malls within 600 m (shops listing the product there, when a product is chosen)
  const b = bbox(lat, lon, 600);
  const near = await q<{ mall_key: string; name: string; lat: number; lon: number; sellers: number }>(
    `SELECT s.mall_key, max(s.mall_name) AS name, avg(s.lat) AS lat, avg(s.lon) AS lon,
            count(DISTINCT o.shop_id)::int AS sellers
       FROM shops s LEFT JOIN offers o ON o.shop_id = s.shop_id AND o.product_id = $6
      WHERE s.mall_key IS NOT NULL AND s.mall_key <> $1 AND s.lat BETWEEN $2 AND $3 AND s.lon BETWEEN $4 AND $5
      GROUP BY s.mall_key HAVING count(DISTINCT s.shop_id) >= 3`,
    [opts.mall_key, b.minLat, b.maxLat, b.minLon, b.maxLon, product?.product_id ?? null],
  );
  const nearby = near
    .map((m) => ({ mall_key: m.mall_key, name: m.name, distance_m: Math.round(haversine(lat, lon, m.lat, m.lon)), seller_count: m.sellers }))
    .filter((m) => m.distance_m <= 600)
    .sort((a, b2) => (product ? b2.seller_count - a.seller_count : 0) || a.distance_m - b2.distance_m)
    .slice(0, 5);

  return {
    ui: 'mall_view',
    mall: { key: opts.mall_key, name, shop_count: shops.length, lat, lon, floors },
    product: product ? { product_id: product.product_id, title: product.persian_title.split('|')[0].trim() } : null,
    category,
    sellers: rows.filter((r) => r.has_offer).length,
    hours_summary: visitSentence(today, fri, 'مغازه‌های پاساژ'),
    nearby_malls: nearby,
  };
}
