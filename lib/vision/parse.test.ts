import { describe, expect, it } from 'vitest';
import { brandFa, priceFromLines, recognized, shelfPrice, visionLabel, visionQuery, type Vision } from './parse';

const v = (o: Partial<Vision>): Vision => ({ brand: null, model: null, product_type: null, visible_price_toman: null, text_lines: [], confidence: 0.9, ...o });

describe('photo search parsing (F1)', () => {
  it('reads a Persian shelf price in toman, ریال and «میلیون»', () => {
    expect(priceFromLines(['قیمت:', '۶۴٬۵۰۰٬۰۰۰ تومان'])).toBe(64_500_000);
    expect(priceFromLines(['64,500,000 ت'])).toBe(64_500_000);
    expect(priceFromLines(['۶۴۵٬۰۰۰٬۰۰۰ ریال'])).toBe(64_500_000);
    expect(priceFromLines(['۵۸.۹ میلیون تومان'])).toBe(58_900_000);
    expect(priceFromLines(['حافظه ۱۲۸ گیگ · رم ۴ گیگ', 'Galaxy A17 4G'])).toBeNull();
  });

  it('prefers the model\'s price when sane, else the text lines', () => {
    expect(shelfPrice(v({ visible_price_toman: 64_500_000 }))).toBe(64_500_000);
    expect(shelfPrice(v({ visible_price_toman: 12, text_lines: ['۶۴٬۵۰۰٬۰۰۰ تومان'] }))).toBe(64_500_000);
  });

  it('builds the search text in Persian without repeating the brand', () => {
    expect(brandFa('Samsung')).toBe('سامسونگ');
    expect(visionQuery(v({ brand: 'Samsung', model: 'Samsung Galaxy A17', product_type: 'گوشی موبایل' }))).toBe('گوشی موبایل سامسونگ Galaxy A17');
    expect(visionLabel(v({ brand: 'Samsung', model: 'Galaxy A17', product_type: 'گوشی موبایل' }))).toBe('سامسونگ Galaxy A17 (گوشی موبایل)');
  });

  it('gives up on scenes and low confidence («نتونستم تشخیص بدم»)', () => {
    expect(recognized(v({ product_type: 'منظره طبیعی', confidence: 0.9 }))).toBe(false);
    expect(recognized(v({ brand: 'Samsung', confidence: 0.2 }))).toBe(false);
    expect(recognized(v({ confidence: 0.9 }))).toBe(false);
    expect(recognized(v({ brand: 'Samsung', model: 'Galaxy A17', confidence: 0.8 }))).toBe(true);
  });
});
