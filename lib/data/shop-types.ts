/** Shop types shown on the map (icon + filter chip). Order = tie-break priority and chip order. */
export const SHOP_TYPES = [
  { key: 'mobile', label: 'موبایل و لوازم جانبی' },
  { key: 'computer', label: 'کامپیوتر و شبکه' },
  { key: 'av', label: 'صوتی، تصویری و عکاسی' },
  { key: 'security', label: 'دوربین مداربسته و امنیتی' },
  { key: 'electronics', label: 'قطعات الکترونیکی' },
  { key: 'lighting', label: 'برق و روشنایی' },
  { key: 'tools', label: 'ابزار، صنعتی و ساختمانی' },
  { key: 'appliance', label: 'لوازم خانگی' },
  { key: 'home', label: 'خانه، آشپزخانه و دکور' },
  { key: 'apparel', label: 'پوشاک، کیف و کفش' },
  { key: 'beauty', label: 'آرایشی و بهداشتی' },
  { key: 'health', label: 'پزشکی و سلامت' },
  { key: 'jewelry', label: 'ساعت، عینک و زیورآلات' },
  { key: 'auto', label: 'خودرو و موتور' },
  { key: 'kids', label: 'کودک و اسباب‌بازی' },
  { key: 'sport', label: 'ورزش و سفر' },
  { key: 'books', label: 'کتاب و لوازم‌التحریر' },
  { key: 'food', label: 'خوراکی' },
  { key: 'other', label: 'سایر فروشگاه‌ها' },
  /** no activity category and no listed product in the dataset — shown as unknown, never guessed */
  { key: 'unknown', label: 'فعالیت ثبت نشده' },
] as const;

export type ShopType = (typeof SHOP_TYPES)[number]['key'];

const LABELS = new Map<string, string>(SHOP_TYPES.map((t) => [t.key, t.label]));

export function shopTypeLabel(type: string | null | undefined): string {
  return LABELS.get(type ?? '') ?? LABELS.get('other')!;
}

export function isShopType(v: unknown): v is ShopType {
  return typeof v === 'string' && LABELS.has(v);
}
