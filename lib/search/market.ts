import { q } from '../db/client';
import type { Freshness } from '../data/quality';
import { toFaDigits } from '../fa/digits';
import type { SessionState } from '../agent/state';
import { findSellers } from './sellers';
import { positionOf, priceStats, talkingPoints, targetPrice, type CheaperNearby, type Position, type PriceStats } from './market-stats';

export type BargainOutput = {
  ui: 'bargain';
  offer_id: string;
  shop_name: string;
  product_title: string;
  price: number;
  stats: PriceStats;
  position: Position;
  delta_pct: number;
  cheaper_nearby: CheaperNearby | null;
  warranty_gap: string | null;
  freshness_note: string;
  talking_points: string[];
  target_price: number | null;
  fair: boolean;
};

/** F5: data-backed talking points for one offer (market stats over sane prices, nearby cheaper seller). */
export async function bargainingCard(opts: { offer_id: string; state: SessionState; now: Date }): Promise<BargainOutput> {
  const [o] = await q<{ offer_id: string; product_id: string; price: number | null; price_flag: string; freshness: Freshness; price_age_days: number | null; has_warranty: boolean; warranty_text: string | null; shop_name: string; title: string }>(
    `SELECT o.offer_id, o.product_id, o.price_toman::float8 AS price, o.price_flag, o.freshness, o.price_age_days, o.has_warranty, o.warranty_text,
            s.name AS shop_name, p.persian_title AS title
       FROM offers o JOIN shops s USING (shop_id) JOIN products p USING (product_id) WHERE o.offer_id = $1`,
    [opts.offer_id],
  );
  if (!o) throw new Error('این پیشنهاد پیدا نشد.');
  if (!o.price) throw new Error('این فروشنده قیمت ثبت نکرده؛ اول قیمت امروز را بپرسید.');
  const market = await q<{ price: number; has_warranty: boolean }>(`SELECT price_toman::float8 AS price, has_warranty FROM offers WHERE product_id = $1 AND price_flag = 'ok' AND price_toman > 0`, [o.product_id]);
  const stats = priceStats(market.map((m) => m.price))!;
  const { position, delta_pct } = positionOf(o.price, stats.median);
  const st = opts.state;
  const nearby = await findSellers({ product_ids: [o.product_id], lat: st.location.lat, lon: st.location.lon, radius_m: st.radius_m, now: opts.now });
  const sane = nearby.rows.filter((r) => r.price !== null && r.price_flag === 'ok' && r.offer_id !== o.offer_id);
  const cheaperRow = sane.filter((r) => r.price! < o.price!).sort((a, b) => a.distance_m - b.distance_m)[0];
  const cheaper: CheaperNearby | null = cheaperRow
    ? { shop_name: cheaperRow.shop_name, price: cheaperRow.price!, distance_m: cheaperRow.distance_m, mall: [cheaperRow.mall?.name, cheaperRow.mall?.floor_label].filter(Boolean).join('، ') || null }
    : null;
  const minNearby = sane.length ? Math.min(...sane.map((r) => r.price!)) : null;
  const withWarranty = market.filter((m) => m.has_warranty).length / market.length;
  const warrantyGap = !o.has_warranty && withWarranty >= 0.5
    ? `این فروشنده گارانتی اعلام نکرده؛ ${toFaDigits(Math.round(withWarranty * 100))}٪ فروشنده‌های این کالا گارانتی دارند — یا گارانتی بخواهید یا تخفیف.`
    : o.has_warranty && cheaperRow && !cheaperRow.conditions.has_warranty
      ? `گزینه ارزان‌تر نزدیک گارانتی اعلام نکرده؛ گارانتی شما (${o.warranty_text ?? 'اعلام‌شده'}) امتیاز است.`
      : null;
  const target = targetPrice(o.price, stats.median, minNearby);
  const freshness_note = o.freshness === 'fresh' || o.freshness === 'recent' ? 'قیمت این فروشنده تازه است.' : 'قیمت این فروشنده قدیمی یا بی‌تاریخ است؛ قیمت امروز ممکن است فرق کند.';
  return {
    ui: 'bargain',
    offer_id: o.offer_id,
    shop_name: o.shop_name,
    product_title: o.title.split('|')[0].trim(),
    price: o.price,
    stats,
    position,
    delta_pct,
    cheaper_nearby: cheaper,
    warranty_gap: warrantyGap,
    freshness_note,
    talking_points: talkingPoints({ price: o.price, stats, position, delta_pct, cheaper, freshness: o.freshness, price_age_days: o.price_age_days, warranty_gap: warrantyGap }),
    target_price: target,
    fair: target === null,
  };
}
