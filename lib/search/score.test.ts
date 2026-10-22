import { describe, expect, it } from 'vitest';
import { activeFilters, passesFilters, scoreSellers, whyPhrases, type ScoreInput } from './score';

const base: ScoreInput = {
  price: 55_000_000,
  price_flag: 'ok',
  freshness: 'fresh',
  price_age_days: 0,
  distance_m: 100,
  open: { known: true, open: true, closesAt: '19:00' },
  installment: false,
  torobpay: false,
  fast_delivery: null,
  has_warranty: false,
  hours_known: true,
};

describe('filters', () => {
  it('applies each filter', () => {
    expect(passesFilters(base, { installment: true })).toBe(false);
    expect(passesFilters({ ...base, installment: true }, { installment: true })).toBe(true);
    expect(passesFilters(base, { max_price: 50_000_000 })).toBe(false);
    expect(passesFilters({ ...base, price: null }, { max_price: 60_000_000 })).toBe(false);
    expect(passesFilters({ ...base, open: { known: false, open: null } }, { open_now: true })).toBe(false);
    expect(passesFilters({ ...base, freshness: 'stale' }, { hide_stale: true })).toBe(false);
    expect(passesFilters({ ...base, price_flag: 'suspicious_low' }, { hide_suspicious: true })).toBe(false);
  });
  it('lists active filters', () => {
    expect(activeFilters({ open_now: true, max_price: 1, installment: false })).toEqual(['max_price', 'open_now']);
  });
});

describe('scoreSellers', () => {
  const rows: ScoreInput[] = [
    { ...base, price: 54_000_000, distance_m: 600 },
    { ...base, price: 60_000_000, distance_m: 50 },
    { ...base, price: null, price_flag: 'missing', distance_m: 300, freshness: 'unknown', open: { known: false, open: null } },
  ];
  it('cheapest intent favours price, nearest favours distance', () => {
    const cheap = scoreSellers(rows, 1000, 'cheapest', {});
    expect(cheap[0].score).toBeGreaterThan(cheap[1].score);
    const near = scoreSellers(rows, 1000, 'nearest', {});
    expect(near[1].score).toBeGreaterThan(near[0].score);
  });
  it('unknown price/open get middle values, not zero', () => {
    const s = scoreSellers(rows, 1000, 'balanced', {})[2].score_breakdown;
    expect(s.price).toBe(0.3);
    expect(s.open).toBe(0.5);
    expect(s.freshness).toBe(0.3);
  });
  it('explains with templated reasons', () => {
    const scored = scoreSellers(rows, 1000, 'balanced', {});
    const why = whyPhrases(scored[0], { radiusM: 1000, intent: 'balanced', minPrice: 54_000_000, minDistance: 50, medianPrice: 59_000_000 });
    expect(why[0]).toBe('ارزان‌ترین در شعاع ۱ کیلومتری');
    expect(why.length).toBeLessThanOrEqual(2);
  });
});
