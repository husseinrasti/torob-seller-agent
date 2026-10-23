'use client';

import { useState } from 'react';
import { AtSign, Check, Clock, CreditCard, ExternalLink, Layers, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toFaDigits } from '@/lib/fa/digits';
import { paymentWording, type PaymentOption, type Trust } from '@/lib/data/trust';

/** «کامل بودن اطلاعات» as three dots; tapping shows why (it is not a rating of the shop). */
export function TrustDots({ trust, className, compact }: { trust: Trust; className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('text-[11px]', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={trust.reasons.map((r) => r.label).join(' · ')}
        aria-label={`کامل بودن اطلاعات ${toFaDigits(trust.score)} از ۳`}
        className="tap inline-flex h-7 items-center gap-1.5 rounded-full text-muted-foreground"
        data-trust={trust.score}
      >
        <span className="inline-flex gap-0.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn('size-2 rounded-full', i < trust.score ? 'bg-primary' : 'bg-muted-foreground/25')} />
          ))}
        </span>
        {!compact && (
          <>
            کامل بودن اطلاعات {toFaDigits(trust.score)} از ۳
            <span className="text-primary underline underline-offset-2">چرا؟</span>
          </>
        )}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 rounded-lg bg-muted/60 p-2">
          {compact && <li className="font-medium">کامل بودن اطلاعات {toFaDigits(trust.score)} از ۳</li>}
          {trust.reasons.map((r) => (
            <li key={r.key} className="flex items-center gap-1.5">
              {r.ok ? <Check className="size-3 text-fresh" /> : <X className="size-3 text-muted-foreground" />}
              {r.label}
            </li>
          ))}
          <li className="pt-0.5 text-muted-foreground">این عدد فقط کامل بودن اطلاعات ثبت‌شده در ترب است، نه کیفیت فروشگاه.</li>
        </ul>
      )}
    </div>
  );
}

/** «وب‌سایت» / «اینستاگرام» buttons (open in a new tab) when the dataset has them. */
export function TrustLinks({ trust }: { trust: Trust }) {
  if (!trust.website_url && !trust.instagram_url) return null;
  const cls = 'inline-flex h-8 items-center gap-1 rounded-full border bg-background px-2.5 text-[11px] text-primary hover:bg-muted';
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {trust.website_url && (
        <a href={trust.website_url} target="_blank" rel="noreferrer" className={cls} onClick={(e) => e.stopPropagation()}>
          <ExternalLink className="size-3.5" />
          وب‌سایت
        </a>
      )}
      {trust.instagram_url && (
        <a href={trust.instagram_url} target="_blank" rel="noreferrer" className={cls} onClick={(e) => e.stopPropagation()}>
          <AtSign className="size-3.5" />
          اینستاگرام
        </a>
      )}
    </span>
  );
}

/** Hours known · credit-payment channel · other products in this category. */
export function ShopFacts({ hoursKnown, payment, sameCategory }: { hoursKnown: boolean; payment: PaymentOption[]; sameCategory: number | null }) {
  const pay = paymentWording(payment);
  return (
    <ul className="space-y-0.5 text-[11px] leading-5 text-muted-foreground">
      <li className="flex items-center gap-1">
        <Clock className="size-3" />
        {hoursKnown ? 'ساعت کاری ثبت‌شده' : 'ساعت کاری ثبت نشده'}
      </li>
      {pay.map((line) => (
        <li key={line} className="flex items-center gap-1" data-payment>
          <CreditCard className="size-3 shrink-0" />
          {line}
        </li>
      ))}
      {sameCategory !== null && sameCategory > 0 && (
        <li className="flex items-center gap-1">
          <Layers className="size-3" />
          این فروشگاه {toFaDigits(sameCategory)} محصول دیگر در همین دسته دارد
        </li>
      )}
    </ul>
  );
}
