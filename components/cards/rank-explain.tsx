'use client';

import { Trophy } from 'lucide-react';
import { toFaDigits } from '@/lib/fa/digits';
import { FACTOR_LABEL, type Weights } from '@/lib/search/score';
import type { RankExplainOutput } from '@/lib/agent/tools';

const pct = (x: number) => `${toFaDigits(Math.round(x * 100))}٪`;

/** «چرا این اول شد؟» from the row's score breakdown: each factor's share and its weight for the intent. */
export function RankExplainCard({ output }: { output: RankExplainOutput }) {
  const keys = Object.keys(FACTOR_LABEL) as Array<keyof Weights>;
  return (
    <section data-rank-explain className="space-y-2 rounded-2xl border bg-card p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-bold">
        <Trophy className="size-4 text-primary" />
        چرا «{output.shop_name}» رتبه {toFaDigits(output.rank)} شد؟
      </h3>
      {output.why.length > 0 && <p className="text-xs leading-6 text-primary">{output.why.join(' · ')}</p>}
      <div className="space-y-1">
        {keys.map((k) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-muted-foreground">{FACTOR_LABEL[k]}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(output.breakdown[k] * 100)}%` }} />
            </div>
            <span className="w-10 text-start tabular-nums">{pct(output.breakdown[k])}</span>
            <span className="w-14 text-start text-[10px] text-muted-foreground">وزن {pct(output.weights[k])}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        امتیاز کل {pct(output.breakdown.total)}
        {output.next ? ` · نفر بعد «${output.next.shop_name}» ${pct(output.next.score)}` : ''} · سهم = امتیاز آن معیار نسبت به بقیه فروشنده‌های همین فهرست
      </p>
    </section>
  );
}
