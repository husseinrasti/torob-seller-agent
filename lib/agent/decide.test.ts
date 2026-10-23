import { describe, expect, it } from 'vitest';
import { decide, hubOpenAt, nextOpening, travelTime, type DecideHub, type DecideShop } from './decide';
import type { WeeklyHours } from '../data/hours';

const day = (open: string, close: string) => ({ status: 'declared', shifts: [{ start_time: `${open}:00`, end_time: `${close}:00` }] });
const week = (open: string, close: string, fri: 'closed' | 'open' = 'closed'): WeeklyHours => ({
  sat: day(open, close),
  sun: day(open, close),
  mon: day(open, close),
  tue: day(open, close),
  wed: day(open, close),
  thu: day(open, close),
  fri: fri === 'closed' ? { status: 'closed' } : day(open, close),
});
let n = 0;
const shop = (o: Partial<DecideShop> & { distance_m: number }): DecideShop => ({
  shop_id: `s${++n}`,
  offer_id: `o${n}`,
  name: `مغازه ${n}`,
  lat: 35.7,
  lon: 51.4,
  lists: true,
  price: 500_000,
  weekly_hours: week('10:00', '21:30'),
  mall: null,
  address_short: null,
  ...o,
});
const hub = (o: Partial<DecideHub> = {}): DecideHub => ({
  hub_id: 'h1',
  name: 'بورس موبایل جمهوری',
  lat: 35.69,
  lon: 51.41,
  radius_m: 400,
  distance_m: 2300,
  source: 'both',
  note: null,
  typical_hours: { open: '10:00', close: '21:00' },
  shop_count: 476,
  listed_count: 311,
  category_only_count: 165,
  family_hours: Array.from({ length: 20 }, () => week('10:00', '21:00')),
  ...o,
});
// 2026-10-25 is a Sunday; 2026-10-23 a Friday (Tehran time)
const SUN_2330 = new Date('2026-10-25T23:30:00+03:30');
const SUN_1840 = new Date('2026-10-25T18:40:00+03:30');
const SUN_1930 = new Date('2026-10-25T19:30:00+03:30');
const FRI_1300 = new Date('2026-10-23T13:00:00+03:30');
const base = { need: 'شارژر گوشی', radius_m: 2000, urgency: 'now' as const };

describe('travel time', () => {
  it('walks up to 1.2 km at 80 m/min, drives beyond at 25 km/h; the toggle wins', () => {
    expect(travelTime(1000)).toEqual({ mode: 'walk', min: 13 });
    expect(travelTime(5000)).toEqual({ mode: 'car', min: 12 });
    expect(travelTime(5000, 'walk')).toEqual({ mode: 'walk', min: 63 });
    expect(travelTime(10, 'car').min).toBe(1);
  });
});

describe('decideWhereToBuy tiers', () => {
  it('23:30: nothing near is open; a far open shop within 25 min is recommended, the hub is the uncertain alternative', () => {
    const d = decide({ ...base, at: SUN_2330, shops: [shop({ distance_m: 800 }), shop({ distance_m: 1500 }), shop({ distance_m: 5000, name: 'شبانه‌روزی', weekly_hours: week('12:00', '00:00') })], hubs: [hub()] });
    const t = Object.fromEntries(d.tiers.map((x) => [x.key, x]));
    expect(t.open_listed_near.empty).toBe(true);
    expect(t.open_listed_near.verdict).toMatch(/هیچ فروشنده‌ی ثبت‌شده‌ی شارژر گوشی الان باز نیست/);
    expect(t.open_listed_far.shops[0].name).toBe('شبانه‌روزی');
    expect(t.open_listed_far.shops[0].travel).toEqual({ mode: 'car', min: 12 });
    expect(t.open_listed_far.shops[0].closes_in_min).toBe(30);
    expect(t.open_listed_far.shops[0].hurry).toBe(true);
    expect(d.recommended).toBe('open_listed_far');
    expect(d.tiers[0].key).toBe('open_listed_far');
    expect(t.hub_nearby.hubs[0].open_share).toBe(0);
    expect(t.hub_nearby.hubs[0].confidence).toBe('low');
    expect(t.opens_soonest.shops[0].opens?.label).toBe('فردا ۱۰:۰۰');
    expect(d.tradeoffs.join(' ')).toMatch(/دورتر ولی مطمئن/);
    expect(d.counts).toMatchObject({ listed_near: 2, open_near: 0, closed_near: 2 });
  });

  it('23:30 with nothing open anywhere → the hub (urgency now), the earliest opening as the safe alternative', () => {
    const d = decide({ ...base, at: SUN_2330, shops: [shop({ distance_m: 800 }), shop({ distance_m: 5000 })], hubs: [hub()] });
    expect(d.recommended).toBe('hub_nearby');
    expect(d.tiers.find((t) => t.key === 'open_listed_far')!.verdict).toMatch(/تا ۸ کیلومتر هم فروشنده‌ی بازی/);
    expect(d.tradeoffs.join(' ')).toMatch(/اگر عجله نداری/);
  });

  it('18:40: a near shop closing at 19:00 is flagged «عجله کن»; at 19:30 the verdict moves to a later-closing far shop', () => {
    const shops = [shop({ distance_m: 600, weekly_hours: week('10:00', '19:00') }), shop({ distance_m: 3500, name: 'دیرتر', weekly_hours: week('10:00', '21:30') })];
    const evening = decide({ ...base, at: SUN_1840, shops, hubs: [] });
    const t1 = evening.tiers.find((t) => t.key === 'open_listed_near')!;
    expect(evening.recommended).toBe('open_listed_near');
    expect(t1.shops[0]).toMatchObject({ closes_in_min: 20, hurry: true });
    expect(t1.verdict).toMatch(/تا ۱۹:۰۰ — عجله کن/);
    const later = decide({ ...base, at: SUN_1930, shops, hubs: [] });
    expect(later.recommended).toBe('open_listed_far');
    expect(later.verdict).toMatch(/«دیرتر»/);
  });

  it('urgency «today» prefers the earliest opening nearby over driving far', () => {
    const shops = [shop({ distance_m: 700 }), shop({ distance_m: 6000, weekly_hours: week('12:00', '00:00') })];
    expect(decide({ ...base, urgency: 'today', at: SUN_2330, shops, hubs: [] }).recommended).toBe('opens_soonest');
    expect(decide({ ...base, urgency: 'now', at: SUN_2330, shops, hubs: [] }).recommended).toBe('open_listed_far');
  });

  it('unknown and 00:00–00:00 hours are «شاید باز باشد», never open', () => {
    const placeholder: WeeklyHours = { sun: { status: 'declared', shifts: [{ start_time: '00:00:00', end_time: '00:00:00' }] }, mon: day('10:00', '19:00') };
    const d = decide({ ...base, at: SUN_2330, shops: [shop({ distance_m: 300, weekly_hours: null }), shop({ distance_m: 400, weekly_hours: placeholder }), shop({ distance_m: 900, lists: false, offer_id: null })], hubs: [] });
    const t4 = d.tiers.find((t) => t.key === 'unknown_hours_near')!;
    expect(d.tiers.find((t) => t.key === 'open_listed_near')!.empty).toBe(true);
    expect(t4.shops.map((s) => s.distance_m)).toEqual([300, 400]);
    expect(d.recommended).toBe('unknown_hours_near');
  });

  it('Friday noon: everything closed → «فردا» (Saturday) opening; no fabricated open shop', () => {
    const d = decide({ ...base, at: FRI_1300, shops: [shop({ distance_m: 500 }), shop({ distance_m: 1200 })], hubs: [hub({ family_hours: Array.from({ length: 20 }, () => week('10:00', '21:00')) })] });
    expect(d.tiers.every((t) => t.shops.every((s) => s.open.open !== true))).toBe(true);
    expect(d.tiers.find((t) => t.key === 'opens_soonest')!.shops[0].opens?.label).toBe('فردا ۱۰:۰۰');
    expect(d.tiers.find((t) => t.key === 'hub_nearby')!.hubs[0].open_share).toBe(0);
    expect(d.tiers.find((t) => t.key === 'hub_nearby')!.verdict).toMatch(/جمعه ۱۰۰٪ مغازه‌های ثبت‌شده‌اش تعطیل‌اند/);
  });

  it('Friday: «جمعه N٪ … تعطیل‌اند» once, from at least 3 shops with Friday hours', () => {
    const shops = [shop({ distance_m: 500 }), shop({ distance_m: 900 }), shop({ distance_m: 1500 }), shop({ distance_m: 2500, weekly_hours: week('10:00', '20:00', 'open') })];
    expect(decide({ ...base, at: FRI_1300, shops, hubs: [] }).day_note).toBe('جمعه ۷۵٪ فروشنده‌های شارژر گوشی در ۳ کیلومتر اطرافت تعطیل‌اند.');
    expect(decide({ ...base, at: SUN_1840, shops, hubs: [] }).day_note).toBeNull();
  });
});

describe('helpers', () => {
  it('next opening skips closed and unknown days', () => {
    expect(nextOpening({ fri: { status: 'closed' }, sat: { status: 'declared', shifts: [{ start_time: '00:00:00', end_time: '00:00:00' }] }, sun: day('09:30', '18:00') }, FRI_1300)?.label).toBe('یکشنبه ۰۹:۳۰');
  });
  it('hub open share counts only shops with hours that day', () => {
    expect(hubOpenAt([week('10:00', '21:00'), week('10:00', '23:59'), null], SUN_2330)).toMatchObject({ share: 0.5, known: 2 });
  });
});
