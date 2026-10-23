'use client';

import { useState } from 'react';
import { Check, GitCompareArrows, MapPin, Sparkles, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { faText, formatToman, formatTomanShort } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { ProductsOutput } from '@/lib/agent/types';
import type { ProductHit } from '@/lib/search/products';
import { useChatActions } from '@/components/app/chat-actions';
import { ProductImage } from './product-image';

function ProductCard({ p, selected, onToggle, canSelect }: { p: ProductHit; selected: boolean; onToggle: () => void; canSelect: boolean }) {
  const { sendAction, busy } = useChatActions();
  const shortTitle = p.title.split('|')[0].trim();
  return (
    <article className={cn('flex w-[17rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition @2xl:w-auto', selected && 'ring-2 ring-primary')}>
      <div className="flex gap-3 p-3">
        <ProductImage src={p.image} alt={p.title} className="size-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-6" title={p.title}>
            {faText(p.title)}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{[p.brand, p.category].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="space-y-2 px-3 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {p.min_price ? (
            <span className="font-bold">از {formatToman(p.min_price)}</span>
          ) : (
            <span className="text-muted-foreground">قیمت ثبت نشده</span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Store className="size-3" />
            {toFaDigits(p.seller_count)} فروشنده
          </span>
        </div>
        {p.median_price ? <p className="text-[11px] text-muted-foreground">میانه قیمت بازار: {formatTomanShort(p.median_price)} تومان</p> : null}
        {p.budget_note === 'above_budget' && (
          <span className="inline-block rounded-full bg-recent-bg px-2 py-0.5 text-[11px] font-medium text-recent">کمی بالاتر از بودجه</span>
        )}
        {p.key_specs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.key_specs.slice(0, 4).map((s) => (
              <span key={s.k} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {s.k}: {toFaDigits(s.v)}
              </span>
            ))}
          </div>
        )}
        {p.why && (
          <p className="flex items-start gap-1 text-xs leading-5 text-primary">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" />
            {p.why}
          </p>
        )}
      </div>
      <div className="mt-auto flex gap-2 border-t p-2">
        <Button
          size="sm"
          className="h-11 flex-1"
          disabled={busy}
          onClick={() => sendAction(`فروشنده‌های نزدیکِ «${shortTitle}» را نشان بده`, 'find_sellers', { product_id: p.product_id })}
        >
          <MapPin className="size-4" />
          فروشنده‌های نزدیک
        </Button>
        <Button
          size="sm"
          variant={selected ? 'default' : 'outline'}
          className={cn('h-10', selected && 'bg-primary/90')}
          aria-pressed={selected}
          disabled={!selected && !canSelect}
          onClick={onToggle}
        >
          {selected ? <Check className="size-4" /> : <GitCompareArrows className="size-4" />}
          مقایسه
        </Button>
      </div>
    </article>
  );
}

export function ProductCards({ output }: { output: ProductsOutput }) {
  const [selected, setSelected] = useState<string[]>([]);
  const { sendAction, busy } = useChatActions();
  if (!output.products.length) {
    return <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">کالایی پیدا نشد. نام کالا، برند یا مدل را دقیق‌تر بنویسید.</div>;
  }
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-4)));
  return (
    <div className="space-y-2">
      {output.budget?.max ? (
        <p className="text-xs text-muted-foreground">
          بودجه: تا {formatTomanShort(output.budget.max)} تومان{output.budget_relaxed ? ' (گزینه کافی در بودجه نبود؛ نزدیک‌ترین‌ها آمده)' : ''}
        </p>
      ) : null}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 @2xl:mx-0 @2xl:grid @2xl:grid-cols-2 @2xl:overflow-visible @2xl:px-0">
        {output.products.map((p) => (
          <ProductCard key={p.product_id} p={p} selected={selected.includes(p.product_id)} canSelect={selected.length < 4} onToggle={() => toggle(p.product_id)} />
        ))}
      </div>
      {selected.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2">
          <span className="text-xs text-secondary-foreground">{toFaDigits(selected.length)} کالا برای مقایسه انتخاب شد{selected.length < 2 ? ' — یکی دیگر هم انتخاب کنید' : ''}</span>
          <Button
            size="sm"
            className="h-9"
            disabled={selected.length < 2 || busy}
            onClick={() => {
              sendAction(`این ${toFaDigits(selected.length)} کالا را مقایسه کن`, 'compare_products', { product_ids: selected });
              setSelected([]);
            }}
          >
            <GitCompareArrows className="size-4" />
            مقایسه کن
          </Button>
        </div>
      )}
    </div>
  );
}
