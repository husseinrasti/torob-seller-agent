import { describe, expect, it } from 'vitest';
import { planTrip, type TripStop } from './trip';
import { parseDemoTime, type WeeklyHours } from '../data/hours';

const open10to19: WeeklyHours = {
  sun: { status: 'declared', shifts: [{ start_time: '10:00:00', end_time: '19:00:00' }] },
};
const closesAt1610: WeeklyHours = {
  sun: { status: 'declared', shifts: [{ start_time: '10:00:00', end_time: '16:10:00' }] },
  mon: { status: 'declared', shifts: [{ start_time: '10:00:00', end_time: '19:00:00' }] },
};

const base = (o: Partial<TripStop>): TripStop => ({
  offer_id: 'o',
  shop_id: 's',
  shop_name: 'x',
  product_title: 'p',
  lat: 35.695,
  lon: 51.41,
  mall_key: null,
  mall_name: null,
  floor_num: null,
  floor_label: null,
  unit_label: null,
  unit_kind: null,
  address_short: '',
  price: 1,
  new_price: null,
  followup_status: 'confirmed',
  weekly_hours: open10to19,
  ...o,
});

const start = { lat: 35.6957, lon: 51.4105, label: 'فردوسی' };
const now = parseDemoTime('2026-10-25T16:00')!; // Sunday

describe('planTrip', () => {
  const stops = [
    base({ offer_id: 'a6', shop_id: 'a6', shop_name: 'الف', mall_key: 'علاءالدین', mall_name: 'پاساژ علاءالدین', floor_num: 6, lat: 35.6949, lon: 51.4072 }),
    base({ offer_id: 'c1', shop_id: 'c1', shop_name: 'چ', mall_key: 'چارسو', mall_name: 'پاساژ چارسو', floor_num: 1, lat: 35.6951, lon: 51.4120 }),
    base({ offer_id: 'a5', shop_id: 'a5', shop_name: 'ب', mall_key: 'علاءالدین', mall_name: 'پاساژ علاءالدین', floor_num: 5, lat: 35.6950, lon: 51.4073 }),
  ];
  const plan = planTrip(stops, start, now);

  it('groups by mall, floors ascending inside a mall', () => {
    expect(plan.groups).toHaveLength(2);
    const ala = plan.groups.find((g) => g.mall === 'پاساژ علاءالدین')!;
    expect(ala.steps.map((s) => s.offer_id)).toEqual(['a5', 'a6']);
  });

  it('visits the nearest group first and numbers steps in order', () => {
    expect(plan.groups[0].mall).toBe('پاساژ چارسو');
    expect(plan.groups.flatMap((g) => g.steps.map((s) => s.order))).toEqual([1, 2, 3]);
  });

  it('adds walking (80 m/min), mall entry (+3) and shop time (+5)', () => {
    const first = plan.groups[0].steps[0];
    const minutes = (new Date(first.eta).getTime() - now.getTime()) / 60000;
    expect(minutes).toBe(first.walk_min + 3);
    expect(plan.total_minutes).toBeGreaterThan(3 * 5);
  });

  it('warns when a shop is closed at the estimated arrival', () => {
    const p = planTrip([base({ offer_id: 'z', shop_id: 'z', weekly_hours: closesAt1610, lat: 35.70, lon: 51.42 })], start, now);
    const step = p.groups[0].steps[0];
    expect(step.open_at_eta.open).toBe(false);
    expect(step.warning).toContain('در زمان رسیدن بسته است');
    expect(p.warnings).toBe(1);
  });

  it('builds navigation links', () => {
    expect(plan.groups[0].steps[0].nav_links.google).toContain('maps.google.com/?q=');
  });
});
