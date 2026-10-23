'use client';

import { useState } from 'react';
import { ChevronDown, CircleDot, MapPin, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistance } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import { useSession } from './session-context';
import { LocationSheet } from './sheets/location-sheet';
import { RadiusSheet } from './sheets/radius-sheet';
import { FiltersSheet } from './sheets/filters-sheet';

type SheetName = 'location' | 'radius' | 'filters' | null;

function Chip({ active, onClick, children, label, id }: { active?: boolean; onClick: () => void; children: React.ReactNode; label?: string; id?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      data-chip={id}
      aria-pressed={active}
      className={cn(
        'tap inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition active:scale-[0.98]',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted/70 text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

/** Sticky context, minimal: location · radius · «فیلترها» (budget, open now, payment, sorting in one sheet). No LLM. */
export function ContextBar() {
  const { state } = useSession();
  const [open, setOpen] = useState<SheetName>(null);
  if (!state) return <div className="h-12" />;
  const f = state.filters;
  const active = ['max_price', 'open_now', 'installment', 'torobpay', 'fast_delivery', 'warranty_required', 'hide_stale', 'hide_suspicious'].filter((k) => f[k as keyof typeof f]).length + (state.intent !== 'balanced' ? 1 : 0);

  return (
    <>
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 py-2">
        <Chip id="location" onClick={() => setOpen('location')} label="تغییر محل">
          <MapPin className="size-3.5 text-primary" />
          <span className="max-w-32 truncate">{state.location.label}</span>
          <ChevronDown className="size-3 opacity-60" />
        </Chip>
        <Chip id="radius" onClick={() => setOpen('radius')} label="تغییر شعاع">
          <CircleDot className="size-3.5 text-primary" />
          {formatDistance(state.radius_m)}
          <ChevronDown className="size-3 opacity-60" />
        </Chip>
        <Chip id="filters" active={active > 0} onClick={() => setOpen('filters')} label="سقف قیمت، الان باز، قسطی و …">
          <SlidersHorizontal className="size-3.5" />
          فیلترها{active ? ` (${toFaDigits(active)})` : ''}
        </Chip>
      </div>
      <LocationSheet open={open === 'location'} onOpenChange={(v) => setOpen(v ? 'location' : null)} />
      <RadiusSheet open={open === 'radius'} onOpenChange={(v) => setOpen(v ? 'radius' : null)} />
      <FiltersSheet open={open === 'filters'} onOpenChange={(v) => setOpen(v ? 'filters' : null)} />
    </>
  );
}
