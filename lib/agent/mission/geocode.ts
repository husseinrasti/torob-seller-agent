import { normalizeForSearch } from '../../fa/normalize';
import { loadPlaces, type Place } from '../../search/places';
import { GAZETTEER, PLACE_MARKERS, PLACE_PREFIXES, gazetteerSuggest, placeKey, trigramSimilarity } from './gazetteer';

export type GeoKind = 'mall' | 'area' | 'gazetteer';
/** A resolved place: dataset mall / dataset neighbourhood label (shop centroid) / gazetteer point. */
export type GeoPlace = { name: string; kind: GeoKind; lat: number; lon: number; radius_m: number };

type Indexed = GeoPlace & { marker: boolean };
/** key → candidates (a mall and a neighbourhood may share a name: «بازار تجریش» / «تجریش») */
export type PlaceIndex = Map<string, Indexed[]>;

const MALL_PREFIXES = new Set(['پاساژ', 'مجتمع', 'بازار', 'مرکز', 'تیمچه', 'سرای', 'سرا']);
// dataset labels that are also everyday words: need a marker before them in a sentence
const COMMON_LABELS = new Set(['آسمان', 'بهار', 'مهران', 'درختی', 'فلسطین', 'ولیعصر', 'مطهری', 'آذربایجان', 'امجدیه', 'سنائی', 'سهروردی'].map(placeKey));
const RADIUS: Record<GeoKind, number> = { mall: 300, area: 1000, gazetteer: 1000 };

const spelling = (t: string) => t.replace(/علاالدین|علائدین|علالدین/gu, 'علاءالدین').replace(/چهارسو/gu, 'چارسو');

/** Index of malls, dataset labels and gazetteer names by spelling-insensitive key (dataset first). */
export function buildPlaceIndex(places: Array<Pick<Place, 'name' | 'kind' | 'lat' | 'lon' | 'norm'>>): PlaceIndex {
  const index: PlaceIndex = new Map();
  const add = (key: string, p: Indexed) => {
    if (!key) return;
    const list = index.get(key) ?? [];
    if (!list.some((x) => x.kind === p.kind)) list.push(p);
    index.set(key, list);
  };
  for (const p of places.filter((x) => x.kind === 'mall')) add(placeKey(spelling(p.norm)), { name: p.name, kind: 'mall', lat: p.lat, lon: p.lon, radius_m: RADIUS.mall, marker: true });
  for (const p of places.filter((x) => x.kind === 'area')) {
    const key = placeKey(p.norm);
    add(key, { name: p.name, kind: 'area', lat: p.lat, lon: p.lon, radius_m: RADIUS.area, marker: COMMON_LABELS.has(key) });
  }
  for (const e of GAZETTEER) {
    for (const n of [e.name, ...(e.aliases ?? [])]) add(placeKey(n), { name: e.name, kind: 'gazetteer', lat: e.lat, lon: e.lon, radius_m: RADIUS.gazetteer, marker: Boolean(e.marker) });
  }
  return index;
}

let cached: { at: number; index: PlaceIndex } | null = null;

export async function placeIndex(): Promise<PlaceIndex> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.index;
  const index = buildPlaceIndex(await loadPlaces());
  cached = { at: Date.now(), index };
  return index;
}

export type LocationMatch = {
  place: GeoPlace;
  /** the place words as written (without the marker) */
  phrase: string;
  /** token span [start, end) in `normalizeForSearch(text).split(' ')`, including a leading marker/prefix */
  span: [number, number];
};

/**
 * Finds a place mentioned anywhere in a message («… محدوده سعادت آباد باشه»، «پاساژ علاءالدین»، «…، نارمک»).
 * Longest match wins; malls and common-word names need a marker or prefix before them.
 */
export function scanLocation(text: string, index: PlaceIndex, opts: { relaxed?: boolean } = {}): LocationMatch | null {
  const tokens = spelling(normalizeForSearch(text)).split(' ').filter(Boolean);
  let best: LocationMatch | null = null;
  let bestLen = 0;
  for (let i = 0; i < tokens.length; i++) {
    for (let w = Math.min(4, tokens.length - i); w >= 1; w--) {
      if (w <= bestLen) break;
      const list = index.get(placeKey(tokens.slice(i, i + w).join(' ')));
      if (!list) continue;
      const prev = tokens[i - 1];
      const prev2 = tokens[i - 2];
      const marked = Boolean(prev && (PLACE_MARKERS.has(prev) || PLACE_PREFIXES.has(prev) || MALL_PREFIXES.has(prev)));
      // «پاساژ/بازار X» → the mall; otherwise the neighbourhood (dataset label, then gazetteer), then a mall
      const order = prev && MALL_PREFIXES.has(prev) ? ['mall', 'area', 'gazetteer'] : ['area', 'gazetteer', 'mall'];
      const hit = order.map((k) => list.find((x) => x.kind === k)).find((x) => x && (!x.marker || marked || opts.relaxed));
      if (!hit) continue;
      // include «پاساژ»/«میدان»… and a marker before it in the span (so it is not left in the product text)
      let start = i;
      if (prev && (PLACE_PREFIXES.has(prev) || MALL_PREFIXES.has(prev))) start = i - 1;
      if (tokens[start - 1] && PLACE_MARKERS.has(tokens[start - 1])) start -= 1;
      else if (start === i && prev2 && prev === 'خرید' && prev2 === 'مرکز') start = i - 2;
      const { marker: _m, ...place } = hit;
      void _m;
      best = { place, phrase: tokens.slice(i, i + w).join(' '), span: [start, i + w] };
      bestLen = w;
      break;
    }
  }
  return best;
}

/**
 * Free text → place (set_context, missions, location search): mall names → dataset labels (shop centroid)
 * → gazetteer → fuzzy (trigram ≥ 0.45) → null. No external geocoder. Pure given the index.
 */
export function resolvePlace(text: string, index: PlaceIndex): GeoPlace | null {
  const exact = scanLocation(text, index, { relaxed: true });
  if (exact) return exact.place;
  const key = placeKey(spelling(text).replace(/^(?:\S+\s)?(?:محدوده|نزدیک|اطراف|حوالی|میدان|خیابان|پاساژ|محله)\s+/u, ''));
  if (key.length < 3) return null;
  let best: { p: Indexed; s: number } | null = null;
  for (const [k, list] of index) {
    const s = trigramSimilarity(key, k);
    if (s >= 0.45 && (!best || s > best.s)) best = { p: list.find((x) => x.kind !== 'mall') ?? list[0], s };
  }
  if (!best) return null;
  const { marker: _m, ...place } = best.p;
  void _m;
  return place;
}

export async function geocodeText(text: string): Promise<GeoPlace | null> {
  return resolvePlace(text, await placeIndex());
}

/** Names to offer when a place could not be found («منظورتان کدام است؟»). */
export function placeSuggestions(text: string, limit = 3): string[] {
  return gazetteerSuggest(text, limit);
}
