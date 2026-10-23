import {
  Baby,
  BookOpen,
  Car,
  Cctv,
  Cpu,
  Dumbbell,
  Gem,
  Laptop,
  Lightbulb,
  Package,
  Refrigerator,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  Stethoscope,
  Store,
  Tv,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShopType } from '@/lib/data/shop-types';

export const SHOP_TYPE_ICONS: Record<ShopType, LucideIcon> = {
  mobile: Smartphone,
  computer: Laptop,
  av: Tv,
  security: Cctv,
  electronics: Cpu,
  lighting: Lightbulb,
  tools: Wrench,
  appliance: Refrigerator,
  home: Sofa,
  apparel: Shirt,
  beauty: Sparkles,
  health: Stethoscope,
  jewelry: Gem,
  auto: Car,
  kids: Baby,
  sport: Dumbbell,
  books: BookOpen,
  food: ShoppingBasket,
  other: Package,
  unknown: Store,
};

/** Map colours: lists products in Torob · only the activity category matches the chosen product · no listings. */
export const SHOP_KIND_COLORS = { offers: '#0f766e', maybe: '#d97706', none: '#64748b' } as const;
export type ShopKind = keyof typeof SHOP_KIND_COLORS;

/** The same round badge the map draws, for lists and the legend. */
export function ShopTypeBadge({ type, kind = 'offers', className }: { type: ShopType; kind?: ShopKind; className?: string }) {
  const Icon = SHOP_TYPE_ICONS[type] ?? Store;
  return (
    <span
      aria-hidden
      className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white dark:ring-background', className)}
      style={{ background: SHOP_KIND_COLORS[kind] }}
    >
      <Icon className="size-[55%]" strokeWidth={2.4} />
    </span>
  );
}
