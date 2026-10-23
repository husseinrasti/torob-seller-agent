import { describe, expect, it } from 'vitest';
import { channelLinks, composeSellerMessage, MAX_MESSAGE, phoneDigits } from './compose';

const base = {
  shop_name: 'ماهیار نیکینا',
  product_title: 'گوشی سامسونگ A17 4G | حافظه 128 رم 4 گیگابایت',
  price: 53_900_000,
  price_age_days: 1,
  mall: { name: 'پاساژ چارسو', floor_label: 'طبقه ۱', unit_label: 'C۵۲', unit_kind: 'پلاک' },
};

describe('composeSellerMessage', () => {
  it('has the product, listed price, price age and mall/floor/unit', () => {
    const t = composeSellerMessage({ ...base, intent: 'availability' });
    expect(t).toContain('«گوشی سامسونگ A17 4G»');
    expect(t).toContain('۵۳٬۹۰۰٬۰۰۰ تومان');
    expect(t).toContain('آخرین تغییر قیمت دیروز در ترب');
    expect(t).toContain('پاساژ چارسو، طبقه ۱، پلاک C۵۲');
    expect(t).toContain('موجود دارید');
    expect(t.length).toBeLessThanOrEqual(MAX_MESSAGE);
  });

  it('per intent; a target price; unknown price; long titles are cut to fit', () => {
    expect(composeSellerMessage({ ...base, intent: 'price', target_price: 52_000_000 })).toContain('اگر با ۵۲٬۰۰۰٬۰۰۰ تومان ممکن است');
    expect(composeSellerMessage({ ...base, intent: 'hours' })).toContain('تا چه ساعتی باز');
    expect(composeSellerMessage({ ...base, intent: 'reserve' })).toContain('نگه می‌دارید');
    expect(composeSellerMessage({ ...base, intent: 'custom', note: 'رنگ آبی هم دارید؟' })).toContain('رنگ آبی هم دارید؟');
    expect(composeSellerMessage({ ...base, price: null, mall: null, intent: 'availability' })).not.toContain('تومان');
    expect(composeSellerMessage({ ...base, product_title: 'ک'.repeat(600), intent: 'availability' }).length).toBeLessThanOrEqual(MAX_MESSAGE);
  });
});

describe('channels', () => {
  it('normalizes Persian phone digits', () => {
    expect(phoneDigits('۰۲۱۲۶۴۶۷۱۸۰')).toEqual({ national: '02126467180', international: '982126467180' });
    expect(phoneDigits('+98 912 000 1111')).toEqual({ national: '09120001111', international: '989120001111' });
    expect(phoneDigits('۱۲')).toBeNull();
  });

  it('WhatsApp and SMS carry the encoded text; copy is always there', () => {
    const links = channelLinks([{ channel: 'phone', display_number: '۰۲۱۲۶۴۶۷۱۸۰' }], 'سلام ۱');
    expect(links.map((l) => l.type)).toEqual(['whatsapp', 'sms', 'copy']);
    expect(links[0].url).toBe(`https://wa.me/982126467180?text=${encodeURIComponent('سلام ۱')}`);
    expect(links[1].url).toBe(`sms:02126467180?body=${encodeURIComponent('سلام ۱')}`);
    expect(channelLinks(null, 'x')).toEqual([{ type: 'copy', label: 'کپی متن' }]);
  });
});
