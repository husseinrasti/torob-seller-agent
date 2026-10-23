import { describe, expect, it } from 'vitest';
import { instagramUrl, paymentOptions, paymentWording, trustScore } from './trust';

describe('trustScore («کامل بودن اطلاعات»)', () => {
  it('adds one point each for hours, web/Instagram and a recent price', () => {
    expect(trustScore({ hours_known: false, freshness: 'stale' }).score).toBe(0);
    expect(trustScore({ hours_known: true, freshness: 'stale' }).score).toBe(1);
    expect(trustScore({ hours_known: true, instagram_url: 'https://www.instagram.com/x/', freshness: 'unknown' }).score).toBe(2);
    expect(trustScore({ hours_known: true, website_url: 'https://a.ir', freshness: 'recent' }).score).toBe(3);
    expect(trustScore({ hours_known: false, website_url: null, freshness: 'fresh' }).score).toBe(1);
  });

  it('explains each point in Persian', () => {
    const t = trustScore({ hours_known: false, website_url: 'https://a.ir', freshness: 'stale' });
    expect(t.reasons.map((r) => [r.key, r.ok])).toEqual([
      ['hours', false],
      ['web', true],
      ['price', false],
    ]);
    expect(t.reasons[0].label).toBe('ساعت کاری ثبت نشده');
    expect(t.website_url).toBe('https://a.ir');
  });
});

describe('instagramUrl', () => {
  it('reads the dataset JSON, URLs and handles', () => {
    expect(instagramUrl('{"handle":"tie_center","profile_url":"https://www.instagram.com/tie_center/"}')).toBe('https://www.instagram.com/tie_center/');
    expect(instagramUrl('{"handle":"Ariya__co"}')).toBe('https://www.instagram.com/Ariya__co/');
    expect(instagramUrl('@shop.ir')).toBe('https://www.instagram.com/shop.ir/');
    expect(instagramUrl(null)).toBeNull();
    expect(instagramUrl('{broken')).toBeNull();
  });
});

describe('payment wording', () => {
  it('in-person channels name the providers; declared ones say the channel is unknown', () => {
    const opts = paymentOptions([
      { channel: 'in_person', provider_name: 'دیجی پی' },
      { channel: 'in_person', provider_name: 'ترب‌پی' },
      { channel: 'unknown', provider_name: 'اسنپ‌پی' },
      { channel: 'unknown' },
    ]);
    expect(opts).toEqual([
      { provider: 'دیجی‌پی', in_person: true },
      { provider: 'ترب‌پی', in_person: true },
      { provider: 'اسنپ‌پی', in_person: false },
    ]);
    expect(paymentWording(opts)).toEqual(['پرداخت اعتباری حضوری تأییدشده (دیجی‌پی/ترب‌پی)', 'پرداخت اعتباری اعلام‌شده (کانال نامشخص): اسنپ‌پی']);
    expect(paymentWording([])).toEqual([]);
  });
});
