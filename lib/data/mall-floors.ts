import { toFaDigits } from '../fa/digits';

/** Floor order inside a mall: منفی ۲ → منفی ۱ → همکف → ۱ → ۲ …; unknown floors last. */
export function compareFloors(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/** Tab label: «منفی ۱»، «همکف»، «۲»، «نامشخص». */
export function floorTabLabel(n: number | null): string {
  if (n === null) return 'نامشخص';
  if (n === 0) return 'همکف';
  return n < 0 ? `منفی ${toFaDigits(-n)}` : toFaDigits(n);
}

export type FloorShop = { shop_id: string; name: string; unit_label: string | null; floor_num: number | null; offer_price: number | null; has_offer: boolean; same_category: boolean };

/** Within a floor: sellers of the product (cheapest first), then same-category neighbours, then the rest. */
export function rankFloorShops<T extends FloorShop>(shops: T[]): T[] {
  const tier = (s: T) => (s.has_offer ? 0 : s.same_category ? 1 : 2);
  return [...shops].sort((a, b) => tier(a) - tier(b) || (a.offer_price ?? Infinity) - (b.offer_price ?? Infinity) || (a.unit_label ?? '').localeCompare(b.unit_label ?? '', 'fa', { numeric: true }) || a.name.localeCompare(b.name, 'fa'));
}

export function groupFloors<T extends FloorShop>(shops: T[]): Array<{ floor_num: number | null; shops: T[] }> {
  const by = new Map<number | null, T[]>();
  for (const s of shops) by.set(s.floor_num, [...(by.get(s.floor_num) ?? []), s]);
  return [...by.entries()].sort((a, b) => compareFloors(a[0], b[0])).map(([floor_num, list]) => ({ floor_num, shops: rankFloorShops(list) }));
}

/** Mission rows in in-mall mode: rows in that mall by floor (score order kept inside a floor), the rest after. */
export function floorSections<T extends { mall: { key: string | null; floor_num: number | null } | null }>(rows: T[], mallKey: string): Array<{ key: string; title: string; rows: T[] }> {
  const inMall = new Map<number | null, T[]>();
  const outside: T[] = [];
  for (const r of rows) {
    if (r.mall?.key === mallKey) inMall.set(r.mall.floor_num, [...(inMall.get(r.mall.floor_num) ?? []), r]);
    else outside.push(r);
  }
  const sections = [...inMall.entries()]
    .sort((a, b) => compareFloors(a[0], b[0]))
    .map(([n, list]) => ({ key: `f${n ?? 'x'}`, title: n === null ? 'طبقه ثبت نشده' : n === 0 ? 'همکف' : `طبقه ${floorTabLabel(n)}`, rows: list }));
  if (outside.length) sections.push({ key: 'out', title: 'بیرون از پاساژ', rows: outside });
  return sections;
}
