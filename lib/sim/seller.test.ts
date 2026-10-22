import { describe, expect, it } from 'vitest';
import { followupResult, groundTruth, simRandoms } from './seller';

describe('simRandoms', () => {
  it('is deterministic per salt + offer and in [0,1)', () => {
    const a = simRandoms('offer_x', 's1');
    expect(simRandoms('offer_x', 's1')).toEqual(a);
    expect(simRandoms('offer_x', 's2')).not.toEqual(a);
    for (const v of a) expect(v >= 0 && v < 1).toBe(true);
  });
});

describe('groundTruth', () => {
  const ids = Array.from({ length: 4000 }, (_, i) => `offer_${i}`);
  const rate = (freshness: 'fresh' | 'recent' | 'stale', outcome: string) =>
    ids.filter((id) => groundTruth({ offer_id: id, price: 50_000_000, freshness }, 'test').outcome === outcome).length / ids.length;

  it('follows the probability buckets by freshness (±3%)', () => {
    expect(Math.abs(rate('fresh', 'out_of_stock') - 0.1)).toBeLessThan(0.03);
    expect(Math.abs(rate('fresh', 'price_changed') - 0.08)).toBeLessThan(0.03);
    expect(Math.abs(rate('recent', 'out_of_stock') - 0.18)).toBeLessThan(0.03);
    expect(Math.abs(rate('stale', 'out_of_stock') - 0.35)).toBeLessThan(0.03);
    expect(Math.abs(rate('stale', 'price_changed') - 0.25)).toBeLessThan(0.03);
  });

  it('new prices are within [−5%, +15%] (never unchanged), rounded to 10,000; latency 1.5–4 s', () => {
    for (const id of ids.slice(0, 500)) {
      const t = groundTruth({ offer_id: id, price: 50_000_000, freshness: 'stale' }, 'test');
      expect(t.latencyMs).toBeGreaterThanOrEqual(1500);
      expect(t.latencyMs).toBeLessThanOrEqual(4000);
      if (t.outcome === 'price_changed') {
        expect(t.newPrice! % 10_000).toBe(0);
        expect(t.newPrice!).toBeGreaterThanOrEqual(47_500_000);
        expect(t.newPrice!).toBeLessThanOrEqual(57_500_000);
        expect(Math.abs(t.newPrice! - 50_000_000)).toBeGreaterThanOrEqual(1_000_000);
      }
    }
  });

  it('missing price → the seller quotes one', () => {
    const outcomes = new Set(ids.slice(0, 200).map((id) => groundTruth({ offer_id: id, price: null, freshness: 'unknown', reference_price: 1_000_000 }, 't').outcome));
    expect(outcomes.has('price_quoted')).toBe(true);
    expect(outcomes.has('price_changed')).toBe(false);
  });
});

describe('followupResult', () => {
  const truth = { outcome: 'confirmed' as const, newPrice: null, latencyMs: 2000 };
  it('closed shop: call → no answer, message → real answer', () => {
    expect(followupResult(truth, 'call', true).status).toBe('no_answer');
    expect(followupResult(truth, 'message', true).status).toBe('confirmed');
  });
  it('price change carries the new price', () => {
    expect(followupResult({ outcome: 'price_changed', newPrice: 61_000_000, latencyMs: 1 }, 'message', false)).toEqual({ status: 'price_changed', newPrice: 61_000_000 });
  });
});
