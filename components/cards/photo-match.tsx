'use client';

import { useState } from 'react';
import { Camera, Check, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { faText, formatDistance, formatToman, formatTomanShort } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { PhotoMatchOutput } from '@/lib/vision/photo-match';
import { useChatActions } from '@/components/app/chat-actions';
import { ProductImage } from './product-image';
import { POSITION } from './bargain';
import { MissionResultCard } from './mission-result';

const focusComposer = () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="پیام به همراه خرید"]')?.focus();

/** F1: what the photo shows → the top 3 products («همین است» / «نه، این نیست»), a shelf price against the market. */
export function PhotoMatchCard({ output, toolCallId }: { output: PhotoMatchOutput; toolCallId: string }) {
  const { sendAction, busy } = useChatActions();
  const [idx, setIdx] = useState(0);
  const c = output.candidates[idx];
  const exhausted = output.recognized && idx >= output.candidates.length;
  const shelf = output.shelf;
  const pos = shelf?.position ? POSITION[shelf.position] : null;

  return (
    <section data-photo-match={output.recognized ? 'recognized' : 'unknown'} className="space-y-2.5 rounded-2xl border bg-card p-3">
      <header>
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Camera className="size-4 text-primary" />
          جستجو با عکس
        </h3>
        {output.label && <p className="text-xs text-muted-foreground">در عکس: {output.label}</p>}
      </header>

      {!output.recognized || !output.candidates.length || exhausted ? (
        <div className="space-y-2 rounded-xl bg-muted/60 p-3 text-sm">
          <p data-photo-message>{exhausted ? 'پس اسمش را بنویسید تا دقیق پیدا کنم.' : output.message}</p>
          <Button size="sm" variant="outline" className="h-9 bg-background" onClick={focusComposer}>
            نوشتن اسم کالا
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-3 rounded-xl border p-2.5" data-photo-candidate={idx + 1}>
            <ProductImage src={c.image} alt={c.title} className="size-16 shrink-0" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="line-clamp-2 text-sm font-semibold">{faText(c.title.split('|')[0])}</p>
              <p className="text-[11px] text-muted-foreground">
                {c.median_price ? `میانه قیمت ${formatTomanShort(c.median_price)} تومان` : 'قیمت ثبت نشده'} · {toFaDigits(c.seller_count)} فروشنده در ترب
              </p>
              {output.candidates.length > 1 && <p className="text-[11px] text-muted-foreground">گزینه {toFaDigits(idx + 1)} از {toFaDigits(output.candidates.length)}</p>}
            </div>
          </div>
          {!output.mission && (
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" className="h-11" disabled={busy} data-photo-yes onClick={() => sendAction(`همین است؛ فروشنده‌های نزدیکِ «${c.title.split('|')[0].trim()}» را نشان بده`, 'find_sellers', { product_id: c.product_id })}>
                <Check className="size-4" />
                همین است
              </Button>
              <Button size="sm" variant="outline" className="h-11" data-photo-no onClick={() => setIdx((i) => i + 1)}>
                <X className="size-4" />
                نه، این نیست
              </Button>
            </div>
          )}
        </div>
      )}

      {shelf && (
        <div data-shelf-price className="space-y-1.5 rounded-xl border border-dashed p-2.5 text-xs">
          <p className="flex flex-wrap items-center gap-1.5">
            قیمت روی برچسب: <span className="font-bold">{formatToman(shelf.price)}</span>
            {pos && shelf.delta_pct !== null && (
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', pos.cls)}>
                {shelf.position === 'near_median' ? pos.label : `${toFaDigits(Math.abs(Math.round(shelf.delta_pct)))}٪ ${pos.label}`}
              </span>
            )}
          </p>
          {shelf.implausible && <p className="text-recent">این عدد با قیمت‌های بازار جور نیست؛ شاید درست خوانده نشده — برچسب را دوباره ببینید.</p>}
          {shelf.stats && (
            <p className="text-muted-foreground">
              بازار «{faText(shelf.product_title)}»: از {formatTomanShort(shelf.stats.min)} تا {formatTomanShort(shelf.stats.max)} · میانه {formatTomanShort(shelf.stats.median)} تومان ({toFaDigits(shelf.stats.n)} قیمت)
            </p>
          )}
          {shelf.nearby.length > 0 ? (
            <>
              <p className="font-medium">{shelf.implausible ? 'ارزان‌ترین فروشنده‌های نزدیک:' : shelf.cheaper_nearby ? `${toFaDigits(shelf.cheaper_nearby)} فروشنده‌ی نزدیک ارزان‌تر ثبت کرده‌اند:` : 'فروشنده‌های نزدیک (هیچ‌کدام ارزان‌تر نیست):'}</p>
              <ul className="space-y-0.5">
                {shelf.nearby.map((n) => (
                  <li key={n.offer_id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {n.shop_name}
                      <span className="text-muted-foreground"> · {[n.mall, formatDistance(n.distance_m)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={cn('shrink-0 font-semibold', !shelf.implausible && n.price < shelf.price && 'text-fresh')}>{formatToman(n.price)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">در این شعاع فروشنده‌ای برای این کالا ثبت نشده.</p>
          )}
        </div>
      )}

      <p className="flex items-start gap-1 text-[11px] leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        {output.privacy}
      </p>

      {/* nested report: its live updates must not replace this card's output */}
      {output.mission && <MissionResultCard output={output.mission} toolCallId={`${toolCallId}:mission`} />}
    </section>
  );
}
