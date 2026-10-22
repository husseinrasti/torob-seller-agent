import { describe, expect, it } from 'vitest';
import { toEnDigits, toFaDigits } from './digits';
import { normalizeFa, normalizeForSearch, zwnjVariants } from './normalize';
import { faText, formatDistance, formatNumber, formatToman, formatTomanShort, relativeDays } from './format';

describe('digits', () => {
  it('converts Persian and Arabic digits to ASCII', () => {
    expect(toEnDigits('۱۲۸ گیگ ٤')).toBe('128 گیگ 4');
    expect(toEnDigits('۲٫۵')).toBe('2.5');
  });
  it('converts ASCII digits to Persian', () => {
    expect(toFaDigits(1403)).toBe('۱۴۰۳');
    expect(toFaDigits('1.2')).toBe('۱٫۲');
  });
});

describe('normalizeFa', () => {
  it('unifies Arabic letters', () => {
    expect(normalizeFa('كيف')).toBe('کیف');
    expect(normalizeFa('مي')).toBe('می');
  });
  it('removes tatweel and diacritics', () => {
    expect(normalizeFa('مـــوبایل')).toBe('موبایل');
    expect(normalizeFa('کُتاب')).toBe('کتاب');
  });
  it('ASCII digits, lowercase Latin, punctuation', () => {
    expect(normalizeFa('سامسونگ A17 «۱۲۸/۴»!')).toBe('سامسونگ a17 128/4');
    expect(normalizeFa('سیم ۲ در ۲.۵')).toBe('سیم 2 در 2.5');
    expect(normalizeFa('Galaxy S25+, 5G.')).toBe('galaxy s25+ 5g');
    expect(normalizeFa('۶۰٬۰۰۰٬۰۰۰ تومان')).toBe('60000000 تومان');
  });
  it('keeps a single ZWNJ and drops it next to spaces', () => {
    expect(normalizeFa('قهوه‌‌ساز')).toBe('قهوه‌ساز');
    expect(normalizeFa('قهوه ‌ ساز')).toBe('قهوه ساز');
  });
  it('handles empty', () => {
    expect(normalizeFa(null)).toBe('');
  });
});

describe('search variants', () => {
  it('normalizeForSearch maps ZWNJ to space', () => {
    expect(normalizeForSearch('قهوه‌ساز خانگی')).toBe('قهوه ساز خانگی');
  });
  it('zwnjVariants', () => {
    expect(zwnjVariants('قهوه‌ساز')).toEqual(['قهوه‌ساز', 'قهوهساز', 'قهوه ساز']);
    expect(zwnjVariants('هدفون')).toEqual(['هدفون']);
  });
});

describe('format', () => {
  it('formatToman', () => {
    expect(formatToman(55990000)).toBe('۵۵٬۹۹۰٬۰۰۰ تومان');
    expect(formatToman(null)).toBe('قیمت ثبت نشده');
    expect(formatNumber(1000)).toBe('۱٬۰۰۰');
  });
  it('formatTomanShort', () => {
    expect(formatTomanShort(60_000_000)).toBe('۶۰ میلیون');
    expect(formatTomanShort(2_500_000)).toBe('۲٫۵ میلیون');
    expect(formatTomanShort(850_000)).toBe('۸۵۰ هزار');
  });
  it('formatDistance', () => {
    expect(formatDistance(350)).toBe('۳۵۰ متر');
    expect(formatDistance(1240)).toBe('۱٫۲ کیلومتر');
    expect(formatDistance(1000)).toBe('۱ کیلومتر');
  });
  it('relativeDays', () => {
    expect(relativeDays(0)).toBe('امروز');
    expect(relativeDays(3)).toBe('۳ روز پیش');
    expect(relativeDays(21)).toBe('۳ هفته پیش');
    expect(relativeDays(65)).toBe('۲ ماه پیش');
    expect(relativeDays(null)).toBe('نامشخص');
  });
});

describe('faText', () => {
  it('converts standalone numbers but keeps model codes', () => {
    expect(faText('گوشی سامسونگ A17 4G | حافظه 128 رم 4 گیگابایت')).toBe('گوشی سامسونگ A17 4G · حافظه ۱۲۸ رم ۴ گیگابایت');
    expect(faText('سیم 2 در 2.5')).toBe('سیم ۲ در ۲٫۵');
    expect(faText('مدل DS-2CD1023G2-LIU')).toBe('مدل DS-2CD1023G2-LIU');
  });
});
