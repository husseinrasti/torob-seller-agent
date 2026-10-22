'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { formatToman, formatTomanShort } from '@/lib/fa/format';
import { useSession } from '../session-context';
import { BottomSheet } from './bottom-sheet';

const PRESETS = [1_000_000, 3_000_000, 10_000_000, 30_000_000, 60_000_000, 100_000_000];
const MIN = 500_000;
const MAX = 300_000_000;

// log scale so both «۲ میلیون» and «۶۰ میلیون» are easy to reach
const toSlider = (v: number) => Math.round((Math.log(v / MIN) / Math.log(MAX / MIN)) * 100);
const fromSlider = (s: number) => {
  const raw = MIN * Math.pow(MAX / MIN, s / 100);
  const step = raw >= 10_000_000 ? 1_000_000 : raw >= 1_000_000 ? 100_000 : 50_000;
  return Math.round(raw / step) * step;
};

export function BudgetSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, patch } = useSession();
  const initial = state?.filters.max_price ?? state?.budget?.max ?? 60_000_000;
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(state?.filters.max_price ?? state?.budget?.max ?? 60_000_000);
  }, [open, state?.filters.max_price, state?.budget?.max]);

  const apply = (v: number | null) => {
    patch({ filters: { max_price: v } });
    onOpenChange(false);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="سقف قیمت" description="فروشنده‌هایی که قیمت ثبت‌شده‌شان بالاتر است پنهان می‌شوند.">
      <div className="space-y-5 py-2">
        <p className="text-center text-2xl font-bold">{formatToman(value)}</p>
        <Slider dir="rtl" min={0} max={100} step={1} value={[toSlider(value)]} onValueChange={([s]) => setValue(fromSlider(s))} />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setValue(p)}
              className={cn('h-11 rounded-full border px-3 text-sm', value === p ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              {formatTomanShort(p)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11" onClick={() => apply(value)}>
            اعمال سقف
          </Button>
          <Button variant="outline" className="h-11" onClick={() => apply(null)}>
            بدون سقف قیمت
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
