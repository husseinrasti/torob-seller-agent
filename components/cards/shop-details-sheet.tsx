'use client';

import { useEffect, useState } from 'react';
import { Clock, CreditCard, ExternalLink, Map, Truck } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { faText, formatToman } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { ShopDetails } from '@/lib/search/sellers';
import type { Breakdown } from '@/lib/search/score';
import { useSession } from '@/components/app/session-context';
import { FreshnessBadge, MallChip, OpenDot } from './badges';

const FACTORS: Array<[keyof Breakdown, string]> = [
  ['price', 'قیمت'],
  ['distance', 'فاصله'],
  ['freshness', 'تازگی قیمت'],
  ['open', 'باز بودن'],
  ['conditions', 'شرایط خرید'],
];

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
  const { state } = useSession();
  const [data, setData] = useState<ShopDetails | null>(null);
  const [error, setError] = useState(false);

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
      <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-[520px] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{data?.shop_name ?? 'جزئیات فروشگاه'}</SheetTitle>
          <SheetDescription>نشانی دقیق، ساعت کاری امروز و شرایط خرید</SheetDescription>
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
              <section className="flex items-start gap-2">
                <Clock className="mt-0.5 size-4 text-muted-foreground" />
                <div className="space-y-1">
                  <OpenDot open={data.open} />
                  <p className="text-xs text-muted-foreground">{data.today_hours}</p>
                </div>
              </section>
              <section className="flex items-start gap-2">
                <CreditCard className="mt-0.5 size-4 text-muted-foreground" />
                {data.payment.length ? (
                  <ul className="space-y-0.5">
                    {data.payment.map((p) => (
                      <li key={p.provider + p.channel_label}>
                        {p.provider} <span className="text-xs text-muted-foreground">— {p.channel_label}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">روش پرداخت اعتباری/قسطی اعلام نشده</span>
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
                  <h5 className="mb-1.5 text-xs font-semibold">کالاهای دیگر همین دسته در این فروشگاه</h5>
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
              {(data.website_url || data.instagram) && (
                <a href={data.website_url ?? `https://instagram.com/${data.instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">
                  <ExternalLink className="size-3.5" />
                  {data.website_url ? 'وب‌سایت فروشگاه' : 'اینستاگرام فروشگاه'}
                </a>
              )}
              <p className="text-[11px] leading-5 text-muted-foreground">شماره‌های تماس این مجموعه‌داده آزمایشی‌اند؛ پیگیری از داخل همراه خرید و به‌صورت شبیه‌سازی‌شده انجام می‌شود.</p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
