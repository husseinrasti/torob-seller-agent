'use client';

import { MapPin } from 'lucide-react';
import { faText } from '@/lib/fa/format';
import { Button } from '@/components/ui/button';
import type { CompareOutput } from '@/lib/agent/types';
import { useChatActions } from '@/components/app/chat-actions';
import { ProductImage } from './product-image';

/** Differing specs only, sticky first column, «انتخاب» per product (spec §9.2). */
export function CompareTable({ output }: { output: CompareOutput }) {
  const { sendAction, busy } = useChatActions();
  const cols = output.products;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="no-scrollbar overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 w-28 bg-card p-2 text-start align-bottom font-medium text-muted-foreground">مشخصه</th>
              {cols.map((p) => (
                <th key={p.product_id} className="w-40 border-s p-2 text-start align-top font-normal">
                  <ProductImage src={p.image} alt={p.title} className="mb-1.5 size-14" />
                  <span className="line-clamp-3 text-xs font-semibold leading-5">{faText(p.title)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {output.rows.map((r, i) => (
              <tr key={r.key} className={i % 2 ? 'bg-card' : 'bg-muted'}>
                <th className={`sticky start-0 z-10 p-2 text-start font-medium text-muted-foreground ${i % 2 ? 'bg-card' : 'bg-muted'}`}>{r.key}</th>
                {r.values.map((v, j) => (
                  <td key={j} className="border-s p-2 align-top leading-5">
                    {v ?? <span className="text-muted-foreground">ثبت نشده</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th className="sticky start-0 z-10 bg-card p-2" />
              {cols.map((p) => (
                <td key={p.product_id} className="border-s p-2">
                  <Button
                    size="sm"
                    className="h-11 w-full"
                    disabled={busy}
                    onClick={() => sendAction(`«${p.title.split('|')[0].trim()}» را انتخاب کردم؛ فروشنده‌های نزدیک را نشان بده`, 'find_sellers', { product_id: p.product_id })}
                  >
                    <MapPin className="size-4" />
                    انتخاب
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
