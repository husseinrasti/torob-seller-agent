'use client';

import { useState } from 'react';
import { Info, ListPlus, ListChecks, MessageCircle, Navigation, Phone, PhoneCall, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistance } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { SellerRow } from '@/lib/search/sellers';
import { useChatActions } from '@/components/app/chat-actions';
import { useSession } from '@/components/app/session-context';
import { AvailabilityBadge, ConditionChips, FreshnessBadge, MallChip, OpenDot, PriceLine, type Availability } from './badges';
import { ShopDetailsSheet } from './shop-details-sheet';

export function SellerCard({ row, rank, availability, productTitle }: { row: SellerRow; rank: number; availability: Availability; productTitle?: string }) {
  const { sendAction, busy } = useChatActions();
  const { state, patch, focusShop } = useSession();
  const [askChannel, setAskChannel] = useState(false);
  const [details, setDetails] = useState(false);
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
      className={cn('scroll-mt-40 rounded-2xl border bg-card p-3 shadow-xs transition', focusShop === row.shop_id && 'ring-2 ring-primary')}
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

      <div className="mt-2 flex flex-wrap gap-1">
        <ConditionChips c={row.conditions} />
      </div>

      {row.why.length > 0 && (
        <p className="mt-2 flex items-start gap-1 text-xs leading-5 text-primary">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" />
          {row.why.join(' · ')}
        </p>
      )}

      {askChannel ? (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Button size="sm" className="h-11" onClick={() => follow('message')} disabled={busy}>
            <MessageCircle className="size-4" />
            پیام
          </Button>
          <Button size="sm" className="h-11" onClick={() => follow('call')} disabled={busy}>
            <PhoneCall className="size-4" />
            تماس
          </Button>
          <Button size="sm" variant="ghost" className="h-11" onClick={() => setAskChannel(false)}>
            انصراف
          </Button>
        </div>
      ) : (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Button size="sm" variant="default" className="h-11" disabled={busy || followupBusy} onClick={() => setAskChannel(true)}>
            <Phone className="size-4" />
            پیگیری
          </Button>
          <Button size="sm" variant="outline" className="h-11" onClick={() => setDetails(true)}>
            <Info className="size-4" />
            جزئیات
          </Button>
          <Button
            size="sm"
            variant={inPlan ? 'secondary' : 'outline'}
            className="h-11 px-2"
            aria-pressed={inPlan}
            onClick={() =>
              state &&
              patch({ shortlist: inPlan ? state.shortlist.filter((o) => o !== row.offer_id) : [...state.shortlist, row.offer_id].slice(-10) })
            }
          >
            {inPlan ? <ListChecks className="size-4" /> : <ListPlus className="size-4" />}
            {inPlan ? 'در برنامه' : 'به برنامه'}
          </Button>
        </div>
      )}
      <ShopDetailsSheet open={details} onOpenChange={setDetails} shopId={row.shop_id} productId={row.product_id} score={row.score_breakdown} />
    </article>
  );
}
