import { q } from '../db/client';
import { bbox, SQL_DISTANCE } from '../geo';

/** Compact shop row for the map layer: [id, lat, lon, name, has_offers, category-only for product]. */
export type NearShop = [string, number, number, string, 0 | 1, 0 | 1];

/**
 * Every shop within the radius (the map's "all shops" layer). `productId` marks shops whose activity
 * category matches the product but that do not list it (category-only), so the map can colour them.
 */
export async function shopsNear(lat: number, lon: number, radiusM: number, productId?: string | null): Promise<NearShop[]> {
  const b = bbox(lat, lon, radiusM);
  const rows = await q<{ shop_id: string; lat: number; lon: number; name: string; has_offers: boolean; maybe: boolean }>(
    `WITH cat AS (SELECT category_name FROM products WHERE product_id = $8)
     SELECT s.shop_id, s.lat, s.lon, s.name, s.has_offers,
            (s.category_names ? (SELECT category_name FROM cat)
             AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.shop_id = s.shop_id AND o.product_id = $8)) AS maybe
       FROM shops s
      WHERE s.lat BETWEEN $3 AND $4 AND s.lon BETWEEN $5 AND $6 AND ${SQL_DISTANCE('$1', '$2')} <= $7
      LIMIT 8000`,
    [lat, lon, b.minLat, b.maxLat, b.minLon, b.maxLon, radiusM, productId ?? null],
  );
  return rows.map((r) => [r.shop_id, Math.round(r.lat * 1e6) / 1e6, Math.round(r.lon * 1e6) / 1e6, r.name, r.has_offers ? 1 : 0, r.maybe ? 1 : 0]);
}
