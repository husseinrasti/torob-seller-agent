import { pool, q } from '../db/client';
import { deriveHubs, distanceM, mergeCurated, type CuratedHub, type Hub, type HubShop } from '../data/hubs';
import type { ShopType } from '../data/shop-types';
import { openState, type WeeklyHours } from '../data/hours';
import curated from '../../data/hubs.curated.json';
import { loadShopTypes } from './shop-types';

const TTL_MS = 10 * 60_000;
let cache: { at: number; hubs: Promise<Hub[]> } | null = null;

/** Derive the hubs from the shops, merge the curated bazaars and replace the `hubs` table. */
export async function rebuildHubs(): Promise<Hub[]> {
  const rows = await q<{ shop_id: string; lat: number; lon: number; has_offers: boolean; category_names: string[] | null; weekly_hours: HubShop['weekly_hours']; mall_name: string | null; address: string | null }>(
    'SELECT shop_id, lat, lon, has_offers, category_names, weekly_hours, mall_name, address FROM shops',
  );
  const types = await loadShopTypes();
  const shops: HubShop[] = rows.map((r) => ({
    shop_id: r.shop_id,
    lat: r.lat,
    lon: r.lon,
    family: types.get(r.shop_id) ?? 'unknown',
    has_offers: r.has_offers,
    category_only: !r.has_offers && (r.category_names?.length ?? 0) > 0,
    weekly_hours: r.weekly_hours,
    mall_name: r.mall_name,
    address: r.address,
  }));
  const hubs = mergeCurated(deriveHubs(shops), curated as CuratedHub[]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM hubs');
    for (const h of hubs) {
      await client.query(
        `INSERT INTO hubs (hub_id, name, source, lat, lon, radius_m, families, family_counts, shop_count, listed_count, category_only_count, hours_profile, typical_hours, note, malls, street)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [h.hub_id, h.name, h.source, h.lat, h.lon, h.radius_m, JSON.stringify(h.families), JSON.stringify(h.family_counts), h.shop_count, h.listed_count, h.category_only_count, h.hours_profile ? JSON.stringify(h.hours_profile) : null, h.typical_hours ? JSON.stringify(h.typical_hours) : null, h.note, JSON.stringify(h.malls), h.street],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  cache = { at: Date.now(), hubs: Promise.resolve(hubs) };
  return hubs;
}

/** All hubs (cached); an empty table — a database seeded before hubs existed — is filled on first use. */
export function loadHubs(): Promise<Hub[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.hubs;
  const hubs = q<Hub>('SELECT * FROM hubs')
    .then((rows) => (rows.length ? rows : rebuildHubs()))
    .catch((err) => {
      cache = null;
      throw err;
    });
  cache = { at: Date.now(), hubs };
  return hubs;
}

export type HubHit = Hub & { distance_m: number };

/** Hubs within `radius_m` of a point, nearest first; `families` keeps those selling the need. */
export async function findHubs(opts: { lat: number; lon: number; families?: ShopType[]; radius_m: number }): Promise<HubHit[]> {
  return (await loadHubs())
    .filter((h) => !opts.families?.length || h.families.some((f) => opts.families!.includes(f)))
    .map((h) => ({ ...h, distance_m: Math.round(Math.max(0, distanceM(opts.lat, opts.lon, h.lat, h.lon) - 0)) }))
    .filter((h) => h.distance_m <= opts.radius_m)
    .sort((a, b) => a.distance_m - b.distance_m);
}

export type HubShopRow = { shop_id: string; name: string; lists: boolean; mall: string | null; open: { known: boolean; open: boolean | null; label: string } };

/** Shops of a hub (its radius around the centre), of the need's families: open first, listed first. */
export async function hubShops(opts: { hub_id: string; families: ShopType[]; at: Date }): Promise<{ hub: Hub; shops: HubShopRow[] } | null> {
  const hub = (await loadHubs()).find((h) => h.hub_id === opts.hub_id);
  if (!hub) return null;
  const types = await loadShopTypes();
  const dLat = hub.radius_m / 111_320;
  const dLon = hub.radius_m / (111_320 * Math.cos((hub.lat * Math.PI) / 180));
  const rows = await q<{ shop_id: string; name: string; lat: number; lon: number; has_offers: boolean; mall_name: string | null; floor_label: string | null; weekly_hours: WeeklyHours }>(
    'SELECT shop_id, name, lat, lon, has_offers, mall_name, floor_label, weekly_hours FROM shops WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4',
    [hub.lat - dLat, hub.lat + dLat, hub.lon - dLon, hub.lon + dLon],
  );
  const fams = opts.families.length ? opts.families : hub.families;
  const shops = rows
    .filter((r) => distanceM(hub.lat, hub.lon, r.lat, r.lon) <= hub.radius_m && fams.includes(types.get(r.shop_id) ?? 'unknown'))
    .map((r) => ({ shop_id: r.shop_id, name: r.name, lists: r.has_offers, mall: [r.mall_name, r.floor_label].filter(Boolean).join('، ') || null, open: openState(r.weekly_hours, opts.at) }))
    .map((r) => ({ ...r, open: { known: r.open.known, open: r.open.open, label: r.open.label } }))
    .sort((a, b) => Number(b.open.open === true) - Number(a.open.open === true) || Number(!a.open.known) - Number(!b.open.known) || Number(b.lists) - Number(a.lists) || (a.mall ?? '').localeCompare(b.mall ?? '', 'fa'))
    .slice(0, 40);
  return { hub, shops };
}
