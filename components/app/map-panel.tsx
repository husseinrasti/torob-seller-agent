'use client';

import { ShopsMap } from '@/components/map/shops-map';
import { faText } from '@/lib/fa/format';
import { useSession } from './session-context';

/** Phone/tablet: map toggled under the ContextBar. Desktop shows the same map in its own column. */
export function MapPanel() {
  const { state } = useSession();
  if (!state) return null;
  return (
    <div className="border-b bg-background px-4 pb-3">
      <ShopsMap className="h-72 w-full rounded-2xl border" />
    </div>
  );
}

/** Desktop map column. */
export function MapColumn() {
  const { latestSellers } = useSession();
  const title = faText(latestSellers?.product?.title.split('|')[0].trim());
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-bold">نقشه فروشگاه‌ها</h2>
        <p className="line-clamp-1 text-xs text-muted-foreground">{title ? `فروشنده‌های «${title}» و بقیه فروشگاه‌های محدوده` : 'همه فروشگاه‌های محدوده — روی هر نقطه بزنید'}</p>
      </div>
      <ShopsMap className="min-h-0 flex-1" />
    </div>
  );
}
