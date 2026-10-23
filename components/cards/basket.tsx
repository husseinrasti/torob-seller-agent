'use client';

import { Building2, Phone, ShoppingBasket, Store, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistance } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { BasketOutput, BasketPlanItem, BasketPlanOutput } from '@/lib/plan/basket-service';
import { useChatActions } from '@/components/app/chat-actions';
import { AvailabilityBadge, FreshnessBadge, PriceLine } from './badges';
import { TripPlan } from './trip-plan';

/** basket_add / basket_remove: what changed; the BasketBar above the composer keeps the full list. */
export function BasketCard({ output }: { output: BasketOutput }) {
  return (
    <p data-basket className="flex flex-wrap items-center gap-1.5 rounded-2xl border bg-card px-3 py-2 text-xs">
      <ShoppingBasket className="size-4 text-primary" />
      {output.added.length > 0 && <span>به سبد اضافه شد: {output.added.map((t) => `«${toFaDigits(t)}»`).join('، ')}</span>}
      {output.removed.length > 0 && <span>از سبد حذف شد: {output.removed.map((t) => `«${toFaDigits(t)}»`).join('، ')}</span>}
      <span className="text-muted-foreground">· سبد: {toFaDigits(output.items.length)} قلم</span>
    </p>
  );
}

function ItemRow({ it }: { it: BasketPlanItem }) {
  const p = it.pick!;
  return (
    <li className="space-y-1 p-2.5" data-basket-item={p.via}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{toFaDigits(it.text)}</p>
          <p className="line-clamp-1 text-[11px] text-muted-foreground">{toFaDigits(p.product_title)}</p>
        </div>
        <PriceLine price={p.price} flag={p.price_flag} className="shrink-0 text-xs" />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {[p.shop_name, p.mall?.floor_label, p.mall?.unit_label ? `${p.mall.unit_kind ?? 'واحد'} ${p.mall.unit_label}` : null, formatDistance(p.distance_m)].filter(Boolean).join(' · ')}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <FreshnessBadge freshness={p.freshness} days={p.price_age_days} />
        <AvailabilityBadge a={{ status: p.followup_status ?? 'unverified' }} />
        {p.replaced && <span className="text-[11px] text-recent">جایگزین «{p.replaced}» که موجود نداشت</span>}
      </div>
    </li>
  );
}

/** F3 «همه یکجا»: one seller per item grouped by stop (a mall or a single shop), coverage, follow-ups, the visit plan. */
export function BasketPlanCard({ output }: { output: BasketPlanOutput }) {
  const { sendAction, busy } = useChatActions();
  const byId = new Map(output.items.map((it) => [it.item_id, it]));
  const missing = output.items.filter((it) => !it.pick);
  const offerCount = output.items.filter((it) => it.pick).length;
  return (
    <section data-basket-plan data-in-one-mall={output.coverage.items_in_one_mall} className="space-y-2.5 rounded-2xl border bg-card p-3">
      <header>
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <ShoppingBasket className="size-4 text-primary" />
          خرید یکجا · {toFaDigits(output.coverage.items_total)} قلم
        </h3>
        <p className="text-[11px] leading-5 text-muted-foreground">
          {output.summary} · از {output.location}
        </p>
      </header>

      {output.stops.map((s, i) => (
        <div key={s.key} data-basket-stop className="overflow-hidden rounded-xl border">
          <p className="flex items-center gap-1.5 bg-muted/40 px-2.5 py-1.5 text-xs font-semibold">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{toFaDigits(i + 1)}</span>
            {s.mall ? <Building2 className="size-3.5 text-primary" /> : <Store className="size-3.5 text-muted-foreground" />}
            {s.mall ?? byId.get(s.item_ids[0])?.pick?.shop_name}
            <span className="font-normal text-muted-foreground">· {toFaDigits(s.item_ids.length)} قلم</span>
          </p>
          <ul className="divide-y">
            {s.item_ids.map((id) => (
              <ItemRow key={id} it={byId.get(id)!} />
            ))}
          </ul>
        </div>
      ))}

      {missing.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-xl bg-recent-bg p-2.5 text-xs leading-5 text-recent">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {missing.map((it) => `«${toFaDigits(it.text)}»`).join('، ')}: فروشنده‌ای در این محدوده در داده‌های ترب ثبت نشده.
        </p>
      )}

      {!output.verified && offerCount > 0 && (
        <Button size="sm" className="h-11 w-full" disabled={busy} data-basket-verify onClick={() => sendAction('موجودی همه‌ی قلم‌های سبد را بپرس', 'basket_plan', { verify: true })}>
          <Phone className="size-4" />
          پیگیری همه ({toFaDigits(Math.min(5, offerCount))} فروشنده)
        </Button>
      )}
      {output.disclaimer && <p className="text-[11px] text-muted-foreground">{output.disclaimer}</p>}

      {output.plan && <TripPlan plan={output.plan} planId={output.plan.plan_id} sharePath={output.plan.share_path} />}
    </section>
  );
}
