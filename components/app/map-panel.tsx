'use client';

import { useCallback, useMemo } from 'react';
import { LazyMap } from '@/components/map/lazy-map';
import type { MapMarker } from '@/components/map/map-view';
import { toFaDigits } from '@/lib/fa/digits';
import { useSession } from './session-context';

/** Toggleable map of the latest seller list: user pin, radius circle, numbered sellers; tap → scroll to card. */
export function MapPanel() {
  const { state, latestSellers, setFocusShop, focusShop } = useSession();
  const markers = useMemo<MapMarker[]>(() => {
    if (!latestSellers) return [];
    return [
      ...latestSellers.maybe_shops.map((m) => ({ id: m.shop_id, lat: m.lat, lon: m.lon, label: m.shop_name, kind: 'maybe' as const })),
      // reversed so the best-ranked marker is drawn on top
      ...latestSellers.rows.map((r, i) => ({ id: r.shop_id, lat: r.lat, lon: r.lon, label: String(i + 1), kind: 'seller' as const, active: r.shop_id === focusShop })).reverse(),
    ];
  }, [latestSellers, focusShop]);

  const onMarker = useCallback(
    (id: string) => {
      setFocusShop(id);
      document.getElementById(`shop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [setFocusShop],
  );

  if (!state) return null;
  return (
    <div className="border-b bg-background px-4 pb-3">
      <LazyMap
        center={{ lat: state.location.lat, lon: state.location.lon }}
        radiusM={state.radius_m}
        markers={markers}
        onMarkerClick={onMarker}
        className="h-60 w-full overflow-hidden rounded-2xl border"
      />
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {latestSellers
          ? `${toFaDigits(latestSellers.count)} فروشنده روی نقشه · دایره‌های خاکستری: فقط دسته فعالیت`
          : 'بعد از پیدا کردن فروشنده‌ها، مکانشان اینجا نشان داده می‌شود.'}
      </p>
    </div>
  );
}
