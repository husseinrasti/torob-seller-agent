import { q } from '../db/client';
import { normalizeForSearch } from '../fa/normalize';
import { SQL_DISTANCE } from '../geo';
import { GAZETTEER, placeKey, trigramSimilarity } from '../agent/mission/gazetteer';

export type Place = { name: string; kind: 'area' | 'mall'; lat: number; lon: number; shops: number; norm: string };
/** A search hit for the location sheet; gazetteer places report shops within 1 km instead of labelled shops. */
export type PlaceHit = { name: string; kind: 'area' | 'mall' | 'gazetteer'; lat: number; lon: number; shops: number };

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

let gazCounts: Promise<Map<string, number>> | null = null;

/** Shops within 1 km of every gazetteer place (one query, cached for the process). */
function gazetteerShopCounts(): Promise<Map<string, number>> {
  gazCounts ??= q<{ name: string; n: number }>(
    `SELECT g.name, count(s.shop_id)::int AS n
       FROM unnest($1::text[], $2::float8[], $3::float8[]) AS g(name, lat, lon)
       LEFT JOIN shops s ON s.lat BETWEEN g.lat - 0.0095 AND g.lat + 0.0095 AND s.lon BETWEEN g.lon - 0.0115 AND g.lon + 0.0115
                        AND ${SQL_DISTANCE('g.lat', 'g.lon')} <= 1000
      GROUP BY g.name`,
    [GAZETTEER.map((g) => g.name), GAZETTEER.map((g) => g.lat), GAZETTEER.map((g) => g.lon)],
  )
    .then((rows) => new Map(rows.map((r) => [r.name, r.n])))
    .catch((err) => {
      gazCounts = null;
      throw err;
    });
  return gazCounts;
}

/** Dataset areas and malls, then gazetteer neighbourhoods, matching the query (location sheet search box). */
export async function searchPlaces(text: string, limit = 8): Promise<PlaceHit[]> {
  const t = normalizeForSearch(text);
  const places = await loadPlaces();
  const strip = ({ norm: _n, ...p }: Place): PlaceHit => (void _n, p);
  if (!t) return places.filter((p) => p.kind === 'area').sort((a, b) => b.shops - a.shops).slice(0, limit).map(strip);
  const dataset = places
    .filter((p) => p.norm.includes(t) || t.includes(p.norm))
    .sort((a, b) => Number(b.norm.startsWith(t)) - Number(a.norm.startsWith(t)) || b.shops - a.shops)
    .slice(0, limit)
    .map(strip);
  const key = placeKey(t);
  const seen = new Set(dataset.map((p) => placeKey(p.name)));
  const gaz = GAZETTEER.map((g) => ({
    g,
    s: Math.max(...[g.name, ...(g.aliases ?? [])].map((n) => (placeKey(n).includes(key) ? 1 : trigramSimilarity(key, placeKey(n))))),
  }))
    .filter((x) => x.s >= 0.45 && !seen.has(placeKey(x.g.name)))
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.max(0, limit - dataset.length));
  if (!gaz.length) return dataset;
  const counts = await gazetteerShopCounts().catch(() => new Map<string, number>());
  return [...dataset, ...gaz.map(({ g }) => ({ name: g.name, kind: 'gazetteer' as const, lat: g.lat, lon: g.lon, shops: counts.get(g.name) ?? 0 }))];
}
