import { q } from '../db/client';
import { bbox, haversine } from '../geo';
import type { WeeklyHours } from '../data/hours';
import type { ShopType } from '../data/shop-types';
import { categoryShopType } from '../data/shop-type-rules';
import { decide, FAR_MAX_M, HUB_MAX_M, type DecideHub, type DecideShop, type Decision, type Transport, type Urgency } from '../agent/decide';
import { routeCategories } from './categories';
import { findHubs } from './hubs';
import { loadShopTypes } from './shop-types';
import { shortAddress } from './sellers';

/** What the user needs, resolved once and sent back by the map controls (no LLM on re-runs). */
export type Need = { label: string; categories: string[]; product_id?: string | null; families: ShopType[] };

export type DecisionOutput = Decision & {
  ui: 'decision';
  need_spec: Need;
  location: { lat: number; lon: number; label: string };
  /** the app clock when decided; the time scrubber moves `at` relative to it */
  now: string;
};

const CACHE_MS = 2 * 60_000;
const cache = new Map<string, { at: number; data: Promise<{ shops: DecideShop[]; hubs: Array<DecideHub> }> }>();

/** «ساعت ۱۱:۳۰ شب، شارژر گوشی می‌خوام» → categories (routing) and the shop families that sell them. */
export async function resolveNeed(opts: { text?: string | null; product_id?: string | null }): Promise<Need> {
  if (opts.product_id) {
    const [p] = await q<{ persian_title: string; category_name: string | null }>('SELECT persian_title, category_name FROM products WHERE product_id = $1', [opts.product_id]);
    if (!p) throw new Error('این کالا پیدا نشد.');
    const cats = p.category_name ? [p.category_name] : [];
    return { label: p.persian_title.split('|')[0].trim(), categories: cats, product_id: opts.product_id, families: familiesOf(cats) };
  }
  const text = (opts.text ?? '').trim();
  if (!text) throw new Error('چه چیزی لازم دارید؟');
  const route = await routeCategories(text, {});
  const cats = route.categories.slice(0, 2);
  if (!cats.length) throw new Error(`برای «${text}» دسته‌ای در ترب پیدا نکردم؛ اسم کالا را دقیق‌تر بگویید.`);
  return { label: needLabel(text, cats[0]), categories: cats, families: familiesOf(cats) };
}

function familiesOf(categories: string[]): ShopType[] {
  return [...new Set(categories.map((c) => categoryShopType(c)?.[0]).filter((t): t is ShopType => Boolean(t)))];
}

/** A short need for sentences: the user's product words when short, else the category («هدفون»). */
function needLabel(text: string, category: string): string {
  const words = text.replace(/[؟?!.،,]/g, ' ').split(/\s+/).filter(Boolean);
  return words.length <= 3 ? words.join(' ') : category.split('،')[0].trim();
}

async function loadData(need: Need, lat: number, lon: number, radius_m: number) {
  const key = `${need.product_id ?? need.categories.join('|')}:${lat.toFixed(4)}:${lon.toFixed(4)}:${radius_m}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = (async () => {
    const b = bbox(lat, lon, FAR_MAX_M);
    const types = await loadShopTypes();
    const listing = await q<{ shop_id: string; offer_id: string; price: number | null; name: string; lat: number; lon: number; weekly_hours: WeeklyHours; mall_name: string | null; floor_label: string | null; address: string | null }>(
      `SELECT DISTINCT ON (o.shop_id) o.shop_id, o.offer_id, o.price_toman::float8 AS price, s.name, s.lat, s.lon, s.weekly_hours, s.mall_name, s.floor_label, s.address
         FROM offers o JOIN products p ON p.product_id = o.product_id JOIN shops s ON s.shop_id = o.shop_id
        WHERE ${need.product_id ? 'o.product_id = $1' : 'p.category_name = ANY($1::text[])'}
          AND s.lat BETWEEN $2 AND $3 AND s.lon BETWEEN $4 AND $5
        ORDER BY o.shop_id, (o.price_flag = 'ok') DESC, o.price_toman ASC NULLS LAST`,
      [need.product_id ?? need.categories, b.minLat, b.maxLat, b.minLon, b.maxLon],
    );
    // the families that actually sell it here (data-driven), else the category rule
    if (!need.families.length) {
      const votes = new Map<ShopType, number>();
      for (const r of listing) {
        const t = types.get(r.shop_id);
        if (t && t !== 'unknown' && t !== 'other') votes.set(t, (votes.get(t) ?? 0) + 1);
      }
      need.families = [...votes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1).map(([t]) => t);
    }
    const nb = bbox(lat, lon, Math.max(radius_m, 2000));
    const catOnly = await q<{ shop_id: string; name: string; lat: number; lon: number; weekly_hours: WeeklyHours; mall_name: string | null; floor_label: string | null; address: string | null; category_names: string[] }>(
      `SELECT shop_id, name, lat, lon, weekly_hours, mall_name, floor_label, address, category_names FROM shops
        WHERE NOT has_offers AND jsonb_array_length(category_names) > 0 AND lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4`,
      [nb.minLat, nb.maxLat, nb.minLon, nb.maxLon],
    );
    const mall = (r: { mall_name: string | null; floor_label: string | null }) => [r.mall_name, r.floor_label].filter(Boolean).join('، ') || null;
    const shops: DecideShop[] = [
      ...listing.map((r) => ({ shop_id: r.shop_id, offer_id: r.offer_id, name: r.name, lat: r.lat, lon: r.lon, distance_m: Math.round(haversine(lat, lon, r.lat, r.lon)), lists: true, price: r.price, weekly_hours: r.weekly_hours, mall: mall(r), address_short: shortAddress(r.address) })),
      ...catOnly
        .filter((r) => r.category_names.some((c) => need.categories.includes(c)) || need.families.includes(types.get(r.shop_id) ?? 'unknown'))
        .map((r) => ({ shop_id: r.shop_id, offer_id: null, name: r.name, lat: r.lat, lon: r.lon, distance_m: Math.round(haversine(lat, lon, r.lat, r.lon)), lists: false, price: null, weekly_hours: r.weekly_hours, mall: mall(r), address_short: shortAddress(r.address) })),
    ];
    // hubs of the need's family within 3 km, with the hours of their shops of that family
    const hits = await findHubs({ lat, lon, families: need.families, radius_m: HUB_MAX_M });
    const hubs: DecideHub[] = [];
    for (const h of hits.slice(0, 4)) {
      const hb = bbox(h.lat, h.lon, h.radius_m);
      const inHub = h.source === 'curated' ? [] : await q<{ shop_id: string; lat: number; lon: number; weekly_hours: WeeklyHours }>(`SELECT shop_id, lat, lon, weekly_hours FROM shops WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4`, [hb.minLat, hb.maxLat, hb.minLon, hb.maxLon]);
      hubs.push({
        hub_id: h.hub_id,
        name: h.name,
        lat: h.lat,
        lon: h.lon,
        radius_m: h.radius_m,
        distance_m: h.distance_m,
        source: h.source,
        note: h.note,
        typical_hours: h.typical_hours,
        shop_count: h.shop_count,
        listed_count: h.listed_count,
        category_only_count: h.category_only_count,
        family_hours: inHub.filter((s) => need.families.includes(types.get(s.shop_id) ?? 'unknown') && haversine(h.lat, h.lon, s.lat, s.lon) <= h.radius_m).map((s) => s.weekly_hours),
      });
    }
    return { shops, hubs };
  })().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { at: Date.now(), data });
  return data;
}

/**
 * Decision for a need at a moment and place: loads the shops that list it (8 km), category-only shops
 * nearby and the matching hubs, then runs the pure engine (`lib/agent/decide.ts`).
 */
export async function decideWhereToBuy(opts: {
  need: Need;
  location: { lat: number; lon: number; label: string };
  at: Date;
  urgency: Urgency;
  radius_m: number;
  transport?: Transport;
  now?: Date;
}): Promise<DecisionOutput> {
  const { shops, hubs } = await loadData(opts.need, opts.location.lat, opts.location.lon, opts.radius_m);
  const d = decide({ shops, hubs, at: opts.at, need: opts.need.label, radius_m: opts.radius_m, urgency: opts.urgency, transport: opts.transport, now: opts.now });
  return { ui: 'decision', ...d, need_spec: opts.need, location: opts.location, now: (opts.now ?? opts.at).toISOString() };
}
