import { q } from '../db/client';
import type { WeeklyHours, DayKey } from '../data/hours';
import { WEEK, dayKeyOf, dayStats, type DayStats } from '../data/hours-stats';
import type { SessionState } from '../agent/state';
import { findSellers } from './sellers';

export type VisitScope = 'sellers' | 'mall' | 'shop';
export type VisitTimeOutput = {
  ui: 'visit_time';
  scope: VisitScope;
  title: string;
  noun: string;
  shops: number;
  today: DayKey;
  /** the day the user asked about (defaults to today) */
  day: DayKey;
  days: DayStats[];
};

/** «کی برم؟» — opening-hours statistics of the current sellers, a mall or one shop (no LLM). */
export async function visitTime(opts: {
  scope: VisitScope;
  mall_key?: string;
  shop_id?: string;
  shop_ids?: string[];
  title?: string;
  day?: DayKey;
  state: SessionState;
  now: Date;
}): Promise<VisitTimeOutput> {
  let rows: Array<{ shop_id: string; weekly_hours: WeeklyHours; name: string; mall_name: string | null }> = [];
  let title = opts.title ?? '';
  let noun = 'فروشنده‌ها';
  if (opts.shop_ids?.length) {
    rows = await q('SELECT shop_id, weekly_hours, name, mall_name FROM shops WHERE shop_id = ANY($1::text[])', [opts.shop_ids]);
  } else if (opts.scope === 'mall') {
    if (!opts.mall_key) throw new Error('کدام پاساژ؟ نام پاساژ را بگویید.');
    rows = await q('SELECT shop_id, weekly_hours, name, mall_name FROM shops WHERE mall_key = $1', [opts.mall_key]);
    title ||= rows.find((r) => r.mall_name)?.mall_name ?? 'این پاساژ';
    noun = 'مغازه‌های پاساژ';
  } else if (opts.scope === 'shop') {
    if (!opts.shop_id) throw new Error('کدام فروشگاه؟');
    rows = await q('SELECT shop_id, weekly_hours, name, mall_name FROM shops WHERE shop_id = $1', [opts.shop_id]);
    title ||= rows[0]?.name ?? 'این فروشگاه';
    noun = 'فروشگاه';
  } else {
    const st = opts.state;
    const productId = st.chosenProduct ?? st.candidates[0];
    if (!productId) throw new Error('اول کالا و فروشنده‌ها را پیدا کنیم.');
    const res = await findSellers({ product_ids: [productId], lat: st.location.lat, lon: st.location.lon, radius_m: st.radius_m, filters: st.filters, intent: st.intent, now: opts.now });
    const ids = res.rows.map((r) => r.shop_id);
    rows = ids.length ? await q('SELECT shop_id, weekly_hours, name, mall_name FROM shops WHERE shop_id = ANY($1::text[])', [ids]) : [];
    title ||= `فروشنده‌های «${(res.product?.title ?? '').split('|')[0].trim()}»`;
  }
  const today = dayKeyOf(opts.now);
  return { ui: 'visit_time', scope: opts.scope, title, noun, shops: rows.length, today, day: opts.day ?? today, days: WEEK.map((d) => dayStats(rows, d)) };
}
