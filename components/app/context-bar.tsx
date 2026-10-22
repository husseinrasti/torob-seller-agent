'use client';

import { useState } from 'react';
import { ChevronDown, CircleDot, Clock, CreditCard, MapPin, SlidersHorizontal, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistance, formatTomanShort } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import { useSession } from './session-context';
import { LocationSheet } from './sheets/location-sheet';
import { RadiusSheet } from './sheets/radius-sheet';
import { BudgetSheet } from './sheets/budget-sheet';
import { ConditionsSheet } from './sheets/conditions-sheet';

type SheetName = 'location' | 'radius' | 'budget' | 'conditions' | null;

function Chip({ active, onClick, children, label, id }: { active?: boolean; onClick: () => void; children: React.ReactNode; label?: string; id?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      data-chip={id}
      aria-pressed={active}
      className={cn(
        'tap inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition active:scale-[0.98]',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

/** Sticky context: location · radius · budget · quick conditions. Every change PATCHes the session (no LLM). */
export function ContextBar() {
  const { state, patch } = useSession();
  const [open, setOpen] = useState<SheetName>(null);
  if (!state) return <div className="h-12" />;
  const f = state.filters;
  const extraCount = ['torobpay', 'fast_delivery', 'warranty_required', 'hide_stale', 'hide_suspicious'].filter((k) => f[k as keyof typeof f]).length + (state.intent !== 'balanced' ? 1 : 0);

  return (
    <>
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 py-2">
        <Chip id="location" onClick={() => setOpen('location')} label="تغییر محل">
          <MapPin className="size-3.5 text-primary" />
          <span className="max-w-28 truncate">{state.location.label}</span>
          <ChevronDown className="size-3 opacity-60" />
        </Chip>
        <Chip id="radius" onClick={() => setOpen('radius')} label="تغییر شعاع">
          <CircleDot className="size-3.5 text-primary" />
          {formatDistance(state.radius_m)}
          <ChevronDown className="size-3 opacity-60" />
        </Chip>
        <Chip id="budget" onClick={() => setOpen('budget')} active={Boolean(f.max_price)} label="سقف قیمت">
          <Wallet className="size-3.5" />
          {f.max_price ? `تا ${formatTomanShort(f.max_price)}` : state.budget?.max ? `بودجه ${formatTomanShort(state.budget.max)}` : 'سقف قیمت'}
          <ChevronDown className="size-3 opacity-60" />
        </Chip>
        <Chip id="open_now" active={Boolean(f.open_now)} onClick={() => patch({ filters: { open_now: !f.open_now } })}>
          <Clock className="size-3.5" />
          باز الان{f.open_now ? ' ✓' : ''}
        </Chip>
        <Chip id="installment" active={Boolean(f.installment)} onClick={() => patch({ filters: { installment: !f.installment } })}>
          <CreditCard className="size-3.5" />
          قسطی{f.installment ? ' ✓' : ''}
        </Chip>
        <Chip id="conditions" active={extraCount > 0} onClick={() => setOpen('conditions')} label="شرایط بیشتر">
          <SlidersHorizontal className="size-3.5" />
          شرایط{extraCount ? ` (${toFaDigits(extraCount)})` : ''}
        </Chip>
      </div>
      <LocationSheet open={open === 'location'} onOpenChange={(v) => setOpen(v ? 'location' : null)} />
      <RadiusSheet open={open === 'radius'} onOpenChange={(v) => setOpen(v ? 'radius' : null)} />
      <BudgetSheet open={open === 'budget'} onOpenChange={(v) => setOpen(v ? 'budget' : null)} />
      <ConditionsSheet open={open === 'conditions'} onOpenChange={(v) => setOpen(v ? 'conditions' : null)} />
    </>
  );
}
