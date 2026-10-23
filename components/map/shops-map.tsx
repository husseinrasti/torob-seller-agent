'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toFaDigits } from '@/lib/fa/digits';
import { useSession } from '@/components/app/session-context';
import { ShopDetailsSheet } from '@/components/cards/shop-details-sheet';
import { LazyMap } from './lazy-map';
import type { MapMarker, ShopPoint } from './map-view';

type NearShop = [string, number, number, string, 0 | 1, 0 | 1];

/**
 * Map of the search area: radius, the user's pin, every shop in the radius (clickable dots, coloured by
 * whether it lists products / only matches the category) and the current sellers as numbered pins.
 * Selecting any shop opens its details (and highlights its card when it is in the list).
 */
export function ShopsMap({ className }: { className?: string }) {
  const { state, latestSellers, focusShop, setFocusShop } = useSession();
  const [shops, setShops] = useState<ShopPoint[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(true);
  const productId = latestSellers?.product?.product_id ?? state?.chosenProduct ?? null;
  const lat = state?.location.lat;
  const lon = state?.location.lon;
  const radius = state?.radius_m;

  useEffect(() => {
    if (lat === undefined || lon === undefined || !radius) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), radius_m: String(Math.min(radius, 5000)) });
    if (productId) qs.set('product_id', productId);
    fetch(`/api/shops/near?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { shops: NearShop[] }) =>
        setShops(d.shops.map(([id, la, lo, name, offers, maybe]) => ({ id, lat: la, lon: lo, name, kind: maybe ? 'maybe' : offers ? 'offers' : 'none' }))),
      )
      .catch(() => {});
    return () => ctrl.abort();
  }, [lat, lon, radius, productId]);

  const sellerIds = useMemo(() => new Set(latestSellers?.rows.map((r) => r.shop_id) ?? []), [latestSellers]);
  const points = useMemo(() => shops.filter((s) => !sellerIds.has(s.id) && (showAll || s.kind === 'maybe')), [shops, sellerIds, showAll]);
  const markers = useMemo<MapMarker[]>(
    () =>
      // reversed so the best-ranked pin is drawn on top
      (latestSellers?.rows ?? [])
        .map((r, i) => ({ id: r.shop_id, lat: r.lat, lon: r.lon, label: String(i + 1), kind: 'seller' as const, active: r.shop_id === (selected ?? focusShop) }))
        .reverse(),
    [latestSellers, selected, focusShop],
  );

  const select = useCallback(
    (id: string) => {
      setSelected(id);
      setFocusShop(id);
      document.getElementById(`shop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [setFocusShop],
  );

  const row = latestSellers?.rows.find((r) => r.shop_id === selected);
  const counts = {
    sellers: latestSellers?.rows.length ?? 0,
    maybe: shops.filter((s) => s.kind === 'maybe').length,
    all: shops.length,
  };

  if (!state) return null;
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <LazyMap
        center={{ lat: state.location.lat, lon: state.location.lon }}
        radiusM={state.radius_m}
        markers={markers}
        onMarkerClick={select}
        shops={points}
        selectedShopId={selected}
        onShopClick={select}
        className="size-full"
      />
      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
        <ul className="pointer-events-auto space-y-0.5 rounded-xl bg-background/90 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur">
          {counts.sellers > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground">۱</span>
              {toFaDigits(counts.sellers)} فروشنده کالای انتخابی
            </li>
          )}
          {counts.maybe > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-amber-600" />
              {toFaDigits(counts.maybe)} فقط دسته فعالیت
            </li>
          )}
          {showAll && (
            <li className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-full bg-teal-700/80" />
              <span className="size-2.5 rounded-full bg-slate-400/70" />
              {toFaDigits(counts.all)} فروشگاه در محدوده (لمس برای جزئیات)
            </li>
          )}
        </ul>
        <button
          onClick={() => setShowAll((v) => !v)}
          aria-pressed={showAll}
          className="pointer-events-auto inline-flex h-11 items-center gap-1 rounded-xl bg-background/90 px-3 text-xs font-medium shadow-sm backdrop-blur hover:bg-background"
        >
          <Layers className="size-4" />
          {showAll ? 'فقط مرتبط‌ها' : 'همه فروشگاه‌ها'}
        </button>
      </div>
      {selected && (
        <ShopDetailsSheet
          open
          onOpenChange={(v) => !v && setSelected(null)}
          shopId={selected}
          productId={productId ?? undefined}
          score={row?.score_breakdown}
        />
      )}
    </div>
  );
}
