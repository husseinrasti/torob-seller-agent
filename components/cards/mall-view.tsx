'use client';

import { useState } from 'react';
import { Building2, ChevronDown, Clock3, MapPinned, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { faText, formatDistance } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { MallShop, MallViewOutput } from '@/lib/search/mall-view';
import { useChatActions } from '@/components/app/chat-actions';
import { useSession } from '@/components/app/session-context';
import { useFollowups } from '@/components/app/followups-store';
import { ShopTypeBadge } from '@/components/map/shop-type-icon';
import { AvailabilityBadge, FreshnessBadge, PriceLine } from './badges';
import { ShopDetailsSheet } from './shop-details-sheet';

/** F2 «الان توی پاساژم»: floor tabs; sellers of the product first, then same-category neighbours, the rest collapsed. */
export function MallViewCard({ output }: { output: MallViewOutput }) {
  const { sendAction, busy } = useChatActions();
  const floors = output.mall.floors;
  const [tab, setTab] = useState(() => Math.max(0, floors.findIndex((f) => f.sellers > 0)));
  const [others, setOthers] = useState(false);
  const [shop, setShop] = useState<string | null>(null);
  const floor = floors[tab] ?? floors[0];
  const focused = Boolean(output.product || output.category);
  const top = floor.shops.filter((s) => s.has_offer || s.same_category || !focused);
  const rest = focused ? floor.shops.filter((s) => !s.has_offer && !s.same_category) : [];
  const offerIds = floor.shops.flatMap((s) => (s.offer?.price ? [s.offer.offer_id] : [])).slice(0, 5);

  return (
    <section data-mall-view className="space-y-2.5 rounded-2xl border bg-card p-3">
      <header>
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Building2 className="size-4 text-primary" />
          نمای داخل {output.mall.name}
        </h3>
        <p className="text-[11px] leading-5 text-muted-foreground">
          {toFaDigits(output.mall.shop_count)} مغازه · {toFaDigits(floors.length)} طبقه
          {output.product && (
            <>
              {' · '}
              <span data-mall-sellers={output.sellers}>
                {toFaDigits(output.sellers)} فروشنده‌ی {faText(output.product.title)}
              </span>
            </>
          )}
        </p>
      </header>

      <div role="tablist" aria-label="طبقه" className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
        {floors.map((f, i) => (
          <button
            key={f.floor_num ?? 'none'}
            role="tab"
            aria-selected={i === tab}
            data-floor-tab={f.floor_num ?? ''}
            onClick={() => {
              setTab(i);
              setOthers(false);
            }}
            className={cn(
              'relative inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs',
              i === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            {f.tab}
            {f.sellers > 0 && <span className={cn('rounded-full px-1.5 text-[10px] font-semibold', i === tab ? 'bg-primary-foreground/20' : 'bg-primary/15 text-primary')}>{toFaDigits(f.sellers)}</span>}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {floor.title} · {toFaDigits(floor.shops.length)} مغازه
        {focused && ` · ${toFaDigits(floor.sellers)} فروشنده · ${toFaDigits(floor.neighbours)} همسایه‌ی هم‌دسته`}
      </p>

      <ul className="divide-y rounded-xl border" data-floor-list>
        {top.map((s) => (
          <MallShopRow key={s.shop_id} s={s} onOpen={() => setShop(s.shop_id)} />
        ))}
        {!top.length && <li className="p-3 text-xs text-muted-foreground">در این طبقه فروشنده یا مغازه‌ی هم‌دسته‌ای ثبت نشده.</li>}
      </ul>

      {rest.length > 0 && (
        <div className="rounded-xl border border-dashed">
          <button onClick={() => setOthers((v) => !v)} aria-expanded={others} className="flex h-10 w-full items-center justify-between px-3 text-xs">
            <span>{toFaDigits(rest.length)} مغازه‌ی دیگر در این طبقه</span>
            <ChevronDown className={cn('size-4 text-muted-foreground transition', others && 'rotate-180')} />
          </button>
          {others && (
            <ul className="max-h-72 divide-y overflow-y-auto border-t">
              {rest.map((s) => (
                <li key={s.shop_id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <ShopTypeBadge type={s.type} kind="none" className="size-6" />
                  <span className="line-clamp-1 flex-1">{s.name}</span>
                  {s.unit_label && <span className="text-[11px] text-muted-foreground">{s.unit_kind ?? 'واحد'} {s.unit_label}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {offerIds.length > 0 && (
        <Button
          size="sm"
          className="h-11 w-full"
          disabled={busy}
          data-floor-followup
          onClick={() => sendAction(`موجودی فروشنده‌های ${floor.title} ${output.mall.name} را پیگیری کن`, 'contact_seller', { offer_ids: offerIds, channel: 'message' })}
        >
          <Phone className="size-4" />
          پیگیری همه‌ی این طبقه ({toFaDigits(offerIds.length)})
        </Button>
      )}

      <p data-mall-hours className="flex items-start gap-1.5 text-xs leading-6">
        <Clock3 className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
        {output.hours_summary}
      </p>

      {output.nearby_malls.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">پاساژهای نزدیک</p>
          <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
            {output.nearby_malls.map((m) => (
              <button
                key={m.mall_key}
                disabled={busy}
                data-nearby-mall
                onClick={() => sendAction(`نمای داخل ${m.name}`, 'mall_view', { mall_key: m.mall_key, ...(output.product ? { product_id: output.product.product_id } : {}) })}
                className="tap inline-flex h-8 shrink-0 items-center gap-1 rounded-full border bg-background px-3 text-xs hover:bg-muted disabled:opacity-60"
              >
                <MapPinned className="size-3.5" />
                {m.name} · {formatDistance(m.distance_m)}
                {output.product && m.seller_count > 0 && <span className="text-primary">({toFaDigits(m.seller_count)} فروشنده)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {shop && <ShopDetailsSheet open={Boolean(shop)} onOpenChange={(v) => !v && setShop(null)} shopId={shop} productId={output.product?.product_id} />}
    </section>
  );
}

function MallShopRow({ s, onOpen }: { s: MallShop; onOpen: () => void }) {
  const { state } = useSession();
  const { availabilityFor } = useFollowups();
  return (
    <li className="space-y-1.5 p-2.5" data-mall-shop={s.has_offer ? 'seller' : s.same_category ? 'neighbour' : 'other'}>
      <button onClick={onOpen} className="flex w-full items-center gap-2 text-start">
        <ShopTypeBadge type={s.type} kind={s.has_offer ? 'offers' : s.same_category ? 'maybe' : 'none'} className="size-7" />
        <span className="line-clamp-1 flex-1 text-sm font-medium">{s.name}</span>
        {s.unit_label && <span className="shrink-0 text-[11px] text-muted-foreground">{s.unit_kind ?? 'واحد'} {s.unit_label}</span>}
      </button>
      {s.offer ? (
        <dl className="grid grid-cols-3 gap-1.5 text-[11px]">
          <div className="rounded-lg bg-muted/60 p-1.5">
            <dt className="text-muted-foreground">قیمت ثبت‌شده</dt>
            <dd>
              <PriceLine price={s.offer.price} flag={s.offer.price_flag} className="text-xs" />
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 p-1.5">
            <dt className="text-muted-foreground">آخرین تغییر قیمت</dt>
            <dd>
              <FreshnessBadge freshness={s.offer.freshness} days={s.offer.price_age_days} />
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 p-1.5">
            <dt className="text-muted-foreground">موجودی</dt>
            <dd>
              <AvailabilityBadge a={availabilityFor(s.offer.offer_id, state?.followups[s.offer.offer_id] ?? s.offer.followup_status ?? undefined)} />
            </dd>
          </div>
        </dl>
      ) : s.same_category ? (
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span data-neighbour className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
            همسایه جایگزین
          </span>
          این کالا را ثبت نکرده، ولی در همین دسته می‌فروشد؛ قیمت و موجودی اعلام نشده.
        </p>
      ) : null}
    </li>
  );
}
