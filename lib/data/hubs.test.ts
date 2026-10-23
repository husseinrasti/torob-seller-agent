import { describe, expect, it } from 'vitest';
import { deriveHubs, hoursProfile, hubOpenShare, mergeCurated, streetToken, type HubShop } from './hubs';
import type { ShopType } from './shop-types';

const H = { sat: { status: 'declared', shifts: [{ start_time: '10:00:00', end_time: '21:30:00' }] }, fri: { status: 'closed' } };
let n = 0;
function cluster(lat: number, lon: number, count: number, family: ShopType, extra: Partial<HubShop> = {}): HubShop[] {
  return Array.from({ length: count }, (_, i) => ({
    shop_id: `s${n++}`,
    lat: lat + (i % 7) * 0.00003,
    lon: lon + Math.floor(i / 7) * 0.00003,
    family,
    has_offers: i % 3 !== 0,
    category_only: i % 3 === 0,
    weekly_hours: H,
    mall_name: i % 3 ? 'پاساژ علاءالدین' : 'پاساژ چارسو',
    address: 'خیابان جمهوری اسلامی، پاساژ علاءالدین، طبقه ۲',
    ...extra,
  }));
}

describe('hub derivation (synthetic shops)', () => {
  it('a dense cell of one family becomes a named hub with counts and hours', () => {
    const shops = [...cluster(35.6944, 51.4135, 60, 'mobile', { address: 'جمهوری اسلامی، پاساژ چارسو' }), ...cluster(35.6944, 51.4135, 10, 'beauty')];
    for (const s of shops.slice(0, 20)) s.address = 'خیابان جمهوری اسلامی، بعد از پل حافظ';
    const hubs = deriveHubs(shops);
    expect(hubs).toHaveLength(1);
    const h = hubs[0];
    expect(h.families).toEqual(['mobile']);
    expect(h.name).toBe('بورس موبایل جمهوری (علاءالدین/چارسو)');
    expect(h.shop_count).toBe(60);
    expect(h.listed_count + h.category_only_count).toBe(60);
    expect(h.hours_profile?.days.sat?.close_median).toBe('21:30');
    expect(hubOpenShare(h.hours_profile, 'sat', 20)).toBe(1); // open at 20:30
    expect(hubOpenShare(h.hours_profile, 'sat', 21)).toBe(0); // closed at 21:30
  });

  it('sparse shops, «unknown»/«other» families and small clusters make no hub', () => {
    expect(deriveHubs(cluster(35.7, 51.4, 15, 'mobile'))).toHaveLength(0);
    expect(deriveHubs(cluster(35.7, 51.4, 80, 'unknown'))).toHaveLength(0);
    // spread over 4 km: no cell reaches 25 shops
    expect(deriveHubs(Array.from({ length: 40 }, (_, i) => ({ ...cluster(35.7 + i * 0.001, 51.4, 1, 'mobile')[0] })))).toHaveLength(0);
  });

  it('street tokens from free-text addresses', () => {
    expect(streetToken('خیابان لاله زار جنوبی، تقاطع باربد')).toBe('لاله‌زار');
    expect(streetToken('جمهوری اسلامی، بین خط ویژه و حافظ')).toBe('جمهوری');
    expect(streetToken('خیابان 30 تیر، بعد از کوچه رستمی')).toBe('۳۰ تیر');
    expect(streetToken('پاساژ علاءالدین، طبقه ۲')).toBeNull();
  });

  it('00:00–00:00 days count as unknown in the profile', () => {
    const p = hoursProfile([{ weekly_hours: { sat: { status: 'declared', shifts: [{ start_time: '00:00:00', end_time: '00:00:00' }] } } }, { weekly_hours: H }]);
    expect(p?.days.sat?.known).toBe(1);
    expect(p?.days.sat?.open_share[3]).toBe(0);
  });

  it('curated bazaars: a matching derived hub takes the note; others are added as «curated»', () => {
    const derived = deriveHubs(cluster(35.6944, 51.4135, 60, 'mobile'));
    const merged = mergeCurated(derived, [
      { id: 'a', name: 'بورس موبایل جمهوری', families: ['mobile'], lat: 35.695, lon: 51.4115, radius_m: 600, note: 'علاءالدین و چارسو', typical_hours: { open: '10:00', close: '21:00' } },
      { id: 'b', name: 'بورس موبایل ونک', families: ['mobile'], lat: 35.7575, lon: 51.4095, radius_m: 500 },
    ]);
    expect(merged.map((h) => h.source)).toEqual(['both', 'curated']);
    expect(merged[0].typical_hours?.close).toBe('21:00');
    expect(merged[1].shop_count).toBe(0);
  });
});
