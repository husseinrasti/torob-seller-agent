'use client';

import { ListPlus, Navigation, Phone, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { faText, formatDistance } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { AlternativesOutput } from '@/lib/agent/types';
import type { MallRef } from '@/lib/search/sellers';
import type { Freshness, PriceFlag } from '@/lib/data/quality';
import { useChatActions } from '@/components/app/chat-actions';
import { useSession } from '@/components/app/session-context';
import { useFollowups } from '@/components/app/followups-store';
import { AvailabilityBadge, FreshnessBadge, MallChip, PriceLine } from './badges';

const REASON: Record<string, string> = {
  out_of_stock: 'ناموجود بود',
  price_changed: 'قیمتش تغییر کرد',
  closed: 'الان بسته است',
  no_answer: 'پاسخ نداد',
};

type AltItem = {
  offer_id: string;
  shop_name: string;
  title?: string;
  price: number | null;
  price_flag: PriceFlag;
  freshness: Freshness;
  price_age_days: number | null;
  distance_m: number;
  mall: MallRef | null;
  why: string;
  open?: { label: string };
};

function AltRow({ it }: { it: AltItem }) {
  const { sendAction, busy } = useChatActions();
  const { state, patch } = useSession();
  const { availabilityFor } = useFollowups();
  const inPlan = state?.shortlist.includes(it.offer_id) ?? false;
  return (
    <li className="space-y-1.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">{it.shop_name}</p>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Navigation className="size-3" />
          {formatDistance(it.distance_m)}
        </span>
      </div>
      {it.title && <p className="line-clamp-1 text-xs">{faText(it.title)}</p>}
      <MallChip mall={it.mall} />
      <div className="flex flex-wrap items-center gap-1.5">
        <PriceLine price={it.price} flag={it.price_flag} />
        <FreshnessBadge freshness={it.freshness} days={it.price_age_days} />
        <AvailabilityBadge a={availabilityFor(it.offer_id, state?.followups[it.offer_id])} />
      </div>
      <p className="flex items-start gap-1 text-xs leading-5 text-primary">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        {it.why}
        {it.open ? ` · ${it.open.label}` : ''}
      </p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button size="sm" className="h-11" disabled={busy} onClick={() => sendAction(`موجودی «${it.shop_name}» را هم پیگیری کن`, 'contact_seller', { offer_ids: [it.offer_id], channel: 'message' })}>
          <Phone className="size-4" />
          پیگیری
        </Button>
        <Button
          size="sm"
          variant={inPlan ? 'secondary' : 'outline'}
          className="h-11"
          onClick={() => state && patch({ shortlist: inPlan ? state.shortlist.filter((o) => o !== it.offer_id) : [...state.shortlist, it.offer_id] })}
        >
          <ListPlus className="size-4" />
          {inPlan ? 'در برنامه' : 'به برنامه'}
        </Button>
      </div>
    </li>
  );
}

export function AlternativesPanel({ output }: { output: AlternativesOutput }) {
  const same: AltItem[] = output.same_product.map((r) => ({
    offer_id: r.offer_id,
    shop_name: r.shop_name,
    price: r.price,
    price_flag: r.price_flag,
    freshness: r.freshness,
    price_age_days: r.price_age_days,
    distance_m: r.distance_m,
    mall: r.mall,
    why: r.why.join(' · '),
    open: r.open,
  }));
  const similar: AltItem[] = output.similar.map((x) => ({ ...x }));
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <header className="border-b p-3">
        <h3 className="text-sm font-bold">جایگزین‌ها</h3>
        <p className="text-[11px] text-muted-foreground">
          «{output.origin.shop_name}» {REASON[output.reason] ?? ''}
          {output.origin.mall_name ? ` · ${output.origin.mall_name}` : ''}
        </p>
      </header>
      <Tabs defaultValue={same.length ? 'same' : 'similar'} dir="rtl" className="gap-0">
        <TabsList className="m-2 grid h-11 w-[calc(100%-1rem)] grid-cols-2">
          <TabsTrigger value="same" className="h-9 text-xs">
            همین کالا جای دیگر ({toFaDigits(same.length)})
          </TabsTrigger>
          <TabsTrigger value="similar" className="h-9 text-xs">
            کالای مشابه همین‌جا ({toFaDigits(similar.length)})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="same">
          {same.length ? <ul className="divide-y border-t">{same.map((it) => <AltRow key={it.offer_id} it={it} />)}</ul> : <p className="p-3 text-sm text-muted-foreground">فروشنده دیگری در این محدوده این کالا را ثبت نکرده است.</p>}
        </TabsContent>
        <TabsContent value="similar">
          {similar.length ? (
            <ul className="divide-y border-t">{similar.map((it) => <AltRow key={it.offer_id} it={it} />)}</ul>
          ) : (
            <p className="p-3 text-sm text-muted-foreground">کالای مشابه با قیمت نزدیک در همین مغازه یا پاساژ ثبت نشده است.</p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
