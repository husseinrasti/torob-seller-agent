'use client';

import { useEffect, useRef, useState } from 'react';
import { FileSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { faText } from '@/lib/fa/format';
import { useIsDesktop } from '@/lib/client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { SpecAnswerOutput } from '@/lib/agent/spec-qa';
import type { Spec } from '@/lib/search/specs';

type Full = { product_id: string; title: string; specs: Spec[] | null };

/** All registered specs of the products side by side, scrolled to (and highlighting) one key. */
function SpecSheet({ ids, focusKey, onClose }: { ids: string[]; focusKey: string; onClose: () => void }) {
  const desktop = useIsDesktop();
  const [data, setData] = useState<Full[] | null>(null);
  const focus = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    fetch(`/api/products/specs?ids=${ids.join(',')}`)
      .then((r) => r.json())
      .then((d) => setData(d.products ?? []))
      .catch(() => setData([]));
  }, [ids]);
  useEffect(() => {
    if (data) setTimeout(() => focus.current?.scrollIntoView({ block: 'center' }), 50);
  }, [data]);
  const keys: string[] = [];
  for (const p of data ?? []) for (const s of p.specs ?? []) if (s?.key && !keys.includes(s.key)) keys.push(s.key);
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side={desktop ? 'left' : 'bottom'} className={desktop ? 'w-[30rem] max-w-[92vw] overflow-y-auto sm:max-w-[30rem]' : 'mx-auto max-h-[85dvh] max-w-[560px] overflow-y-auto rounded-t-3xl'}>
        <SheetHeader>
          <SheetTitle>مشخصات ثبت‌شده</SheetTitle>
          <SheetDescription>از داده‌های ترب؛ ردیف پرسیده‌شده برجسته است.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {!data ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <table data-spec-table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground [&>th]:px-1.5 [&>th]:py-1.5 [&>th]:text-start">
                  <th>ویژگی</th>
                  {data.map((p) => (
                    <th key={p.product_id} className="line-clamp-2">
                      {faText(p.title.split('|')[0])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {keys.map((k) => (
                  <tr key={k} ref={k === focusKey ? focus : undefined} data-focus={k === focusKey ? 'true' : undefined} className={cn('align-top [&>td]:px-1.5 [&>td]:py-1.5', k === focusKey && 'bg-accent font-semibold')}>
                    <td className="text-muted-foreground">{k}</td>
                    {data.map((p) => (
                      <td key={p.product_id}>{faText(p.specs?.find((s) => s.key === k)?.value) || 'ثبت نشده'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** F8: an answer grounded in registered specs, with evidence chips «(مشخصات: NFC → دارد)». */
export function SpecAnswerCard({ output }: { output: SpecAnswerOutput }) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const title = (id: string) => output.products.find((p) => p.product_id === id)?.title ?? '';
  return (
    <section data-spec-answer className="space-y-2 rounded-2xl border bg-card p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-bold">
        <FileSearch className="size-4 text-primary" />
        از مشخصات ثبت‌شده
      </h3>
      <p className="text-sm leading-7">{faText(output.answer)}</p>
      {output.evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {output.evidence.map((e) => (
            <button
              key={e.product_id + e.key}
              onClick={() => setFocusKey(e.key)}
              className="max-w-full truncate rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              title={title(e.product_id)}
            >
              (مشخصات{output.products.length > 1 ? ` ${faText(title(e.product_id).replace(/^گوشی\s+/u, '').slice(0, 18))}` : ''}: {e.key} ← {faText(e.value.slice(0, 40))})
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{output.source === 'llm' ? 'جمع‌بندی از همین ردیف‌ها' : 'مستقیم از ردیف‌های مشخصات'} · برای دیدن جدول کامل روی هر مورد بزنید</p>
      {focusKey && <SpecSheet ids={output.products.map((p) => p.product_id)} focusKey={focusKey} onClose={() => setFocusKey(null)} />}
    </section>
  );
}
