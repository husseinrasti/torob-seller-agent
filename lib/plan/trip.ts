import { haversine, navLinks } from '../geo';
import { openState, localClock, type WeeklyHours } from '../data/hours';
import { floorText } from '../data/mall';
import { toFaDigits } from '../fa/digits';
import type { FollowupStatus } from '../agent/state';

export const WALK_M_PER_MIN = 80;
export const SHOP_MIN = 5;
export const MALL_ENTRY_MIN = 3;

export type TripStop = {
  offer_id: string;
  shop_id: string;
  shop_name: string;
  product_title: string;
  lat: number;
  lon: number;
  mall_key: string | null;
  mall_name: string | null;
  floor_num: number | null;
  floor_label: string | null;
  unit_label: string | null;
  unit_kind: string | null;
  address_short: string;
  price: number | null;
  new_price: number | null;
  followup_status: FollowupStatus | 'unverified';
  weekly_hours: WeeklyHours;
};

export type PlanStep = {
  order: number;
  offer_id: string;
  shop_id: string;
  shop_name: string;
  product_title: string;
  mall: string | null;
  floor_label: string | null;
  unit_label: string | null;
  address_short: string;
  eta: string; // ISO
  eta_label: string; // «۱۶:۱۲»
  walk_min: number; // walking before this step (0 inside the same mall)
  open_at_eta: { known: boolean; open: boolean | null; label: string };
  warning: string | null;
  price: number | null;
  new_price: number | null;
  followup_status: FollowupStatus | 'unverified';
  lat: number;
  lon: number;
  nav_links: { osm: string; google: string; neshan: string };
};

export type PlanGroup = { mall: string | null; steps: PlanStep[] };

export type PlanPayload = {
  start: { lat: number; lon: number; label: string };
  start_at: string;
  start_label: string;
  groups: PlanGroup[];
  total_minutes: number;
  total_walk_m: number;
  warnings: number;
};

function hhmm(d: Date): string {
  const { minutes } = localClock(d);
  return toFaDigits(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
}

/**
 * Spec §8: group stops by mall, visit groups nearest-neighbour from the start, floors ascending inside a
 * mall; walking 80 m/min, +5 min per shop, +3 min per mall entry; validate opening hours at each ETA.
 */
export function planTrip(stops: TripStop[], start: { lat: number; lon: number; label: string }, now: Date): PlanPayload {
  const groups = new Map<string, TripStop[]>();
  for (const s of stops) {
    const key = s.mall_key ? `mall:${s.mall_key}` : `shop:${s.shop_id}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const pending = [...groups.values()].map((g) => ({
    stops: [...g].sort((a, b) => (a.floor_num ?? 99) - (b.floor_num ?? 99) || a.shop_name.localeCompare(b.shop_name, 'fa')),
    lat: g.reduce((x, s) => x + s.lat, 0) / g.length,
    lon: g.reduce((x, s) => x + s.lon, 0) / g.length,
    mall: g[0].mall_key ? g[0].mall_name : null,
  }));

  const out: PlanGroup[] = [];
  let pos = { lat: start.lat, lon: start.lon };
  let t = now.getTime();
  let order = 0;
  let totalWalk = 0;
  let warnings = 0;
  while (pending.length) {
    let best = 0;
    for (let i = 1; i < pending.length; i++) {
      if (haversine(pos.lat, pos.lon, pending[i].lat, pending[i].lon) < haversine(pos.lat, pos.lon, pending[best].lat, pending[best].lon)) best = i;
    }
    const g = pending.splice(best, 1)[0];
    const walkM = haversine(pos.lat, pos.lon, g.lat, g.lon);
    const walkMin = Math.max(1, Math.round(walkM / WALK_M_PER_MIN));
    totalWalk += walkM;
    t += walkMin * 60_000;
    if (g.mall) t += MALL_ENTRY_MIN * 60_000;
    const steps: PlanStep[] = [];
    g.stops.forEach((s, idx) => {
      const eta = new Date(t);
      const os = openState(s.weekly_hours, eta);
      const closed = os.known && os.open === false;
      if (closed) warnings++;
      steps.push({
        order: ++order,
        offer_id: s.offer_id,
        shop_id: s.shop_id,
        shop_name: s.shop_name,
        product_title: s.product_title,
        mall: s.mall_name,
        floor_label: floorText(s.floor_num, s.floor_label),
        unit_label: s.unit_label ? `${s.unit_kind ?? 'واحد'} ${toFaDigits(s.unit_label)}` : null,
        address_short: s.address_short,
        eta: eta.toISOString(),
        eta_label: hhmm(eta),
        walk_min: idx === 0 ? walkMin : 0,
        open_at_eta: { known: os.known, open: os.open, label: os.label },
        warning: closed ? `⚠️ در زمان رسیدن بسته است${os.nextOpen ? ` · ${os.nextOpen.day} ${toFaDigits(os.nextOpen.time)} باز می‌شود` : os.opensAt ? ` · ${toFaDigits(os.opensAt)} باز می‌شود` : ''}` : null,
        price: s.price,
        new_price: s.new_price,
        followup_status: s.followup_status,
        lat: s.lat,
        lon: s.lon,
        nav_links: navLinks(s.lat, s.lon),
      });
      t += SHOP_MIN * 60_000;
    });
    out.push({ mall: g.mall, steps });
    pos = { lat: g.lat, lon: g.lon };
  }
  return {
    start: { lat: start.lat, lon: start.lon, label: start.label },
    start_at: now.toISOString(),
    start_label: hhmm(now),
    groups: out,
    total_minutes: Math.round((t - now.getTime()) / 60_000),
    total_walk_m: Math.round(totalWalk),
    warnings,
  };
}
