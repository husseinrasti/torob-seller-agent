import { q } from '../db/client';
import { bbox, haversine, navLinks, RADIUS_STEPS, SQL_DISTANCE } from '../geo';
import { openState, todayHoursText, hoursKnown, type WeeklyHours } from '../data/hours';
import { floorText } from '../data/mall';
import { toFaDigits } from '../fa/digits';
import type { Freshness, PriceFlag } from '../data/quality';
import type { ShopType } from '../data/shop-types';
import {
  activeFilters,
  FILTER_LABEL,
  passesFilters,
  scoreSellers,
  whyPhrases,
  type Breakdown,
  type Filters,
  type Intent,
} from './score';
import { shopTypeOf } from './shop-types';

export type MallRef = { key: string | null; name: string | null; floor_label: string | null; floor_num: number | null; unit_label: string | null; unit_kind: string | null };

export type SellerRow = {
  offer_id: string;
  shop_id: string;
  product_id: string;
  shop_name: string;
  price: number | null;
  price_flag: PriceFlag;
  freshness: Freshness;
  price_age_days: number | null;
  distance_m: number;
  lat: number;
  lon: number;
  open: { known: boolean; open: boolean | null; label: string; closesAt?: string };
  mall: MallRef | null;
  address_short: string;
  conditions: {
    installment: boolean;
    installment_in_person: boolean;
    torobpay: boolean;
    torobpay_in_person: boolean;
    fast_delivery: boolean | null;
    warranty_text: string | null;
    has_warranty: boolean;
  };
  offer_count: number;
  hours_known: boolean;
  score: number;
  score_breakdown: Breakdown;
  why: string[];
};

export type MaybeShop = {
  shop_id: string;
  shop_name: string;
  distance_m: number;
  lat: number;
  lon: number;
  mall: MallRef | null;
  address_short: string;
  open: { known: boolean; open: boolean | null; label: string };
  label: 'فقط دسته فعالیت';
};

export type Cluster = { mall_key: string; mall_name: string; count: number; best_price: number | null };

export type SellersResult = {
  product: {
    product_id: string;
    title: string;
    image: string | null;
    category: string | null;
    min_price: number | null;
    median_price: number | null;
    seller_count: number;
  } | null;
  params: { lat: number; lon: number; radius_m: number; intent: Intent; filters: Filters; at: string };
  total_in_radius: number;
  count: number;
  rows: SellerRow[];
  clusters: Cluster[];
  maybe_shops: MaybeShop[];
  relaxations: Array<{ filter: keyof Filters; label: string; would_add: number }>;
  radius_suggestion: { radius_m: number; count: number } | null;
};

const MALL_WORDS = /(پاساژ|مجتمع|مرکز خرید|بازار|طبقه|واحد|پلاک|غرفه)/u;

/** Street part of the address (mall/floor/unit are shown separately). */
export function shortAddress(address: string | null): string {
  if (!address) return 'نشانی ثبت نشده';
  const parts = address.split(/[،,]/).map((s) => s.trim()).filter(Boolean);
  const street = parts.filter((p) => !MALL_WORDS.test(p)).slice(0, 2);
  return toFaDigits((street.length ? street : parts.slice(0, 1)).join('، '));
}

function mallRef(r: { mall_key: string | null; mall_name: string | null; floor_label: string | null; floor_num: number | null; unit_label: string | null; unit_kind: string | null }): MallRef | null {
  if (!r.mall_key && r.floor_num === null && !r.unit_label) return null;
  return {
    key: r.mall_key,
    name: r.mall_name,
    floor_label: floorText(r.floor_num, r.floor_label),
    floor_num: r.floor_num,
    unit_label: r.unit_label ? toFaDigits(r.unit_label) : null,
    unit_kind: r.unit_kind,
  };
}

type RawSeller = {
  offer_id: string;
  product_id: string;
  shop_id: string;
  price: number | null;
  price_flag: PriceFlag;
  freshness: Freshness;
  price_age_days: number | null;
  warranty_text: string | null;
  has_warranty: boolean;
  shop_offer_count: number;
  shop_name: string;
  address: string | null;
  lat: number;
  lon: number;
  mall_key: string | null;
  mall_name: string | null;
  floor_label: string | null;
  floor_num: number | null;
  unit_label: string | null;
  unit_kind: string | null;
  weekly_hours: WeeklyHours;
  has_installment: boolean;
  has_torobpay: boolean;
  installment_in_person: boolean;
  torobpay_in_person: boolean;
  supports_fast_delivery: boolean | null;
  hours_known: boolean;
};

/** All sellers of the products, one row per shop (cheapest sane offer), regardless of distance. */
async function rawSellers(productIds: string[]): Promise<RawSeller[]> {
  return q<RawSeller>(
    `WITH c AS (
       SELECT o.offer_id, o.product_id, o.shop_id, o.price_toman::float8 AS price, o.price_flag, o.freshness,
              o.price_age_days, o.warranty_text, o.has_warranty,
              row_number() OVER (PARTITION BY o.shop_id ORDER BY (o.price_flag = 'ok') DESC, o.price_toman ASC NULLS LAST,
                                 o.price_age_days ASC NULLS LAST) AS rn,
              count(*) OVER (PARTITION BY o.shop_id) AS shop_offer_count
         FROM offers o WHERE o.product_id = ANY($1::text[]))
     SELECT c.*, s.name AS shop_name, s.address, s.lat, s.lon, s.mall_key, s.mall_name, s.floor_label, s.floor_num,
            s.unit_label, s.unit_kind, s.weekly_hours, s.has_installment, s.has_torobpay, s.installment_in_person,
            s.torobpay_in_person, s.supports_fast_delivery, s.hours_known
       FROM c JOIN shops s USING (shop_id) WHERE c.rn = 1`,
    [productIds],
  );
}

function toRow(r: RawSeller, lat: number, lon: number, now: Date) {
  const os = openState(r.weekly_hours, now);
  return {
    offer_id: r.offer_id,
    shop_id: r.shop_id,
    product_id: r.product_id,
    shop_name: r.shop_name,
    price: r.price,
    price_flag: r.price_flag,
    freshness: r.freshness,
    price_age_days: r.price_age_days,
    distance_m: Math.round(haversine(lat, lon, r.lat, r.lon)),
    lat: r.lat,
    lon: r.lon,
    open: { known: os.known, open: os.open, label: os.label, closesAt: os.closesAt },
    mall: mallRef(r),
    address_short: shortAddress(r.address),
    conditions: {
      installment: r.has_installment,
      installment_in_person: r.installment_in_person,
      torobpay: r.has_torobpay,
      torobpay_in_person: r.torobpay_in_person,
      fast_delivery: r.supports_fast_delivery,
      warranty_text: r.warranty_text,
      has_warranty: r.has_warranty,
    },
    offer_count: Number(r.shop_offer_count),
    hours_known: r.hours_known,
    // flat fields used by filters / scoring
    installment: r.has_installment,
    torobpay: r.has_torobpay,
    fast_delivery: r.supports_fast_delivery,
    has_warranty: r.has_warranty,
  };
}

async function maybeShops(productIds: string[], category: string | null, lat: number, lon: number, radiusM: number, now: Date): Promise<MaybeShop[]> {
  if (!category) return [];
  const b = bbox(lat, lon, radiusM);
  const rows = await q<{
    shop_id: string;
    name: string;
    address: string | null;
    lat: number;
    lon: number;
    mall_key: string | null;
    mall_name: string | null;
    floor_label: string | null;
    floor_num: number | null;
    unit_label: string | null;
    unit_kind: string | null;
    weekly_hours: WeeklyHours;
    d: number;
  }>(
    `SELECT s.shop_id, s.name, s.address, s.lat, s.lon, s.mall_key, s.mall_name, s.floor_label, s.floor_num, s.unit_label,
            s.unit_kind, s.weekly_hours, ${SQL_DISTANCE('$2', '$3')} AS d
       FROM shops s
      WHERE s.category_names ? $1 AND s.lat BETWEEN $4 AND $5 AND s.lon BETWEEN $6 AND $7
        AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.shop_id = s.shop_id AND o.product_id = ANY($8::text[]))
        AND ${SQL_DISTANCE('$2', '$3')} <= $9
      ORDER BY d LIMIT 5`,
    [category, lat, lon, b.minLat, b.maxLat, b.minLon, b.maxLon, productIds, radiusM],
  );
  return rows.map((r) => {
    const os = openState(r.weekly_hours, now);
    return {
      shop_id: r.shop_id,
      shop_name: r.name,
      distance_m: Math.round(r.d),
      lat: r.lat,
      lon: r.lon,
      mall: mallRef(r),
      address_short: shortAddress(r.address),
      open: { known: os.known, open: os.open, label: os.label },
      label: 'فقط دسته فعالیت' as const,
    };
  });
}

export type FindSellersInput = {
  product_ids: string[];
  lat: number;
  lon: number;
  radius_m: number;
  filters?: Filters;
  intent?: Intent;
  now?: Date;
};

/** Spec §5.4: sellers within radius, filters, explainable score, clusters, category-only shops, relaxations. */
export async function findSellers(input: FindSellersInput): Promise<SellersResult> {
  const { product_ids, lat, lon } = input;
  const radius = input.radius_m;
  const filters = input.filters ?? {};
  const intent = input.intent ?? 'balanced';
  const now = input.now ?? new Date();

  const [productRows, raw] = await Promise.all([
    q<{ product_id: string; persian_title: string; primary_image: string | null; category_name: string | null; min_price: number | null; median_price: number | null; seller_count: number }>(
      `SELECT product_id, persian_title, primary_image, category_name, min_price::float8 AS min_price,
              median_price::float8 AS median_price, seller_count FROM products WHERE product_id = ANY($1::text[])`,
      [product_ids],
    ),
    rawSellers(product_ids),
  ]);
  const p0 = productRows.find((p) => p.product_id === product_ids[0]) ?? productRows[0];
  const all = raw.map((r) => toRow(r, lat, lon, now));
  const within = (r: { distance_m: number }, m: number) => r.distance_m <= m;
  const inRadius = all.filter((r) => within(r, radius));
  const filtered = inRadius.filter((r) => passesFilters(r, filters));

  const scored = scoreSellers(filtered, radius, intent, filters);
  const okPrices = scored.filter((r) => r.price !== null && r.price_flag === 'ok').map((r) => r.price!);
  const minPrice = okPrices.length ? Math.min(...okPrices) : null;
  const minDistance = scored.length ? Math.min(...scored.map((r) => r.distance_m)) : 0;
  const rows: SellerRow[] = scored
    .map((r) => {
      const { installment: _i, torobpay: _t, fast_delivery: _f, has_warranty: _w, ...rest } = r;
      void _i; void _t; void _f; void _w;
      return { ...rest, why: whyPhrases(r, { radiusM: radius, intent, minPrice, minDistance, medianPrice: p0?.median_price ?? null }) };
    })
    .sort((a, b) => b.score - a.score || a.distance_m - b.distance_m);

  // mall clusters among results
  const byMall = new Map<string, { names: Map<string, number>; count: number; best: number | null }>();
  for (const r of rows) {
    if (!r.mall?.key) continue;
    const c = byMall.get(r.mall.key) ?? { names: new Map(), count: 0, best: null };
    c.count++;
    if (r.mall.name) c.names.set(r.mall.name, (c.names.get(r.mall.name) ?? 0) + 1);
    if (r.price !== null && r.price_flag === 'ok') c.best = c.best === null ? r.price : Math.min(c.best, r.price);
    byMall.set(r.mall.key, c);
  }
  const clusters: Cluster[] = [...byMall.entries()]
    .filter(([, c]) => c.count >= 2)
    .map(([key, c]) => ({
      mall_key: key,
      mall_name: [...c.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key,
      count: c.count,
      best_price: c.best,
    }))
    .sort((a, b) => b.count - a.count);

  // relaxations when few results
  const relaxations: SellersResult['relaxations'] = [];
  let radiusSuggestion: SellersResult['radius_suggestion'] = null;
  if (rows.length < 3) {
    for (const f of activeFilters(filters)) {
      const without = { ...filters, [f]: f === 'max_price' ? undefined : false };
      const n = inRadius.filter((r) => passesFilters(r, without)).length;
      if (n > rows.length) relaxations.push({ filter: f, label: FILTER_LABEL[f], would_add: n - rows.length });
    }
    relaxations.sort((a, b) => b.would_add - a.would_add);
    for (const step of RADIUS_STEPS) {
      if (step <= radius) continue;
      const n = all.filter((r) => within(r, step) && passesFilters(r, filters)).length;
      if (n >= 5 || (step === RADIUS_STEPS[RADIUS_STEPS.length - 1] && n > rows.length)) {
        radiusSuggestion = { radius_m: step, count: n };
        break;
      }
    }
  }

  return {
    product: p0
      ? {
          product_id: p0.product_id,
          title: p0.persian_title,
          image: p0.primary_image,
          category: p0.category_name,
          min_price: p0.min_price,
          median_price: p0.median_price,
          seller_count: p0.seller_count,
        }
      : null,
    params: { lat, lon, radius_m: radius, intent, filters, at: now.toISOString() },
    total_in_radius: inRadius.length,
    count: rows.length,
    rows,
    clusters,
    maybe_shops: await maybeShops(product_ids, p0?.category_name ?? null, lat, lon, radius, now),
    relaxations,
    radius_suggestion: radiusSuggestion,
  };
}

export type ShopDetails = {
  shop_id: string;
  shop_name: string;
  /** map/filter type derived from the activity categories (lib/data/shop-type-rules.ts) */
  shop_type: ShopType;
  address: string | null;
  lat: number;
  lon: number;
  mall: MallRef | null;
  open: { known: boolean; open: boolean | null; label: string };
  today_hours: string;
  hours_known: boolean;
  payment: Array<{ provider: string; channel_label: string }>;
  fast_delivery: boolean | null;
  categories: string[];
  website_url: string | null;
  instagram: string | null;
  other_offers: Array<{ offer_id: string; product_id: string; title: string; price: number | null; freshness: Freshness; price_age_days: number | null }>;
  /** the chosen product's (cheapest sane) offer in this shop, when it lists it */
  product_offer: {
    offer_id: string;
    product_id: string;
    title: string;
    price: number | null;
    price_flag: PriceFlag;
    freshness: Freshness;
    price_age_days: number | null;
    warranty_text: string | null;
  } | null;
  nav_links: { osm: string; google: string; neshan: string };
};


/** Spec §6.2 shop_details: location inside the mall, today's hours, conditions, ≤5 other offers of the category. */
export async function shopDetails(shopId: string, opts: { category?: string | null; excludeProductId?: string; now?: Date } = {}): Promise<ShopDetails | null> {
  const now = opts.now ?? new Date();
  const [s] = await q<{
    shop_id: string;
    name: string;
    address: string | null;
    lat: number;
    lon: number;
    mall_key: string | null;
    mall_name: string | null;
    floor_label: string | null;
    floor_num: number | null;
    unit_label: string | null;
    unit_kind: string | null;
    weekly_hours: WeeklyHours;
    payment_options: Array<{ provider_name?: string; channel?: string }> | null;
    supports_fast_delivery: boolean | null;
    category_names: string[];
    website_url: string | null;
    instagram: string | null;
  }>(`SELECT * FROM shops WHERE shop_id = $1`, [shopId]);
  if (!s) return null;
  const [productOffer] = opts.excludeProductId
    ? await q<NonNullable<ShopDetails['product_offer']>>(
        `SELECT o.offer_id, o.product_id, p.persian_title AS title, o.price_toman::float8 AS price, o.price_flag, o.freshness,
                o.price_age_days, o.warranty_text
           FROM offers o JOIN products p USING (product_id)
          WHERE o.shop_id = $1 AND o.product_id = $2
          ORDER BY (o.price_flag = 'ok') DESC, o.price_toman ASC NULLS LAST LIMIT 1`,
        [shopId, opts.excludeProductId],
      )
    : [];
  const others = await q<{ offer_id: string; product_id: string; persian_title: string; price: number | null; freshness: Freshness; price_age_days: number | null }>(
    `SELECT o.offer_id, o.product_id, p.persian_title, o.price_toman::float8 AS price, o.freshness, o.price_age_days
       FROM offers o JOIN products p USING (product_id)
      WHERE o.shop_id = $1 AND ($3::text IS NULL OR o.product_id <> $3)
      ORDER BY (p.category_name = $2) DESC NULLS LAST, p.seller_count DESC, o.price_toman NULLS LAST LIMIT 6`,
    [shopId, opts.category ?? null, opts.excludeProductId ?? null],
  );
  const os = openState(s.weekly_hours, now);
  return {
    shop_id: s.shop_id,
    shop_name: s.name,
    shop_type: await shopTypeOf(s.shop_id),
    address: s.address,
    lat: s.lat,
    lon: s.lon,
    mall: mallRef(s),
    open: { known: os.known, open: os.open, label: os.label },
    today_hours: todayHoursText(s.weekly_hours, now),
    hours_known: hoursKnown(s.weekly_hours),
    payment: (s.payment_options ?? [])
      .filter((p) => p.provider_name)
      .map((p) => ({
        provider: p.provider_name!.replace('دیجی پی', 'دیجی‌پی'),
        channel_label: p.channel === 'in_person' ? 'حضوری تأییدشده' : 'اعلام‌شده (کانال نامشخص)',
      })),
    fast_delivery: s.supports_fast_delivery,
    categories: (s.category_names ?? []).slice(0, 6),
    website_url: s.website_url,
    instagram: s.instagram,
    other_offers: others.map((o) => ({ offer_id: o.offer_id, product_id: o.product_id, title: o.persian_title, price: o.price, freshness: o.freshness, price_age_days: o.price_age_days })),
    product_offer: productOffer ?? null,
    nav_links: navLinks(s.lat, s.lon),
  };
}
