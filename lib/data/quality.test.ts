import { describe, expect, it } from 'vitest';
import { datasetAsOf, freshnessOf, median, paymentFlags, priceAgeDays, priceFlagOf, warrantyInfo } from './quality';

describe('price age & freshness', () => {
  const asOf = datasetAsOf('2026-10-13');
  it('counts whole days before the dataset date', () => {
    expect(priceAgeDays('2026-10-13T08:00:00+00:00', asOf)).toBe(0);
    expect(priceAgeDays('2026-09-22T08:00:00+00:00', asOf)).toBe(21);
    expect(priceAgeDays(null, asOf)).toBeNull();
  });
  it('buckets', () => {
    expect(freshnessOf(0)).toBe('fresh');
    expect(freshnessOf(7)).toBe('fresh');
    expect(freshnessOf(21)).toBe('recent');
    expect(freshnessOf(31)).toBe('stale');
    expect(freshnessOf(null)).toBe('unknown');
  });
});

describe('priceFlagOf', () => {
  it('flags missing and absolute bounds', () => {
    expect(priceFlagOf(null, null, 0)).toBe('missing');
    expect(priceFlagOf(5_000, null, 0)).toBe('suspicious_low');
    expect(priceFlagOf(20_000_000_000, null, 0)).toBe('suspicious_high');
  });
  it('compares with the product median when ≥2 sane offers', () => {
    expect(priceFlagOf(9_000_000, 55_000_000, 5)).toBe('suspicious_low');
    expect(priceFlagOf(300_000_000, 55_000_000, 5)).toBe('suspicious_high');
    expect(priceFlagOf(54_000_000, 55_000_000, 5)).toBe('ok');
    expect(priceFlagOf(9_000_000, 55_000_000, 1)).toBe('ok');
  });
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe('paymentFlags', () => {
  it('detects installment and Torob Pay with channels', () => {
    const f = paymentFlags([
      { provider_name: 'دیجی پی', channel: 'in_person' },
      { provider_name: 'ترب‌پی', channel: 'unknown' },
    ]);
    expect(f).toMatchObject({ has_installment: true, has_torobpay: true, installment_in_person: true, torobpay_in_person: false });
    expect(f.payment_providers).toEqual(['دیجی‌پی', 'ترب‌پی']);
  });
  it('empty → nothing', () => {
    expect(paymentFlags([])).toMatchObject({ has_installment: false, has_torobpay: false, payment_providers: [] });
    expect(paymentFlags(null).has_installment).toBe(false);
  });
});

describe('warrantyInfo', () => {
  it('formats company warranty', () => {
    expect(warrantyInfo({ provider: 'شرکتی', period_months: 18, description: null })).toEqual({
      provider: 'شرکتی',
      months: 18,
      text: 'گارانتی ۱۸ ماهه شرکتی',
      has_warranty: true,
    });
  });
  it('no warranty / test-on-delivery are not warranties', () => {
    expect(warrantyInfo({ provider: 'بدون گارانتی' })).toMatchObject({ text: 'بدون گارانتی', has_warranty: false });
    expect(warrantyInfo({ provider: 'تست و تحویل در حضور مشتری' }).has_warranty).toBe(false);
    expect(warrantyInfo(null)).toMatchObject({ text: null, has_warranty: false });
  });
});
