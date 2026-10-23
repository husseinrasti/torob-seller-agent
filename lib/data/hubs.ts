import { toFaDigits } from '../fa/digits';
import { shiftsOf, type DayKey, type WeeklyHours } from './hours';
import { WEEK, dayStats } from './hours-stats';
import type { ShopType } from './shop-types';

/**
 * «بورس‌ها» (pure): commercial clusters derived from the shops — a 400 m grid, cells with ≥ 25 shops, and per
 * shop family the connected cells where that family is strong — merged with a small curated list of
 * well-known Tehran bazaars. Each hub keeps counts (listed / category-only) and an opening-hours profile.
 */

export type HubShop = {
  shop_id: string;
  lat: number;
  lon: number;
  family: ShopType;
  has_offers: boolean;
  /** no offers, but activity categories in the dataset («ممکن است داشته باشد») */
  category_only: boolean;
  weekly_hours: WeeklyHours;
  mall_name: string | null;
  address: string | null;
};

export type DayProfile = { known: number; open_median: string | null; close_median: string | null; open_share: number[] };
export type HoursProfile = { shops: number; known_share: number; days: Partial<Record<DayKey, DayProfile>> };
export type TypicalHours = { open: string; close: string; note?: string };

export type Hub = {
  hub_id: string;
  name: string;
  source: 'derived' | 'curated' | 'both';
  lat: number;
  lon: number;
  radius_m: number;
  families: ShopType[];
  family_counts: Partial<Record<ShopType, number>>;
  shop_count: number;
  listed_count: number;
  category_only_count: number;
  hours_profile: HoursProfile | null;
  typical_hours: TypicalHours | null;
  note: string | null;
  malls: string[];
  street: string | null;
};

export type CuratedHub = { id: string; name: string; families: ShopType[]; lat: number; lon: number; radius_m: number; typical_hours?: TypicalHours; note?: string };

export const CELL_M = 400;
const DENSE_CELL = 25;
const FAMILY_STRONG = 30;
const FAMILY_MIN = 10;
const FAMILY_SHARE = 0.15;
const HUB_MIN = 20;

/** Short family names for hub labels («بورس موبایل …»). */
export const FAMILY_SHORT: Record<ShopType, string> = {
  mobile: 'موبایل',
  computer: 'کامپیوتر',
  av: 'صوتی و تصویری',
  security: 'دوربین مداربسته',
  electronics: 'قطعات الکترونیکی',
  lighting: 'برق و روشنایی',
  tools: 'ابزار',
  appliance: 'لوازم خانگی',
  home: 'لوازم منزل',
  apparel: 'پوشاک',
  beauty: 'آرایشی',
  health: 'تجهیزات پزشکی',
  jewelry: 'ساعت و طلا',
  auto: 'لوازم خودرو',
  kids: 'اسباب‌بازی',
  sport: 'ورزشی',
  books: 'لوازم‌التحریر',
  food: 'خوراکی',
  other: 'فروشگاه‌ها',
  unknown: 'فروشگاه‌ها',
};

const M_PER_DEG = 111_320;

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/** Street of an address's first segment: «خیابان لاله زار جنوبی، …» → «لاله‌زار»; malls/alleys → null. */
export function streetToken(address: string | null): string | null {
  if (!address) return null;
  let s = address.split(/[،,]/)[0].replace(/‌/g, ' ').replace(/\s+/g, ' ').trim();
  if (/پاساژ|مجتمع|مرکز خرید|بازارچه|ساختمان|برج|کوچه|پلاک|طبقه|واحد/u.test(s)) return null;
  s = s.replace(/^(?:تهران\s*[-–]?\s*)?(?:خیابان|خ\.|خ|بلوار|بزرگراه|میدان|چهارراه|تقاطع)\s+/u, '');
  s = s.replace(/\s+(?:جنوبی|شمالی|شرقی|غربی)$/u, '');
  s = s.replace(/^جمهوری اسلامی$/u, 'جمهوری').replace(/^لاله ?زار$/u, 'لاله‌زار').replace(/^شیخ ?هادی$/u, 'شیخ‌هادی').replace(/^امین ?حضور$/u, 'امین‌حضور').replace(/^ناصر ?خسرو$/u, 'ناصرخسرو');
  if (!s || s.length > 18 || /\d{3,}/.test(s)) return null;
  return toFaDigits(s);
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Per weekday: shops with known hours, median opening/closing and the share open at each hh:30. */
export function hoursProfile(shops: Array<{ weekly_hours: WeeklyHours }>): HoursProfile | null {
  if (!shops.length) return null;
  const days: HoursProfile['days'] = {};
  let knownAny = 0;
  for (const s of shops) if (WEEK.some((d) => shiftsOf(s.weekly_hours?.[d]))) knownAny++;
  for (const d of WEEK) {
    const st = dayStats(shops, d);
    const opens: number[] = [];
    const closes: number[] = [];
    for (const s of shops) {
      const sh = shiftsOf(s.weekly_hours?.[d]);
      if (!sh) continue;
      opens.push(sh[0][0]);
      closes.push(sh[sh.length - 1][1]);
    }
    const o = median(opens);
    const c = median(closes);
    days[d] = { known: st.known, open_median: o === null ? null : hhmm(o), close_median: c === null ? null : hhmm(c), open_share: st.perHour.map((x) => Math.round(x * 100) / 100) };
  }
  return { shops: shops.length, known_share: Math.round((knownAny / shops.length) * 100) / 100, days };
}

function topBy<T>(xs: T[], key: (x: T) => string | null, min = 1): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const x of xs) {
    const k = key(x);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]);
}

const shortMall = (m: string) => m.replace(/^(?:پاساژ|مجتمع تجاری|مجتمع|مرکز خرید|ساختمان|بازار)\s+/u, '').trim();

/** «بورس موبایل جمهوری (علاءالدین/چارسو)». */
export function hubName(family: ShopType, members: HubShop[]): { name: string; street: string | null; malls: string[] } {
  const street = topBy(members, (s) => streetToken(s.address), 3)[0]?.[0] ?? null;
  // malls holding ≥ 15 % of the hub's shops, without near-duplicates («علاءالدین» / «علاءالدین ۲»)
  const malls: string[] = [];
  for (const [m] of topBy(members, (s) => s.mall_name, Math.max(5, Math.ceil(members.length * 0.15)))) {
    const short = shortMall(m);
    if (malls.length < 2 && !malls.some((x) => short.includes(x) || x.includes(short))) malls.push(short);
  }
  const name = `بورس ${FAMILY_SHORT[family]}${street ? ` ${street}` : ''}${malls.length ? ` (${malls.join('/')})` : ''}`;
  return { name, street, malls };
}

type Cell = { i: number; j: number; shops: HubShop[] };

/** Derived hubs: one per (family, connected strong cells) with ≥ 20 shops of that family. */
export function deriveHubs(shops: HubShop[], opts: { cellM?: number } = {}): Hub[] {
  if (!shops.length) return [];
  const cellM = opts.cellM ?? CELL_M;
  const lat0 = shops.reduce((a, s) => a + s.lat, 0) / shops.length;
  const dLat = cellM / M_PER_DEG;
  const dLon = cellM / (M_PER_DEG * Math.cos((lat0 * Math.PI) / 180));
  const cells = new Map<string, Cell>();
  for (const s of shops) {
    const i = Math.floor(s.lat / dLat);
    const j = Math.floor(s.lon / dLon);
    const k = `${i}:${j}`;
    const c = cells.get(k) ?? { i, j, shops: [] };
    c.shops.push(s);
    cells.set(k, c);
  }
  const dense = [...cells.values()].filter((c) => c.shops.length >= DENSE_CELL);
  const families = [...new Set(shops.map((s) => s.family))].filter((f) => f !== 'unknown' && f !== 'other');
  const hubs: Hub[] = [];
  for (const f of families) {
    const strong = dense.filter((c) => {
      const n = c.shops.filter((s) => s.family === f).length;
      return n >= FAMILY_STRONG || (n >= FAMILY_MIN && n / c.shops.length >= FAMILY_SHARE);
    });
    // connected components over the 8-neighbourhood
    const seen = new Set<Cell>();
    for (const start of strong) {
      if (seen.has(start)) continue;
      const comp: Cell[] = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const c = stack.pop()!;
        comp.push(c);
        for (const o of strong) {
          if (seen.has(o) || Math.abs(o.i - c.i) > 1 || Math.abs(o.j - c.j) > 1) continue;
          seen.add(o);
          stack.push(o);
        }
      }
      const members = comp.flatMap((c) => c.shops.filter((s) => s.family === f));
      if (members.length < HUB_MIN) continue;
      const lat = members.reduce((a, s) => a + s.lat, 0) / members.length;
      const lon = members.reduce((a, s) => a + s.lon, 0) / members.length;
      const dists = members.map((s) => distanceM(lat, lon, s.lat, s.lon)).sort((a, b) => a - b);
      const radius = Math.round(Math.min(1200, Math.max(150, dists[Math.floor(dists.length * 0.9)] ?? 150)));
      const all = comp.flatMap((c) => c.shops);
      const counts: Partial<Record<ShopType, number>> = {};
      for (const s of all) counts[s.family] = (counts[s.family] ?? 0) + 1;
      const n = hubName(f, members);
      hubs.push({
        hub_id: `${f}-${Math.round(lat * 1000)}-${Math.round(lon * 1000)}`,
        name: n.name,
        source: 'derived',
        lat,
        lon,
        radius_m: radius,
        families: [f],
        family_counts: counts,
        shop_count: members.length,
        listed_count: members.filter((s) => s.has_offers).length,
        category_only_count: members.filter((s) => s.category_only).length,
        hours_profile: hoursProfile(members),
        typical_hours: null,
        note: null,
        malls: n.malls,
        street: n.street,
      });
    }
  }
  // same name twice (two clusters of a family on one street): add a direction-free ordinal
  const byName = new Map<string, Hub[]>();
  for (const h of hubs) byName.set(h.name, [...(byName.get(h.name) ?? []), h]);
  for (const list of byName.values()) if (list.length > 1) list.sort((a, b) => b.shop_count - a.shop_count).slice(1).forEach((h, i) => (h.name = `${h.name} ${toFaDigits(i + 2)}`));
  return hubs.sort((a, b) => b.shop_count - a.shop_count);
}

/**
 * Curated bazaars: a derived hub of a shared family within reach takes the curated note and typical hours
 * (source 'both', keeps its data-based name); otherwise the curated entry is added as is (source 'curated').
 */
export function mergeCurated(derived: Hub[], curated: CuratedHub[]): Hub[] {
  const out = derived.map((h) => ({ ...h }));
  for (const c of curated) {
    const match = out
      .filter((h) => h.source !== 'curated' && h.families.some((f) => c.families.includes(f)) && distanceM(h.lat, h.lon, c.lat, c.lon) <= Math.max(600, c.radius_m))
      .sort((a, b) => b.shop_count - a.shop_count)[0];
    if (match) {
      match.source = 'both';
      match.note = c.note ?? match.note;
      match.typical_hours = c.typical_hours ?? match.typical_hours;
      continue;
    }
    out.push({
      hub_id: `curated-${c.id}`,
      name: c.name,
      source: 'curated',
      lat: c.lat,
      lon: c.lon,
      radius_m: c.radius_m,
      families: c.families,
      family_counts: {},
      shop_count: 0,
      listed_count: 0,
      category_only_count: 0,
      hours_profile: null,
      typical_hours: c.typical_hours ?? null,
      note: c.note ?? null,
      malls: [],
      street: null,
    });
  }
  return out;
}

/** Share of a hub's shops (with known hours that day) open at `dayKey` hh:30 — null when unknown. */
export function hubOpenShare(profile: HoursProfile | null, day: DayKey, hour: number): number | null {
  const d = profile?.days[day];
  if (!d || !d.known) return null;
  return d.open_share[hour] ?? null;
}
