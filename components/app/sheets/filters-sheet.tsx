'use client';

import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatTomanShort } from '@/lib/fa/format';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Intent } from '@/lib/search/score';
import { useSession } from '../session-context';
import { BottomSheet } from './bottom-sheet';

const ITEMS = [
  ['open_now', 'الان باز باشد', 'فقط فروشگاه‌هایی که ساعت کاری‌شان ثبت شده و الان باز هستند'],
  ['installment', 'خرید قسطی / اعتباری', 'اسنپ‌پی، دیجی‌پی، تارا، ازکی‌وام'],
  ['torobpay', 'ترب‌پی', 'پرداخت با ترب‌پی اعلام شده'],
  ['fast_delivery', 'ارسال فوری', ''],
  ['warranty_required', 'گارانتی داشته باشد', ''],
  ['hide_stale', 'پنهان کردن قیمت‌های قدیمی', 'قیمت‌هایی که بیش از ۳۰ روز تغییر نکرده‌اند'],
  ['hide_suspicious', 'پنهان کردن قیمت‌های مشکوک', 'خیلی پایین‌تر یا بالاتر از میانه بازار'],
] as const;

const INTENTS: Array<[Intent, string]> = [
  ['balanced', 'متعادل'],
  ['cheapest', 'ارزان‌ترین'],
  ['nearest', 'نزدیک‌ترین'],
  ['now', 'الان باز'],
];

const BUDGETS = [1_000_000, 3_000_000, 10_000_000, 30_000_000, 60_000_000, 100_000_000];

/** All filters in one sheet (the ContextBar keeps only location · radius · «فیلترها»). */
export function FiltersSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, patch } = useSession();
  if (!state) return null;
  const cap = state.filters.max_price ?? null;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="فیلترها" description="تغییرات بلافاصله روی فهرست فروشنده‌ها اعمال می‌شود.">
      <div className="space-y-4 py-2">
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">سقف قیمت{cap ? ` · تا ${formatTomanShort(cap)} تومان` : ''}</p>
          <div className="flex flex-wrap gap-1.5" data-budget-presets>
            {BUDGETS.map((b) => (
              <button key={b} onClick={() => patch({ filters: { max_price: cap === b ? null : b } })} className={cn('h-10 rounded-full border px-3 text-xs', cap === b ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {formatTomanShort(b)}
              </button>
            ))}
            <button onClick={() => patch({ filters: { max_price: null } })} className={cn('h-10 rounded-full border px-3 text-xs', !cap ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              بدون سقف
            </button>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">اولویت مرتب‌سازی</p>
          <ToggleGroup type="single" variant="outline" className="w-full" value={state.intent} onValueChange={(v) => v && patch({ intent: v as Intent })}>
            {INTENTS.map(([v, label]) => (
              <ToggleGroupItem key={v} value={v} className="h-11 flex-1 text-xs">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <ul className="divide-y rounded-2xl border">
          {ITEMS.map(([key, label, hint]) => (
            <li key={key} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
              <label htmlFor={`f-${key}`} className="flex-1 cursor-pointer">
                <span className="block text-sm">{label}</span>
                {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
              </label>
              <Switch id={`f-${key}`} dir="ltr" checked={Boolean(state.filters[key])} onCheckedChange={(v) => patch({ filters: { [key]: v } })} />
            </li>
          ))}
        </ul>
        <p className="text-[11px] leading-5 text-muted-foreground">
          شرایط پرداخت فقط برای بخشی از فروشگاه‌ها ثبت شده؛ فروشگاهی که چیزی اعلام نکرده با این فیلترها پنهان می‌شود.
        </p>
      </div>
    </BottomSheet>
  );
}
