'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Layers, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toFaDigits } from '@/lib/fa/digits';
import { SHOP_TYPES, shopTypeLabel, type ShopType } from '@/lib/data/shop-types';
import { useSession } from '@/components/app/session-context';
import { ShopDetailsSheet } from '@/components/cards/shop-details-sheet';
import { LazyMap } from './lazy-map';
import { SHOP_KIND_COLORS, SHOP_TYPE_ICONS, ShopTypeBadge } from './shop-type-icon';
import type { MapMarker, ShopPoint } from './map-view';

type NearShop = [string, number, number, string, 0 | 1, 0 | 1, ShopType, number];

const KIND_ORDER = { maybe: 0, offers: 1, none: 2 } as const;
// unknown/other go last in the chip row whatever their counts
const TYPE_RANK = new Map<string, number>(SHOP_TYPES.map((t) => [t.key, t.key === 'unknown' ? 2 : t.key === 'other' ? 1 : 0]));

/**
 * Map of the search area: radius, the user's pin, every shop in the radius (an icon per shop type,
 * coloured by whether it lists products / only matches the category, clustered where shops share a
 * building) and the current sellers as numbered pins. Type chips filter the shops; selecting any shop
 * opens its details (and highlights its card when it is in the list).
 */
export function ShopsMap({ className }: { className?: string }) {
  const { state, latestSellers, focusShop, setFocusShop } = useSession();
  const [shops, setShops] = useState<ShopPoint[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(true);
  const [typeFilter, setTypeFilter] = useState<ShopType | null>(null);
  const [group, setGroup] = useState<string[] | null>(null);
  // the legend is always shown on desktop; on a phone it opens from a small button
  const [legendOpen, setLegendOpen] = useState(false);
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
      .then((d: { shops: NearShop[]; malls: string[] }) => {
        setGroup(null);
        setShops(
          d.shops.map(([id, la, lo, name, offers, maybe, type, mall]) => ({
            id,
            lat: la,
            lon: lo,
            name,
            kind: maybe ? 'maybe' : offers ? 'offers' : 'none',
            type,
            mall: mall >= 0 ? d.malls[mall] : null,
          })),
        );
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [lat, lon, radius, productId]);

  const sellerIds = useMemo(() => new Set(latestSellers?.rows.map((r) => r.shop_id) ?? []), [latestSellers]);
  // shops shown before the type filter (sellers of the chosen product are numbered pins instead)
  const visible = useMemo(() => shops.filter((s) => !sellerIds.has(s.id) && (showAll || s.kind === 'maybe')), [shops, sellerIds, showAll]);
  const typeCounts = useMemo(() => {
    const counts = new Map<ShopType, number>();
    for (const s of visible) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
    return [...counts].sort((a, b) => TYPE_RANK.get(a[0])! - TYPE_RANK.get(b[0])! || b[1] - a[1]);
  }, [visible]);
  const activeType = typeFilter && typeCounts.some(([t]) => t === typeFilter) ? typeFilter : null;
  const points = useMemo(() => (activeType ? visible.filter((s) => s.type === activeType) : visible), [visible, activeType]);
  const byId = useMemo(() => new Map(shops.map((s) => [s.id, s])), [shops]);
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

  const pickType = (t: ShopType | null) => {
    setGroup(null);
    setTypeFilter((cur) => (cur === t ? null : t));
  };

  const groupShops = useMemo(
    () =>
      (group ?? [])
        .map((id) => byId.get(id))
        .filter((s): s is ShopPoint => !!s)
        .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'fa')),
    [group, byId],
  );
  const groupMall = groupShops.length && groupShops.every((s) => s.mall && s.mall === groupShops[0].mall) ? groupShops[0].mall : null;

  const row = latestSellers?.rows.find((r) => r.shop_id === selected);
  const counts = {
    sellers: latestSellers?.rows.length ?? 0,
    maybe: visible.filter((s) => s.kind === 'maybe').length,
  };

  if (!state) return null;
  return (
    <div className={cn('flex flex-col overflow-hidden', className)}>
      <div role="toolbar" aria-label="نوع فروشگاه" className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b bg-background px-2 py-1.5">
        <TypeChip active={!activeType} onClick={() => pickType(null)} label="همه" count={visible.length} />
        {typeCounts.map(([t, n]) => (
          <TypeChip key={t} type={t} active={activeType === t} onClick={() => pickType(t)} label={shopTypeLabel(t)} count={n} />
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        <LazyMap
          center={{ lat: state.location.lat, lon: state.location.lon }}
          radiusM={state.radius_m}
          markers={markers}
          onMarkerClick={select}
          shops={points}
          selectedShopId={selected}
          onShopClick={select}
          onClusterClick={setGroup}
          clusterType={activeType}
          className="size-full"
        />
        <button
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          className="absolute start-2 top-2 inline-flex h-9 items-center gap-1 rounded-full bg-background/90 px-2.5 text-[11px] font-medium shadow-sm backdrop-blur lg:hidden"
        >
          <Info className="size-3.5" />
          راهنما
          {counts.sellers > 0 && <span className="text-muted-foreground">({toFaDigits(counts.sellers)} فروشنده)</span>}
        </button>
        <ul
          aria-label="راهنمای نقشه"
          onClick={() => setLegendOpen(false)}
          className={cn(
            'absolute start-2 top-12 max-w-[70%] space-y-0.5 rounded-xl bg-background/90 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur lg:top-2 lg:block',
            !legendOpen && 'hidden',
          )}
        >
          {counts.sellers > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground">۱</span>
              {toFaDigits(counts.sellers)} فروشنده کالای انتخابی
            </li>
          )}
          <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
            <Swatch color={SHOP_KIND_COLORS.offers} label="کالا در ترب" />
            <Swatch color={SHOP_KIND_COLORS.none} label="بدون کالا" />
            {counts.maybe > 0 && <Swatch color={SHOP_KIND_COLORS.maybe} label={`${toFaDigits(counts.maybe)} فقط دسته فعالیت`} />}
          </li>
          <li className="text-muted-foreground">عدد روی نماد = چند فروشگاه کنار هم؛ بزنید تا باز شود</li>
        </ul>
        {groupShops.length > 0 ? (
          <section
            aria-label="فروشگاه‌های این نقطه"
            className="absolute inset-x-2 bottom-2 flex max-h-[70%] flex-col overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur"
          >
            <header className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
              <h3 className="text-xs font-bold">
                {toFaDigits(groupShops.length)} فروشگاه {groupMall ? `در ${groupMall}` : 'در این نقطه'}
              </h3>
              <button onClick={() => setGroup(null)} aria-label="بستن فهرست" className="tap -me-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </header>
            <ul className="divide-y overflow-y-auto">
              {groupShops.map((s) => (
                <li key={s.id}>
                  <button onClick={() => select(s.id)} className="flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-start hover:bg-muted/60">
                    <ShopTypeBadge type={s.type} kind={s.kind} className="size-6 ring-0" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-xs font-medium">{s.name}</span>
                      <span className="line-clamp-1 text-[11px] text-muted-foreground">
                        {shopTypeLabel(s.type)}
                        {s.kind === 'maybe' ? ' · فقط دسته فعالیت' : s.kind === 'offers' ? ' · کالا در ترب' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <button
            onClick={() => setShowAll((v) => !v)}
            aria-pressed={showAll}
            className="absolute end-2 bottom-2 inline-flex h-11 items-center gap-1 rounded-xl bg-background/90 px-3 text-xs font-medium shadow-sm backdrop-blur hover:bg-background"
          >
            <Layers className="size-4" />
            {showAll ? 'فقط مرتبط‌ها' : 'همه فروشگاه‌ها'}
          </button>
        )}
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

function TypeChip({ type, label, count, active, onClick }: { type?: ShopType; label: string; count: number; active: boolean; onClick: () => void }) {
  const Icon = type ? SHOP_TYPE_ICONS[type] : null;
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
      )}
    >
      {Icon && <Icon className={cn('size-4', !active && 'text-muted-foreground')} />}
      {label}
      <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{toFaDigits(count)}</span>
    </button>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
