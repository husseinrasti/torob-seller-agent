'use client';

import { useState } from 'react';
import { Handshake, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatToman, formatTomanShort } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { BargainOutput } from '@/lib/search/market';
import { SellerMessageSheet } from './seller-message';

export const POSITION: Record<BargainOutput['position'], { label: string; cls: string }> = {
  below_median: { label: 'زیر میانه بازار', cls: 'bg-fresh-bg text-fresh' },
  near_median: { label: 'نزدیک میانه بازار', cls: 'bg-muted text-foreground' },
  above_median: { label: 'بالای میانه بازار', cls: 'bg-recent-bg text-recent' },
};

/** F5: min–median–max bar with this offer marked, ≤ 4 talking points, a target price and «پیام با این قیمت». */
export function BargainCard({ output, embedded }: { output: BargainOutput; embedded?: boolean }) {
  const [msg, setMsg] = useState(false);
  const { min, median, max, n } = output.stats;
  const span = Math.max(1, max - min);
  const at = (p: number) => `${Math.min(100, Math.max(0, ((p - min) / span) * 100))}%`;
  const pos = POSITION[output.position];
  return (
    <section data-bargain className={cn('space-y-2.5', !embedded && 'rounded-2xl border bg-card p-3')}>
      <header className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Handshake className="size-4 text-primary" />
          کارت چانه‌زنی{embedded ? '' : ` — ${output.shop_name}`}
        </h3>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', pos.cls)}>
          {pos.label} {output.position !== 'near_median' && `(${output.delta_pct > 0 ? '+' : '−'}${toFaDigits(Math.abs(Math.round(output.delta_pct)))}٪)`}
        </span>
      </header>
      <div aria-label="بازه قیمت بازار">
        <div className="relative h-2 rounded-full bg-gradient-to-l from-stale-bg via-muted to-fresh-bg" dir="ltr">
          <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-muted-foreground" style={{ left: at(median) }} title="میانه" />
          <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary" style={{ left: at(output.price) }} title="این فروشنده" />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground" dir="ltr">
          <span dir="rtl">{formatTomanShort(min)}</span>
          <span dir="rtl">میانه {formatTomanShort(median)}</span>
          <span dir="rtl">{formatTomanShort(max)}</span>
        </div>
        <p className="text-[10px] text-muted-foreground">بر اساس {toFaDigits(n)} قیمت سالم ثبت‌شده در ترب · این فروشنده: {formatToman(output.price)}</p>
      </div>
      <ul className="list-disc space-y-1 ps-5 text-xs leading-6">
        {output.talking_points.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {output.target_price ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent p-2.5">
          <p className="text-xs">
            قیمت هدف: <strong className="text-sm">{formatToman(output.target_price)}</strong>
          </p>
          <button onClick={() => setMsg(true)} className="inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground">
            <MessageSquareText className="size-3.5" />
            پیام با این قیمت
          </button>
        </div>
      ) : (
        <p className="rounded-xl bg-fresh-bg p-2.5 text-xs text-fresh">قیمت منصفانه است؛ برای تخفیف دلیل داده‌ای نداریم.</p>
      )}
      {msg && <SellerMessageSheet offerId={output.offer_id} intent="price" target={output.target_price} onClose={() => setMsg(false)} />}
    </section>
  );
}
