'use client';

import { useContext } from 'react';
import Link from 'next/link';
import { Building2, ClipboardCheck, Clock, Footprints, Map, Navigation, Share2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { faText, formatDistance, formatToman } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { PlanPayload, PlanStep } from '@/lib/plan/trip';
import { ChatActionsContext } from '@/components/app/chat-actions';
import { AvailabilityBadge } from './badges';

function Step({ s }: { s: PlanStep }) {
  return (
    <li className="relative space-y-1.5 ps-10">
      <span className="absolute start-0 top-0 flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{toFaDigits(s.order)}</span>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{s.shop_name}</p>
          <p className="text-xs text-muted-foreground">{[s.floor_label, s.unit_label].filter(Boolean).join(' · ') || s.address_short}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">
          <Clock className="size-3" />
          {s.eta_label}
        </span>
      </div>
      <p className="line-clamp-1 text-[11px] text-muted-foreground">{faText(s.product_title.split('|')[0])}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={cn('rounded-full px-2 py-0.5', s.open_at_eta.open ? 'bg-fresh-bg text-fresh' : s.open_at_eta.known ? 'bg-stale-bg text-stale' : 'bg-muted text-muted-foreground')}>
          {s.open_at_eta.known ? (s.open_at_eta.open ? 'باز در زمان رسیدن' : 'بسته در زمان رسیدن') : 'ساعت کاری ثبت نشده'}
        </span>
        <AvailabilityBadge a={{ status: s.followup_status, newPrice: s.new_price }} />
        {s.new_price ? (
          <span className="text-muted-foreground line-through">{formatToman(s.price)}</span>
        ) : (
          <span className="font-semibold">{formatToman(s.price)}</span>
        )}
      </div>
      {s.warning && (
        <p className="flex items-start gap-1 text-xs text-stale">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {s.warning.replace('⚠️ ', '')}
        </p>
      )}
      <div className="flex gap-1.5 pt-0.5">
        {(
          [
            ['نشان', s.nav_links.neshan],
            ['گوگل‌مپ', s.nav_links.google],
            ['OSM', s.nav_links.osm],
          ] as const
        ).map(([label, href]) => (
          <a key={label} href={href} target="_blank" rel="noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-xl border text-xs font-medium hover:bg-muted">
            <Navigation className="size-3.5" />
            {label}
          </a>
        ))}
      </div>
    </li>
  );
}

export function TripPlan({ plan, planId, sharePath }: { plan: PlanPayload; planId?: string; sharePath?: string }) {
  const chat = useContext(ChatActionsContext);
  const share = async () => {
    const url = sharePath ? new URL(sharePath, window.location.origin).toString() : window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: 'برنامه مراجعه — همراه خرید', url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('لینک برنامه کپی شد');
      }
    } catch {
      // user cancelled the share sheet
    }
  };
  const stepsCount = plan.groups.reduce((n, g) => n + g.steps.length, 0);
  return (
    <section className="overflow-hidden rounded-2xl border bg-card" data-plan-id={planId}>
      <header className="space-y-1 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-base font-bold">
            <Map className="size-5 text-primary" />
            برنامه مراجعه
          </h3>
          <span className="text-xs text-muted-foreground">
            {toFaDigits(stepsCount)} مغازه · حدود {toFaDigits(plan.total_minutes)} دقیقه
          </span>
        </div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Footprints className="size-3.5" />
          شروع از {plan.start.label} · ساعت {plan.start_label} · {formatDistance(plan.total_walk_m)} پیاده‌روی
        </p>
        {plan.warnings > 0 && (
          <p className="flex items-center gap-1 text-xs font-medium text-stale">
            <TriangleAlert className="size-3.5" />
            {toFaDigits(plan.warnings)} مغازه در زمان رسیدن بسته است؛ ترتیب را عوض کنید یا زمان دیگری بروید.
          </p>
        )}
      </header>
      <ol className="space-y-4 p-3">
        {plan.groups.map((g, gi) => (
          <li key={gi} className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-secondary-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
                <Building2 className="size-3.5" />
                {g.mall ?? 'مغازه خیابانی'}
              </span>
              {g.steps[0]?.walk_min ? (
                <span className="text-[11px] font-normal text-muted-foreground">
                  {toFaDigits(g.steps[0].walk_min)} دقیقه پیاده{g.mall ? ' + ورود به پاساژ' : ''}
                </span>
              ) : null}
            </div>
            <ol className="space-y-4">
              {g.steps.map((s) => (
                <Step key={s.offer_id} s={s} />
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <footer className="grid grid-cols-2 gap-2 border-t p-3">
        <Button className="h-11" onClick={share}>
          <Share2 className="size-4" />
          اشتراک‌گذاری
        </Button>
        {chat ? (
          <Button variant="outline" className="h-11" disabled={chat.busy} onClick={() => chat.sendAction('چک‌لیست خرید حضوری را بده', 'purchase_checklist', {})}>
            <ClipboardCheck className="size-4" />
            چک‌لیست خرید
          </Button>
        ) : (
          <Link href="/" className="inline-flex h-11 items-center justify-center rounded-lg border text-sm font-medium hover:bg-muted">
            همراه خرید
          </Link>
        )}
      </footer>
    </section>
  );
}
