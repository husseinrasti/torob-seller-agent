'use client';

import { CheckCircle2, CircleDashed, Clock, Loader2, PhoneOff, ShieldAlert, TriangleAlert, XCircle, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatToman, relativeDays, relativeMinutes } from '@/lib/fa/format';
import type { Freshness, PriceFlag } from '@/lib/data/quality';
import type { FollowupStatus } from '@/lib/agent/state';
import type { MallRef } from '@/lib/search/sellers';

const pill = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap';

/** Field 1: the listed price (never merged with freshness or availability). */
export function PriceLine({ price, flag, className }: { price: number | null; flag: PriceFlag; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {price === null ? (
        <span className="text-sm font-semibold text-muted-foreground">قیمت ثبت نشده</span>
      ) : (
        <span className={cn('text-base font-bold tabular-nums', flag !== 'ok' && 'text-muted-foreground line-through decoration-1')}>{formatToman(price)}</span>
      )}
      {(flag === 'suspicious_low' || flag === 'suspicious_high') && (
        <span className={cn(pill, 'bg-stale-bg text-stale')}>
          <ShieldAlert className="size-3" />
          {flag === 'suspicious_low' ? 'قیمت مشکوک (خیلی پایین)' : 'قیمت مشکوک (خیلی بالا)'}
        </span>
      )}
    </div>
  );
}

/** Field 2: when the price last changed. Green ≤7d, amber ≤30d, red >30d, gray unknown. */
export function FreshnessBadge({ freshness, days }: { freshness: Freshness; days: number | null }) {
  const styles: Record<Freshness, string> = {
    fresh: 'bg-fresh-bg text-fresh',
    recent: 'bg-recent-bg text-recent',
    stale: 'bg-stale-bg text-stale',
    unknown: 'bg-muted text-muted-foreground',
  };
  const text =
    freshness === 'unknown'
      ? 'تاریخ تغییر قیمت نامشخص'
      : freshness === 'fresh'
        ? `به‌روز · ${relativeDays(days)}`
        : freshness === 'stale'
          ? `${relativeDays(days)} — ممکن است قدیمی باشد`
          : relativeDays(days);
  return (
    <span className={cn(pill, styles[freshness])}>
      <Clock className="size-3" />
      {text}
    </span>
  );
}

export type Availability = { status: FollowupStatus | 'unverified'; at?: string | null; newPrice?: number | null };

/** Field 3: stock confirmed by a (simulated) follow-up — «تأیید نشده» until then. */
export function AvailabilityBadge({ a, now }: { a: Availability; now?: Date }) {
  const ago = a.at ? ` · ${relativeMinutes(a.at, now)}` : '';
  switch (a.status) {
    case 'confirmed':
      return (
        <span className={cn(pill, 'bg-fresh-bg text-fresh')}>
          <CheckCircle2 className="size-3" />
          تأیید شد{ago}
        </span>
      );
    case 'out_of_stock':
      return (
        <span className={cn(pill, 'bg-stale-bg text-stale')}>
          <XCircle className="size-3" />
          ناموجود{ago}
        </span>
      );
    case 'price_changed':
      return (
        <span className={cn(pill, 'bg-recent-bg text-recent')}>
          <TriangleAlert className="size-3" />
          {a.newPrice ? `قیمت جدید ${formatToman(a.newPrice)}` : 'قیمت تغییر کرده'}
        </span>
      );
    case 'no_answer':
      return (
        <span className={cn(pill, 'bg-muted text-muted-foreground')}>
          <PhoneOff className="size-3" />
          پاسخ نداد{ago}
        </span>
      );
    case 'pending':
    case 'contacting':
      return (
        <span className={cn(pill, 'bg-info-bg text-info')}>
          <Loader2 className="size-3 animate-spin" />
          در حال پیگیری…
        </span>
      );
    default:
      return (
        <span className={cn(pill, 'border border-dashed border-border text-muted-foreground')}>
          <CircleDashed className="size-3" />
          تأیید نشده
        </span>
      );
  }
}

export function MallChip({ mall, className }: { mall: MallRef | null; className?: string }) {
  if (!mall || (!mall.name && !mall.floor_label && !mall.unit_label)) return null;
  const parts = [mall.name, mall.floor_label, mall.unit_label ? `${mall.unit_kind ?? 'واحد'} ${mall.unit_label}` : null].filter(Boolean);
  return (
    <span className={cn(pill, 'max-w-full bg-secondary text-secondary-foreground', className)}>
      <Building2 className="size-3 shrink-0" />
      <span className="truncate">{parts.join(' · ')}</span>
    </span>
  );
}

export function OpenDot({ open }: { open: { known: boolean; open: boolean | null; label: string } }) {
  const color = !open.known ? 'bg-muted-foreground/40' : open.open ? 'bg-fresh' : 'bg-stale';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('size-2 rounded-full', color)} />
      {open.label}
    </span>
  );
}

export type Conditions = {
  installment: boolean;
  installment_in_person: boolean;
  torobpay: boolean;
  torobpay_in_person: boolean;
  fast_delivery: boolean | null;
  warranty_text: string | null;
  has_warranty?: boolean;
};

export function ConditionChips({ c }: { c: Conditions }) {
  const chips: Array<{ text: string; tone: 'ok' | 'muted' }> = [];
  if (c.installment) chips.push({ text: c.installment_in_person ? 'قسطی (حضوری)' : 'قسطی (اعلام‌شده)', tone: 'ok' });
  if (c.torobpay) chips.push({ text: c.torobpay_in_person ? 'ترب‌پی (حضوری)' : 'ترب‌پی (اعلام‌شده)', tone: 'ok' });
  if (c.fast_delivery) chips.push({ text: 'ارسال فوری', tone: 'ok' });
  if (c.warranty_text) chips.push({ text: c.warranty_text, tone: c.has_warranty === false ? 'muted' : 'ok' });
  if (!chips.length) return <span className={cn(pill, 'bg-muted text-muted-foreground')}>شرایط خرید اعلام نشده</span>;
  return (
    <>
      {chips.map((ch) => (
        <span key={ch.text} className={cn(pill, ch.tone === 'ok' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground')}>
          {ch.text}
        </span>
      ))}
    </>
  );
}
