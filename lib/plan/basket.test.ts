import { describe, expect, it } from 'vitest';
import { hasCode, looksLikeBasket, modelCodeOf, planBasket, splitBasketItems, type BasketCandidate } from './basket';

const c = (offer_id: string, mall_key: string | null, price: number, distance_m: number): BasketCandidate => ({ offer_id, shop_id: `s-${offer_id}`, mall_key, price, distance_m });

describe('basket set cover (F3)', () => {
  it('buys as many items as possible in one mall, the rest from the nearest seller', () => {
    const { picks, coverage } = planBasket([
      { item_id: 'phone', candidates: [c('p1', 'A', 50, 300), c('p2', 'B', 48, 200)] },
      { item_id: 'case', candidates: [c('k1', 'A', 2, 300), c('k2', null, 1, 50)] },
      { item_id: 'glass', candidates: [c('g1', 'A', 1, 310), c('g2', 'B', 1, 210)] },
      { item_id: 'power', candidates: [c('w1', null, 9, 800), c('w2', 'C', 8, 400)] },
    ]);
    expect(picks.map((p) => [p.item_id, p.offer_id, p.via])).toEqual([
      ['phone', 'p1', 'mall'],
      ['case', 'k1', 'mall'],
      ['glass', 'g1', 'mall'],
      ['power', 'w2', 'nearest'],
    ]);
    expect(coverage).toMatchObject({ items_total: 4, items_in_one_mall: 3, malls_used: 2, stops: 2, uncovered: [] });
  });

  it('breaks a tie on covered items by total price, then by distance', () => {
    const items = [
      { item_id: 'a', candidates: [c('a1', 'X', 10, 500), c('a2', 'Y', 9, 900)] },
      { item_id: 'b', candidates: [c('b1', 'X', 10, 500), c('b2', 'Y', 9, 900)] },
    ];
    expect(planBasket(items).picks.every((p) => p.mall_key === 'Y')).toBe(true);
    const same = [
      { item_id: 'a', candidates: [c('a1', 'X', 10, 500), c('a2', 'Y', 10, 200)] },
      { item_id: 'b', candidates: [c('b1', 'X', 10, 500), c('b2', 'Y', 10, 200)] },
    ];
    expect(planBasket(same).picks.every((p) => p.mall_key === 'Y')).toBe(true);
  });

  it('takes a second mall when it still covers two open items', () => {
    const { coverage } = planBasket([
      { item_id: '1', candidates: [c('1a', 'A', 1, 1)] },
      { item_id: '2', candidates: [c('2a', 'A', 1, 1)] },
      { item_id: '3', candidates: [c('3a', 'A', 1, 1)] },
      { item_id: '4', candidates: [c('4b', 'B', 1, 1)] },
      { item_id: '5', candidates: [c('5b', 'B', 1, 1)] },
    ]);
    expect(coverage).toMatchObject({ items_in_one_mall: 3, malls_used: 2, stops: 2 });
  });

  it('reports items without any seller and skips excluded offers (out of stock)', () => {
    const { picks, coverage } = planBasket(
      [
        { item_id: 'a', candidates: [c('a1', 'A', 1, 1), c('a2', 'B', 2, 2)] },
        { item_id: 'b', candidates: [c('b1', 'B', 1, 1)] },
        { item_id: 'z', candidates: [] },
      ],
      { exclude: new Set(['a1']) },
    );
    expect(picks.map((p) => p.offer_id)).toEqual(['a2', 'b1']);
    expect(coverage.uncovered).toEqual(['z']);
  });
});

describe('basket request parsing', () => {
  it('splits a «یکجا» request into items', () => {
    expect(splitBasketItems('گوشی A17، کاور A17، گلس، پاوربانک ۲۰ هزار، همه یکجا نزدیک فردوسی')).toEqual(['گوشی A17', 'کاور A17', 'گلس', 'پاوربانک ۲۰ هزار', 'نزدیک فردوسی']);
    expect(splitBasketItems('گوشی + کاور + گلس یکجا')).toEqual(['گوشی', 'کاور', 'گلس']);
    expect(splitBasketItems('هندزفری و شارژر')).toEqual(['هندزفری', 'شارژر']);
  });

  it('tells a basket from a single search', () => {
    expect(looksLikeBasket('گوشی + کاور + گلس یکجا')).toBe(true);
    expect(looksLikeBasket('گوشی A17، کاور A17، گلس، پاوربانک ۲۰ هزار، همه یکجا نزدیک فردوسی')).toBe(true);
    expect(looksLikeBasket('گوشی سامسونگ تا ۶۰ میلیون نزدیک من')).toBe(false);
    expect(looksLikeBasket('گوشی A17 زیر ۶۰ میلیون، محدوده سعادت آباد')).toBe(false);
  });
});

describe('model codes in basket lines', () => {
  it('finds A17 / S24 but not network names, in Persian digits too', () => {
    expect(modelCodeOf('گوشی A17')).toBe('a17');
    expect(modelCodeOf('کاور گلکسی s24 الترا')).toBe('s24');
    expect(modelCodeOf('گوشی 5G')).toBeNull();
    expect(modelCodeOf('پاوربانک ۲۰ هزار')).toBeNull();
  });
  it('matches the exact code only (A17 ≠ A07 ≠ A170)', () => {
    expect(hasCode('کاور سیلیکونی سامسونگ GALAXY A17', 'a17')).toBe(true);
    expect(hasCode('گوشی سامسونگ A07 4G', 'a17')).toBe(false);
    expect(hasCode('Galaxy A170', 'a17')).toBe(false);
  });
});
