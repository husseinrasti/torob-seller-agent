import { q } from '../db/client';
import { normalizeForSearch } from '../fa/normalize';

export type Place = { name: string; kind: 'area' | 'mall'; lat: number; lon: number; shops: number; norm: string };

let cache: { at: number; places: Place[] } | null = null;

/** Neighbourhood labels and malls from the dataset with their shop centroids (no external geocoder). */
export async function loadPlaces(): Promise<Place[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.places;
  const rows = await q<{ name: string; kind: 'area' | 'mall'; lat: number; lon: number; shops: string }>(
    `SELECT location_label AS name, 'area' AS kind, avg(lat) AS lat, avg(lon) AS lon, count(*) AS shops
       FROM shops WHERE location_label IS NOT NULL GROUP BY location_label
     UNION ALL
     SELECT max(mall_name) AS name, 'mall' AS kind, avg(lat) AS lat, avg(lon) AS lon, count(*) AS shops
       FROM shops WHERE mall_key IS NOT NULL GROUP BY mall_key HAVING count(*) >= 3`,
  );
  const places = rows.map((r) => ({ ...r, shops: Number(r.shops), norm: normalizeForSearch(r.name.replace(/^(پاساژ|مجتمع تجاری|مجتمع|بازار|ساختمان|برج|مرکز خرید)\s+/u, '')) }));
  cache = { at: Date.now(), places };
  return places;
}

/** Best place for free text («نزدیک تجریش», «پاساژ علاءالدین»), or null. */
export async function matchPlace(text: string): Promise<Place | null> {
  const t = normalizeForSearch(text).replace(/علاالدین|علائدین|علالدین/gu, 'علاءالدین').replace(/چهارسو/gu, 'چارسو');
  if (!t) return null;
  const places = await loadPlaces();
  let best: { p: Place; s: number } | null = null;
  for (const p of places) {
    if (!p.norm) continue;
    let s = 0;
    if (t === p.norm) s = 3;
    else if (` ${t} `.includes(` ${p.norm} `)) s = 2 + p.norm.length / 100;
    else if (p.norm.startsWith(t) && t.length >= 3) s = 1;
    if (s > 0) s += Math.min(p.shops, 500) / 5000 + (p.kind === 'mall' ? 0.05 : 0);
    if (s > 0 && (!best || s > best.s)) best = { p, s };
  }
  return best?.p ?? null;
}

/** Places whose name starts with / contains the query, for the location sheet search box. */
export async function searchPlaces(text: string, limit = 8): Promise<Place[]> {
  const t = normalizeForSearch(text);
  const places = await loadPlaces();
  if (!t) return places.filter((p) => p.kind === 'area').sort((a, b) => b.shops - a.shops).slice(0, limit);
  return places
    .filter((p) => p.norm.includes(t) || t.includes(p.norm))
    .sort((a, b) => Number(b.norm.startsWith(t)) - Number(a.norm.startsWith(t)) || b.shops - a.shops)
    .slice(0, limit);
}
