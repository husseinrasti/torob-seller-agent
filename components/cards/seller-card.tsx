'use client';

import { useState } from 'react';
import { Handshake, Info, ListPlus, ListChecks, MessageCircle, MessageSquareText, MoreHorizontal, Navigation, Phone, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistance } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { SellerRow } from '@/lib/search/sellers';
import { useChatActions } from '@/components/app/chat-actions';
import { useSession } from '@/components/app/session-context';
import { AvailabilityBadge, FreshnessBadge, MallChip, OpenDot, PriceLine, type Availability } from './badges';
import { ShopDetailsSheet } from './shop-details-sheet';
import { TrustDots } from './trust';
import { SellerMessageSheet } from './seller-message';

export function SellerCard({ row, rank, availability, productTitle }: { row: SellerRow; rank: number; availability: Availability; productTitle?: string }) {
  const { sendAction, busy } = useChatActions();
  const { state, patch, focusShop } = useSession();
  const [askChannel, setAskChannel] = useState(false);
  const [details, setDetails] = useState(false);
  const [myMessage, setMyMessage] = useState(false);
  const [more, setMore] = useState(false);
  const inPlan = state?.shortlist.includes(row.offer_id) ?? false;
  const followupBusy = availability.status === 'pending' || availability.status === 'contacting';

  const follow = (channel: 'message' | 'call') => {
    setAskChannel(false);
    sendAction(
      `${channel === 'call' ? 'با' : 'به'} «${row.shop_name}» ${channel === 'call' ? 'تماس بگیر' : 'پیام بده'} و موجودی${productTitle ? ` «${productTitle}»` : ''} را بپرس`,
      'contact_seller',
      { offer_ids: [row.offer_id], channel },
    );
  };

  return (
    <article
      id={`shop-${row.shop_id}`}
      className={cn('scroll-mt-4 rounded-2xl border border-border/60 bg-card p-3.5 transition', focusShop === row.shop_id && 'ring-2 ring-primary')}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{toFaDigits(rank)}</span>
          <h4 className="truncate text-sm font-semibold">{row.shop_name}</h4>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Navigation className="size-3" />
          {formatDistance(row.distance_m)}
        </span>
      </header>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <OpenDot open={row.open} />
        <MallChip mall={row.mall} />
        {row.trust && <TrustDots trust={row.trust} compact className="ms-auto" />}
      </div>
      {!row.mall?.name && <p className="mt-1 truncate text-[11px] text-muted-foreground">{row.address_short}</p>}

      {/* Three separate fields: listed price · last price change · confirmed availability */}
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 rounded-xl bg-muted/60 p-2.5 text-xs">
        <dt className="text-muted-foreground">قیمت ثبت‌شده</dt>
        <dd>
          <PriceLine price={row.price} flag={row.price_flag} />
        </dd>
        <dt className="text-muted-foreground">آخرین تغییر قیمت</dt>
        <dd>
          <FreshnessBadge freshness={row.freshness} days={row.price_age_days} />
        </dd>
        <dt className="text-muted-foreground">موجودی</dt>
        <dd>
          <AvailabilityBadge a={availability} />
        </dd>
      </dl>

      {/* conditions, website/Instagram, payment channel and «why» live in «جزئیات» */}
      {askChannel ? (
        <div className="mt-2.5 space-y-2">
          <p className="text-[11px] text-muted-foreground">همراه خرید بپرسد (شبیه‌سازی‌شده) یا خودتان پیام بدهید:</p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="h-11" onClick={() => follow('message')} disabled={busy}>
              <MessageCircle className="size-4" />
              پیام بده
            </Button>
            <Button size="sm" className="h-11" onClick={() => follow('call')} disabled={busy}>
              <PhoneCall className="size-4" />
              تماس بگیر
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-11"
              onClick={() => {
                setAskChannel(false);
                setMyMessage(true);
              }}
            >
              <MessageSquareText className="size-4" />
              خودم پیام بدهم
            </Button>
            <Button size="sm" variant="ghost" className="h-11" onClick={() => setAskChannel(false)}>
              انصراف
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* one primary action; the rest behind «…» */}
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" variant="default" className="h-11 flex-1" disabled={busy || followupBusy} onClick={() => setAskChannel(true)}>
              <Phone className="size-4" />
              پیگیری
            </Button>
            <Button size="sm" variant="outline" className="h-11 w-12" aria-label="گزینه‌های بیشتر" aria-expanded={more} data-more onClick={() => setMore((v) => !v)}>
              <MoreHorizontal className="size-4" />
            </Button>
          </div>
          {more && (
            <div className="mt-2 grid grid-cols-2 gap-2" data-more-actions>
              <Button size="sm" variant="ghost" className="h-11 justify-start" onClick={() => setDetails(true)}>
                <Info className="size-4" />
                جزئیات
              </Button>
              <Button
                size="sm"
                variant={inPlan ? 'secondary' : 'ghost'}
                className="h-11 justify-start"
                aria-pressed={inPlan}
                onClick={() =>
                  state &&
                  patch({ shortlist: inPlan ? state.shortlist.filter((o) => o !== row.offer_id) : [...state.shortlist, row.offer_id].slice(-10) })
                }
              >
                {inPlan ? <ListChecks className="size-4" /> : <ListPlus className="size-4" />}
                {inPlan ? 'در برنامه' : 'به برنامه'}
              </Button>
              {row.price !== null && row.price_flag === 'ok' && (
                <Button size="sm" variant="ghost" className="h-11 justify-start" disabled={busy} onClick={() => sendAction(`کارت چانه‌زنی برای «${row.shop_name}»`, 'bargaining_card', { offer_id: row.offer_id })}>
                  <Handshake className="size-4" />
                  کارت چانه‌زنی
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-11 justify-start" onClick={() => setMyMessage(true)}>
                <MessageSquareText className="size-4" />
                خودم پیام بدهم
              </Button>
            </div>
          )}
        </>
      )}
      {myMessage && <SellerMessageSheet offerId={row.offer_id} onClose={() => setMyMessage(false)} />}
      <ShopDetailsSheet open={details} onOpenChange={setDetails} shopId={row.shop_id} productId={row.product_id} score={row.score_breakdown} why={row.why} conditions={row.conditions} />
    </article>
  );
}
