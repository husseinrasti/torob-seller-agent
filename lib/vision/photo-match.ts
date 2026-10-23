import { z } from 'zod';
import { q } from '../db/client';
import type { SessionState } from '../agent/state';
import type { Suggestion } from '../agent/suggest';
import type { MissionResult } from '../agent/mission/types';
import { productDetails } from '../search/products';
import { findSellers } from '../search/sellers';
import { positionOf, priceStats, type Position, type PriceStats } from '../search/market-stats';
import { resolveBasketItem } from '../plan/basket-service';
import { NOT_RECOGNIZED, recognized, shelfPrice, visionLabel, visionQuery, type Vision } from './parse';

export const PHOTO_PRIVACY = 'عکس فقط برای تشخیص به مدل فرستاده شد و ذخیره نمی‌شود.';

/** What the client sends back after /api/vision/identify (bounded; never the image itself). */
export const VisionInput = z.object({
  brand: z.string().max(60).nullable(),
  model: z.string().max(80).nullable(),
  product_type: z.string().max(60).nullable(),
  visible_price_toman: z.number().nullable(),
  text_lines: z.array(z.string().max(120)).max(12),
  confidence: z.number().min(0).max(1),
});

export type PhotoCandidate = { product_id: string; title: string; image: string | null; seller_count: number; min_price: number | null; median_price: number | null };
export type PhotoMatchOutput = {
  ui: 'photo_match';
  recognized: boolean;
  label: string | null;
  query: string | null;
  message: string | null;
  candidates: PhotoCandidate[];
  /** a price read from a shelf tag, against the market (F5 stats) and the cheapest sellers nearby */
  shelf: {
    price: number;
    product_title: string;
    stats: PriceStats | null;
    position: Position | null;
    delta_pct: number | null;
    nearby: Array<{ offer_id: string; shop_name: string; price: number; distance_m: number; mall: string | null }>;
    cheaper_nearby: number;
    /** the number read is far from every market price (a dropped zero?) — shown, not judged */
    implausible: boolean;
  } | null;
  privacy: string;
  /** photo + a request («همینو نزدیک من زیر ۶۰ میلیون، موجودیشو بپرس») → the mission on the matched product */
  mission?: MissionResult;
  suggested_actions: Suggestion[];
};

/**
 * F1: the vision result → the top 3 products (model code exact, like basket lines) → the session's
 * candidates; a shelf price is compared with the market and the nearby sellers. No image here.
 */
export async function photoMatch(opts: { vision: Vision; state: SessionState; now: Date }): Promise<PhotoMatchOutput> {
  const v = opts.vision;
  const st = opts.state;
  const base = { ui: 'photo_match' as const, privacy: PHOTO_PRIVACY, shelf: null, suggested_actions: [] as Suggestion[] };
  if (!recognized(v)) return { ...base, recognized: false, label: null, query: null, message: NOT_RECOGNIZED, candidates: [] };
  const query = visionQuery(v);
  const item = await resolveBasketItem(query, st);
  const details = await productDetails(item.product_ids.slice(0, 3));
  const candidates: PhotoCandidate[] = details.map((d) => ({
    product_id: d.product_id,
    title: d.persian_title,
    image: d.primary_image,
    seller_count: d.seller_count,
    min_price: d.min_price,
    median_price: d.median_price,
  }));
  const label = visionLabel(v);
  if (!candidates.length) return { ...base, recognized: true, label, query, message: `«${label}» را در کالاهای ترب پیدا نکردم؛ اسمش را بنویسید.`, candidates };
  st.need = query;
  st.candidates = candidates.map((c) => c.product_id);
  st.chosenProduct = undefined;

  let shelf: PhotoMatchOutput['shelf'] = null;
  const price = shelfPrice(v);
  if (price) {
    const top = candidates[0];
    const market = await q<{ price: number }>(`SELECT price_toman::float8 AS price FROM offers WHERE product_id = $1 AND price_flag = 'ok' AND price_toman > 0`, [top.product_id]);
    const stats = priceStats(market.map((m) => m.price));
    const implausible = Boolean(stats && (price < stats.median * 0.3 || price > stats.median * 3));
    const pos = stats && !implausible ? positionOf(price, stats.median) : null;
    const sellers = await findSellers({ product_ids: [top.product_id], lat: st.location.lat, lon: st.location.lon, radius_m: st.radius_m, now: opts.now });
    const sane = sellers.rows.filter((r) => r.price !== null && r.price_flag === 'ok');
    shelf = {
      price,
      product_title: top.title.split('|')[0].trim(),
      stats,
      position: pos?.position ?? null,
      delta_pct: pos?.delta_pct ?? null,
      nearby: [...sane]
        .sort((a, b) => a.price! - b.price!)
        .slice(0, 3)
        .map((r) => ({ offer_id: r.offer_id, shop_name: r.shop_name, price: r.price!, distance_m: r.distance_m, mall: [r.mall?.name, r.mall?.floor_label].filter(Boolean).join('، ') || null })),
      cheaper_nearby: implausible ? 0 : sane.filter((r) => r.price! < price).length,
      implausible,
    };
  }
  const suggested: Suggestion[] = [
    { kind: 'action', label: 'همین است؛ فروشنده‌ها', text: `فروشنده‌های نزدیکِ «${candidates[0].title.split('|')[0].trim()}» را نشان بده`, tool: 'find_sellers', input: { product_id: candidates[0].product_id } },
  ];
  return { ...base, recognized: true, label, query, message: null, candidates, shelf, suggested_actions: suggested };
}
