import { q } from '../db/client';
import { shopTypeFromCategories } from '../data/shop-type-rules';
import type { ShopType } from '../data/shop-types';

const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; types: Promise<Map<string, ShopType>> } | null = null;

/**
 * Type of every shop (~6.5k, computed once and cached for an hour): from its activity categories, or —
 * when they give no vote — from the categories of the products it lists, weighted by offer count.
 * A shop with neither is `unknown` (shop names in the dataset are synthetic, so they are not used).
 */
export function loadShopTypes(): Promise<Map<string, ShopType>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.types;
  const types = computeShopTypes().catch((err) => {
    cache = null;
    throw err;
  });
  cache = { at: Date.now(), types };
  return types;
}

async function computeShopTypes(): Promise<Map<string, ShopType>> {
  const [shops, offerCats] = await Promise.all([
    q<{ shop_id: string; category_names: string[] }>('SELECT shop_id, category_names FROM shops'),
    q<{ shop_id: string; category_name: string; n: number }>(
      `SELECT o.shop_id, p.category_name, count(*)::int AS n
         FROM offers o JOIN products p ON p.product_id = o.product_id
        WHERE p.category_name IS NOT NULL
        GROUP BY 1, 2`,
    ),
  ]);
  const listed = new Map<string, [string, number][]>();
  for (const r of offerCats) {
    const list = listed.get(r.shop_id) ?? [];
    list.push([r.category_name, r.n]);
    listed.set(r.shop_id, list);
  }
  const types = new Map<string, ShopType>();
  for (const s of shops) {
    const cats = s.category_names ?? [];
    const products = listed.get(s.shop_id);
    let type: ShopType = cats.length || products ? shopTypeFromCategories(cats) : 'unknown';
    if (type === 'other' && products) type = shopTypeFromCategories(products);
    types.set(s.shop_id, type);
  }
  return types;
}

export async function shopTypeOf(shopId: string): Promise<ShopType> {
  return (await loadShopTypes()).get(shopId) ?? 'other';
}
