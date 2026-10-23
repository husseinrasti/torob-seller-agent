import { describe, expect, it } from 'vitest';
import { compareFloors, floorSections, floorTabLabel, groupFloors, rankFloorShops, type FloorShop } from './mall-floors';

const shop = (o: Partial<FloorShop> & { shop_id: string }): FloorShop => ({ name: o.shop_id, unit_label: null, floor_num: 0, offer_price: null, has_offer: false, same_category: false, ...o });

describe('mall floors (F2)', () => {
  it('orders floors منفی ۲ → منفی ۱ → همکف → ۱ → ۲, unknown last', () => {
    expect([2, null, 0, -1, 1, -2].sort(compareFloors)).toEqual([-2, -1, 0, 1, 2, null]);
    expect([-1, 0, 1, null].map(floorTabLabel)).toEqual(['منفی ۱', 'همکف', '۱', 'نامشخص']);
  });

  it('puts sellers first (cheapest first), then same-category neighbours, then the rest', () => {
    const ranked = rankFloorShops([
      shop({ shop_id: 'other', unit_label: '1' }),
      shop({ shop_id: 'n', same_category: true }),
      shop({ shop_id: 's2', has_offer: true, offer_price: 61_500_000 }),
      shop({ shop_id: 's1', has_offer: true, offer_price: 59_900_000 }),
    ]);
    expect(ranked.map((s) => s.shop_id)).toEqual(['s1', 's2', 'n', 'other']);
  });

  it('sorts units numerically inside a tier', () => {
    expect(rankFloorShops([shop({ shop_id: 'a', unit_label: '12' }), shop({ shop_id: 'b', unit_label: '3' })]).map((s) => s.shop_id)).toEqual(['b', 'a']);
  });

  it('groups by floor in floor order', () => {
    const g = groupFloors([shop({ shop_id: 'x', floor_num: 2 }), shop({ shop_id: 'y', floor_num: -1 }), shop({ shop_id: 'z', floor_num: null }), shop({ shop_id: 'w', floor_num: 0 })]);
    expect(g.map((f) => f.floor_num)).toEqual([-1, 0, 2, null]);
  });

  it('mission rows: in-mall rows by floor (score order kept), the rest «بیرون از پاساژ»', () => {
    const r = (id: string, key: string | null, floor: number | null) => ({ id, mall: key ? { key, floor_num: floor } : null });
    const s = floorSections([r('a', 'm', 5), r('b', null, null), r('c', 'm', 0), r('d', 'm', 5), r('e', 'other', 1)], 'm');
    expect(s.map((x) => [x.title, x.rows.map((y) => y.id).join('')])).toEqual([
      ['همکف', 'c'],
      ['طبقه ۵', 'ad'],
      ['بیرون از پاساژ', 'be'],
    ]);
  });
});
