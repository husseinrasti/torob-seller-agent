import { describe, expect, it } from 'vitest';
import { positionOf, priceStats, talkingPoints, targetPrice } from './market-stats';

describe('market stats', () => {
  it('quantiles over sane prices', () => {
    expect(priceStats([50, 10, 30, 20, 40].map((x) => x * 1e6))).toEqual({ n: 5, min: 10e6, p25: 20e6, median: 30e6, p75: 40e6, max: 50e6 });
    expect(priceStats([10e6, 20e6]))?.toMatchObject({ median: 15e6 });
    expect(priceStats([])).toBeNull();
  });

  it('position against the median (±3 % is «near»)', () => {
    expect(positionOf(61_000_000, 57_000_000)).toEqual({ position: 'above_median', delta_pct: 7 });
    expect(positionOf(57_500_000, 57_000_000).position).toBe('near_median');
    expect(positionOf(53_900_000, 57_000_000)).toEqual({ position: 'below_median', delta_pct: -5.4 });
  });

  it('target = max(cheapest nearby, median × 0.97) rounded to 10,000, only above it', () => {
    expect(targetPrice(61_000_000, 57_000_000, 55_950_000)).toBe(55_950_000);
    expect(targetPrice(61_000_000, 57_000_000, 50_000_000)).toBe(55_290_000);
    expect(targetPrice(61_000_000, 57_000_000, null)).toBe(55_290_000);
    expect(targetPrice(53_900_000, 57_000_000, 55_000_000)).toBeNull();
  });

  it('at most four Persian talking points', () => {
    const stats = priceStats([53.9, 55.4, 57, 59.8, 61].map((x) => x * 1e6))!;
    const pts = talkingPoints({
      price: 61_000_000,
      stats,
      ...positionOf(61_000_000, stats.median),
      cheaper: { shop_name: 'فران مانآرا', price: 55_950_000, distance_m: 300, mall: 'پاساژ چارسو، طبقه ۱' },
      freshness: 'stale',
      price_age_days: 45,
      warranty_gap: 'این فروشنده گارانتی اعلام نکرده',
    });
    expect(pts).toHaveLength(4);
    expect(pts[0]).toMatch(/٪ بالای میانه بازار/);
    expect(pts[1]).toMatch(/۳۰۰ متر آن‌طرف‌تر/);
    expect(pts[2]).toMatch(/قیمت امروز را بپرسید/);
  });
});
