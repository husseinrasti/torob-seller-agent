'use client';

import { useState } from 'react';
import { Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toFaDigits } from '@/lib/fa/digits';
import { WEEK, visitSentence } from '@/lib/data/hours-stats';
import type { VisitTimeOutput } from '@/lib/search/visit-time';

const SHORT_DAY: Record<string, string> = { sat: 'شنبه', sun: '۱شنبه', mon: '۲شنبه', tue: '۳شنبه', wed: '۴شنبه', thu: '۵شنبه', fri: 'جمعه' };

/** «کی برم؟» — share of open shops per hour (24 cells) for a selectable day, the best window and gaps. */
export function VisitTimeCard({ output }: { output: VisitTimeOutput }) {
  const [day, setDay] = useState(output.day);
  const stats = output.days.find((d) => d.day === day)!;
  const friday = output.days.find((d) => d.day === 'fri') ?? null;
  const w = stats.window;
  return (
    <section data-visit-time className="space-y-2.5 rounded-2xl border bg-card p-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <Clock3 className="size-4 text-primary" />
            کی برم؟
          </h3>
          <p className="line-clamp-1 text-[11px] text-muted-foreground">
            {output.title} · {toFaDigits(output.shops)} فروشگاه
          </p>
        </div>
      </header>
      <div role="tablist" aria-label="روز هفته" className="grid grid-cols-7 gap-1">
        {WEEK.map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === day}
            onClick={() => setDay(d)}
            className={cn('h-8 rounded-lg text-[11px]', d === day ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70')}
          >
            {SHORT_DAY[d]}
          </button>
        ))}
      </div>
      <div>
        <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }} aria-label="سهم مغازه‌های باز در هر ساعت">
          {stats.perHour.map((share, h) => (
            <span
              key={h}
              title={`ساعت ${toFaDigits(h)}:۳۰ — ${toFaDigits(Math.round(share * 100))}٪ باز`}
              className={cn('h-6 rounded-[3px] bg-primary', w && h >= w.start && h < w.end && 'outline-2 outline-offset-[-1px] outline-amber-500')}
              style={{ opacity: share > 0 ? 0.15 + share * 0.85 : 0.06 }}
            />
          ))}
        </div>
        <div className="mt-0.5 grid text-[10px] text-muted-foreground" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center">
              {h % 6 === 0 ? toFaDigits(h) : ''}
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs leading-6">{visitSentence(stats, friday, output.noun)}</p>
    </section>
  );
}
