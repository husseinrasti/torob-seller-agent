import { describe, expect, it } from 'vitest';
import { categoryShopType, shopTypeFromCategories } from './shop-type-rules';
import { isShopType, shopTypeLabel, SHOP_TYPES } from './shop-types';

const typeOf = (c: string) => categoryShopType(c)?.[0] ?? null;

describe('categoryShopType', () => {
  it.each([
    ['گوشی موبایل', 'mobile'],
    ['گوشي موبايل', 'mobile'], // Arabic ي
    ['سایر سیم کارت ها و خطوط تلفن', 'mobile'],
    ['لپ تاپ و نوت بوک', 'computer'],
    ['کابل شبکه', 'computer'],
    ['دستگاه ویدیو پروژکتور', 'av'],
    ['دوربین عکاسی و فیلمبرداری', 'av'],
    ['دوربین مدار بسته', 'security'],
    ['مانیتور آیفون تصویری', 'security'],
    ['آی سی گوشی و تبلت', 'mobile'],
    ['ترانزیستور', 'electronics'],
    ['پروژکتور و وال واشر', 'lighting'],
    ['کلید کولر', 'lighting'],
    ['ترانسمیتر فشار', 'tools'],
    ['واحد مراقبت پنوماتیک', 'tools'],
    ['شیر دوش کودک', 'health'],
    ['اتو و صاف کننده مو', 'beauty'],
    ['سایر لوازم تهویه، سرمایش و گرمایش', 'appliance'],
    ['اتو', 'appliance'],
    ['چراغ جلو خودرو', 'auto'],
    ['تاپ و تیشرت زنانه', 'apparel'],
    ['پافر زنانه', 'apparel'],
    ['عروسک', 'kids'],
    ['فلوتر و شناور', 'tools'],
    ['بخور و رطوبت ساز', 'appliance'],
    ['قهوه و اسپرسو ساز', 'appliance'],
    ['اکسیژن ساز و نبولایزر', 'health'],
    ['ترمیم کننده و ضد التهاب', 'beauty'],
    ['هاب USB', 'computer'],
    ['کتاب چاپی', 'books'],
  ])('%s → %s', (category, type) => {
    expect(typeOf(category)).toBe(type);
  });

  it('gives ambiguous categories no vote or a lower weight', () => {
    expect(categoryShopType('آداپتور برق')).toBeNull();
    expect(categoryShopType('باتری قلمی، سکه‌ای و کتابی')).toBeNull();
    expect(categoryShopType('هدفون، هدست و هندزفری')).toEqual(['mobile', 1]);
    expect(categoryShopType('شارژر')?.[1]).toBe(0.5);
  });
});

describe('shopTypeFromCategories', () => {
  it('picks the type with the most votes', () => {
    // a CCTV shop from the dataset: car cameras and a hard disk do not outvote the security categories
    const cats = [
      'دوربین مدار بسته',
      'ضبط کننده ویدیویی دوربین‌های نظارتی و امنیتی',
      'دوربین خودرو و موتور سیکلت',
      'دوربین امنیتی خورشیدی',
      'دوربین مخفی',
      'هارد دیسک اینترنال',
      'آداپتور برق',
      'دزدگیر اماکن و لوازم جانبی',
      'منبع تغذیه UPS',
    ];
    expect(shopTypeFromCategories(cats)).toBe('security');
  });

  it('weights votes (offer counts) and breaks ties by type order', () => {
    expect(shopTypeFromCategories([['گوشی موبایل', 2], ['لپ تاپ و نوت بوک', 5]])).toBe('computer');
    expect(shopTypeFromCategories(['لپ تاپ و نوت بوک', 'گوشی موبایل'])).toBe('mobile');
  });

  it('is "other" without any vote', () => {
    expect(shopTypeFromCategories([])).toBe('other');
    expect(shopTypeFromCategories(['آداپتور برق', 'سایر باتری'])).toBe('other');
  });
});

describe('shop type labels', () => {
  it('has a Persian label for every type and falls back to «سایر»', () => {
    for (const t of SHOP_TYPES) expect(shopTypeLabel(t.key)).toMatch(/\p{Script=Arabic}/u);
    expect(shopTypeLabel('nope')).toBe('سایر فروشگاه‌ها');
    expect(isShopType('mobile')).toBe(true);
    expect(isShopType('nope')).toBe(false);
  });
});
