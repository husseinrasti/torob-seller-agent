import { q } from '../db/client';
import { shortAddress } from '../search/sellers';
import type { WeeklyHours } from '../data/hours';
import type { SessionState, FollowupStatus } from '../agent/state';
import { planTrip, type PlanPayload, type TripStop } from './trip';
import { sessionFollowups } from '../sim/followups';

/** Offers for the plan: the given ids, else shortlist ∪ confirmed/pending follow-ups (never out of stock / no answer). */
export function defaultPlanOffers(state: SessionState): string[] {
  const bad = new Set(Object.entries(state.followups).filter(([, s]) => s === 'out_of_stock' || s === 'no_answer').map(([o]) => o));
  const fromFollowups = Object.entries(state.followups)
    .filter(([, s]) => s === 'confirmed' || s === 'contacting' || s === 'pending')
    .map(([o]) => o);
  return [...new Set([...state.shortlist, ...fromFollowups])].filter((o) => !bad.has(o)).slice(0, 8);
}

export async function buildPlan(opts: { sessionId: string | null; state: SessionState; now: Date; offerIds?: string[] }): Promise<{ plan_id: string; payload: PlanPayload } | null> {
  // the follow-up rows are the source of truth for replies (state may lag behind a reply that just arrived)
  const replies = opts.sessionId ? await sessionFollowups(opts.sessionId) : [];
  const followups = { ...opts.state.followups };
  for (const f of replies) followups[f.offer_id] = f.status;
  const state = { ...opts.state, followups };
  const ids = opts.offerIds?.length ? opts.offerIds.slice(0, 8) : defaultPlanOffers(state);
  if (!ids.length) return null;
  const rows = await q<{
    offer_id: string;
    shop_id: string;
    name: string;
    persian_title: string;
    lat: number;
    lon: number;
    mall_key: string | null;
    mall_name: string | null;
    floor_num: number | null;
    floor_label: string | null;
    unit_label: string | null;
    unit_kind: string | null;
    address: string | null;
    price: number | null;
    weekly_hours: WeeklyHours;
    new_price: number | null;
  }>(
    `SELECT o.offer_id, o.shop_id, s.name, p.persian_title, s.lat, s.lon, s.mall_key, s.mall_name, s.floor_num, s.floor_label,
            s.unit_label, s.unit_kind, s.address, o.price_toman::float8 AS price, s.weekly_hours,
            (SELECT f.new_price::float8 FROM followups f WHERE f.offer_id = o.offer_id AND f.session_id = $2 AND f.status = 'price_changed'
              ORDER BY f.created_at DESC LIMIT 1) AS new_price
       FROM offers o JOIN shops s USING (shop_id) JOIN products p USING (product_id)
      WHERE o.offer_id = ANY($1::text[])`,
    [ids, opts.sessionId],
  );
  const stops: TripStop[] = rows.map((r) => ({
    offer_id: r.offer_id,
    shop_id: r.shop_id,
    shop_name: r.name,
    product_title: r.persian_title,
    lat: r.lat,
    lon: r.lon,
    mall_key: r.mall_key,
    mall_name: r.mall_name,
    floor_num: r.floor_num,
    floor_label: r.floor_label,
    unit_label: r.unit_label,
    unit_kind: r.unit_kind,
    address_short: shortAddress(r.address),
    price: r.price,
    new_price: r.new_price,
    followup_status: (state.followups[r.offer_id] as FollowupStatus | undefined) ?? 'unverified',
    weekly_hours: r.weekly_hours,
  }));
  const payload = planTrip(stops, state.location, opts.now);
  const [row] = await q<{ id: string }>('INSERT INTO plans (session_id, payload) VALUES ($1, $2) RETURNING id', [opts.sessionId, JSON.stringify(payload)]);
  return { plan_id: row.id, payload };
}

export async function loadPlan(id: string): Promise<PlanPayload | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await q<{ payload: PlanPayload }>('SELECT payload FROM plans WHERE id = $1', [id]);
  return row?.payload ?? null;
}
