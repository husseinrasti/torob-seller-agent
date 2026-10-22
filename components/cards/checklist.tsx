'use client';

import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { faText } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { ChecklistOutput } from '@/lib/agent/types';

export function Checklist({ output }: { output: ChecklistOutput }) {
  const [done, setDone] = useState<boolean[]>(() => output.items.map(() => false));
  const count = done.filter(Boolean).length;
  return (
    <section className="rounded-2xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-5 text-primary" />
          <div>
            <h3 className="text-sm font-bold">چک‌لیست خرید حضوری</h3>
            {output.product_title && <p className="line-clamp-1 text-[11px] text-muted-foreground">{faText(output.product_title.split('|')[0])}</p>}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {toFaDigits(count)} از {toFaDigits(output.items.length)}
        </span>
      </header>
      <ul className="divide-y">
        {output.items.map((it, i) => (
          <li key={i}>
            <label className="flex min-h-12 cursor-pointer items-start gap-3 px-3 py-2.5 text-sm leading-6">
              <Checkbox className="mt-1" checked={done[i]} onCheckedChange={(v) => setDone((d) => d.map((x, j) => (j === i ? Boolean(v) : x)))} />
              <span className={done[i] ? 'text-muted-foreground line-through' : ''}>{it}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
