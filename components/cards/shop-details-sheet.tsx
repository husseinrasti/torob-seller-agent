'use client';

import { useContext, useEffect, useState } from 'react';
import { Clock, CreditCard, ListPlus, Map, Phone, ShoppingBag, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/lib/client';
import { ChatActionsContext } from '@/components/app/chat-actions';
import { useFollowups } from '@/components/app/followups-store';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { faText, formatToman } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { ShopDetails } from '@/lib/search/sellers';
import { FACTOR_LABEL, type Breakdown, type Weights } from '@/lib/search/score';
import { useSession } from '@/components/app/session-context';
import { AvailabilityBadge, FreshnessBadge, MallChip, OpenDot, PriceLine } from './badges';
import { ShopTypeBadge } from '@/components/map/shop-type-icon';
import { ShopFacts, TrustDots, TrustLinks } from './trust';
import { shopTypeLabel } from '@/lib/data/shop-types';

const FACTORS = Object.entries(FACTOR_LABEL) as Array<[keyof Weights, string]>;

export function ShopDetailsSheet({
  open,
  onOpenChange,
  shopId,
  productId,
  score,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shopId: string;
  productId?: string;
  score?: Breakdown;
}) {
  const { state, patch } = useSession();
  const chat = useContext(ChatActionsContext);
  const { availabilityFor } = useFollowups();
  const desktop = useIsDesktop();
  const [data, setData] = useState<ShopDetails | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null);
    setError(false);
  }, [shopId, productId]);

  useEffect(() => {
    if (!open || data) return;
    const qs = new URLSearchParams({ id: shopId });
    if (productId) qs.set('product_id', productId);
    if (state?.demoTime) qs.set('demo_time', state.demoTime);
    fetch(`/api/shop?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true));
  }, [open, data, shopId, productId, state?.demoTime]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? 'left' : 'bottom'}
        className={desktop ? 'w-[26rem] max-w-[90vw] overflow-y-auto sm:max-w-[26rem]' : 'mx-auto max-h-[85dvh] max-w-[520px] overflow-y-auto rounded-t-3xl'}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {data && <ShopTypeBadge type={data.shop_type} />}
            {data?.shop_name ?? 'جزئیات فروشگاه'}
          </SheetTitle>
          <SheetDescription>{data ? `${shopTypeLabel(data.shop_type)} · نشانی، ساعت کاری امروز و شرایط خرید` : 'نشانی دقیق، ساعت کاری امروز و شرایط خرید'}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-sm">
          {error && <p className="text-destructive">دریافت جزئیات ناموفق بود.</p>}
          {!data && !error && (
            <div className="space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {data && (
            <>
              <section className="space-y-1.5">
                <MallChip mall={data.mall} />
                <p className="leading-6 text-muted-foreground">{data.address ? toFaDigits(data.address) : 'نشانی ثبت نشده'}</p>
              </section>
              {data.product_offer ? (
                <section className="space-y-2 rounded-2xl border border-primary/30 bg-accent/40 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <ShoppingBag className="size-4" />
                    کالای انتخابی شما را ثبت کرده است
                  </p>
                  <p className="line-clamp-2 text-xs">{faText(data.product_offer.title)}</p>
                  <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">قیمت ثبت‌شده</dt>
                    <dd>
                      <PriceLine price={data.product_offer.price} flag={data.product_offer.price_flag} />
                    </dd>
                    <dt className="text-muted-foreground">آخرین تغییر قیمت</dt>
                    <dd>
                      <FreshnessBadge freshness={data.product_offer.freshness} days={data.product_offer.price_age_days} />
                    </dd>
                    <dt className="text-muted-foreground">موجودی</dt>
                    <dd>
                      <AvailabilityBadge a={availabilityFor(data.product_offer.offer_id, state?.followups[data.product_offer.offer_id])} />
                    </dd>
                  </dl>
                  {chat && state && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-11"
                        disabled={chat.busy}
                        onClick={() => {
                          chat.sendAction(`موجودی «${data.shop_name}» را پیگیری کن`, 'contact_seller', { offer_ids: [data.product_offer!.offer_id], channel: 'message' });
                          onOpenChange(false);
                        }}
                      >
                        <Phone className="size-4" />
                        پیگیری
                      </Button>
                      <Button
                        size="sm"
                        variant={state.shortlist.includes(data.product_offer.offer_id) ? 'secondary' : 'outline'}
                        className="h-11"
                        onClick={() => {
                          const id = data.product_offer!.offer_id;
                          patch({ shortlist: state.shortlist.includes(id) ? state.shortlist.filter((o) => o !== id) : [...state.shortlist, id] });
                        }}
                      >
                        <ListPlus className="size-4" />
                        {state.shortlist.includes(data.product_offer.offer_id) ? 'در برنامه' : 'به برنامه'}
                      </Button>
                    </div>
                  )}
                </section>
              ) : productId ? (
                <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">این فروشگاه کالای انتخابی شما را ثبت نکرده است؛ قیمت و موجودی آن مشخص نیست.</p>
              ) : null}
              <section className="flex items-start gap-2">
                <Clock className="mt-0.5 size-4 text-muted-foreground" />
                <div className="space-y-1">
                  <OpenDot open={data.open} />
                  <p className="text-xs text-muted-foreground">{data.today_hours}</p>
                </div>
              </section>
              <section data-shop-trust className="space-y-1.5 rounded-xl border p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <TrustDots trust={data.trust} />
                  <TrustLinks trust={data.trust} />
                </div>
                <ShopFacts hoursKnown={data.hours_known} payment={data.payment_options} sameCategory={data.same_category_count} />
                {!data.payment_options.length && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CreditCard className="size-3" />
                    روش پرداخت اعتباری/قسطی اعلام نشده
                  </p>
                )}
              </section>
              <section className="flex items-center gap-2">
                <Truck className="size-4 text-muted-foreground" />
                <span>{data.fast_delivery === true ? 'ارسال فوری دارد' : data.fast_delivery === false ? 'ارسال فوری ندارد' : 'ارسال فوری: اعلام نشده'}</span>
              </section>
              {score && (
                <section>
                  <h5 className="mb-1.5 text-xs font-semibold">چرا این رتبه؟ (سهم هر معیار در امتیاز)</h5>
                  <div className="space-y-1">
                    {FACTORS.map(([k, label]) => (
                      <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-muted-foreground">{label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Number(score[k]) * 100)}%` }} />
                        </div>
                        <span className="w-9 text-start tabular-nums">{toFaDigits(Math.round(Number(score[k]) * 100))}٪</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {data.other_offers.length > 0 && (
                <section>
                  <h5 className="mb-1.5 text-xs font-semibold">کالاهای این فروشگاه</h5>
                  <ul className="divide-y rounded-xl border">
                    {data.other_offers.map((o) => (
                      <li key={o.offer_id} className="space-y-1 p-2">
                        <p className="line-clamp-1 text-xs">{faText(o.title)}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold">{formatToman(o.price)}</span>
                          <FreshnessBadge freshness={o.freshness} days={o.price_age_days} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['نشان', data.nav_links.neshan],
                    ['گوگل‌مپ', data.nav_links.google],
                    ['OSM', data.nav_links.osm],
                  ] as const
                ).map(([label, href]) => (
                  <a key={label} href={href} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1 rounded-xl border text-xs font-medium hover:bg-muted">
                    <Map className="size-4" />
                    {label}
                  </a>
                ))}
              </section>
              <p className="text-[11px] leading-5 text-muted-foreground">شماره‌های تماس این مجموعه‌داده آزمایشی‌اند؛ پیگیری از داخل همراه خرید و به‌صورت شبیه‌سازی‌شده انجام می‌شود.</p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
