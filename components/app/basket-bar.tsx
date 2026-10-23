'use client';

import { Route, ShoppingBasket, X } from 'lucide-react';
import { toFaDigits } from '@/lib/fa/digits';
import { useChatActions } from './chat-actions';
import { useSession } from './session-context';

/** F3: the «یکجا» basket above the composer — its lines (× removes one) and «برنامه‌ی یکجا». */
export function BasketBar() {
  const { state, patch } = useSession();
  const { sendAction, busy } = useChatActions();
  const items = state?.basket ?? [];
  if (!items.length) return null;
  return (
    <div data-basket-bar className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pt-2">
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
        <ShoppingBasket className="size-4" />
        سبد {toFaDigits(items.length)} قلم
      </span>
      {items.map((it) => (
        <span key={it.id} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border bg-card ps-3 pe-1 text-xs">
          {toFaDigits(it.text)}
          <button aria-label={`حذف ${it.text} از سبد`} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-muted" onClick={() => patch({ basket: items.filter((x) => x.id !== it.id).map((x) => x.id) })}>
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {items.length >= 2 && (
        <button
          disabled={busy}
          onClick={() => sendAction('همه‌ی قلم‌های سبد را یکجا برنامه بچین', 'basket_plan', {})}
          className="tap inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          <Route className="size-3.5" />
          برنامه‌ی یکجا
        </button>
      )}
    </div>
  );
}
