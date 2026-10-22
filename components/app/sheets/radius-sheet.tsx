'use client';

import { cn } from '@/lib/utils';
import { formatDistance } from '@/lib/fa/format';
import { RADIUS_STEPS } from '@/lib/geo';
import { useSession } from '../session-context';
import { BottomSheet } from './bottom-sheet';

export function RadiusSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, patch } = useSession();
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="شعاع جست‌وجو" description="فروشنده‌های داخل این فاصله از محل شما نشان داده می‌شوند.">
      <div className="grid grid-cols-5 gap-2 py-2">
        {RADIUS_STEPS.map((r) => (
          <button
            key={r}
            onClick={() => {
              patch({ radius_m: r });
              onOpenChange(false);
            }}
            className={cn(
              'h-12 rounded-xl border text-sm font-medium transition',
              state?.radius_m === r ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {formatDistance(r)}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
