import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { loadPlan } from '@/lib/plan/service';
import { TripPlan } from '@/components/cards/trip-plan';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'برنامه مراجعه — همراه خرید',
  description: 'ترتیب مراجعه به مغازه‌ها با پاساژ، طبقه، واحد، زمان رسیدن و مسیریابی.',
};

/** Read-only, shareable visit plan. */
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await loadPlan(id);
  if (!plan) notFound();
  return (
    <main className="mx-auto min-h-dvh max-w-[520px] space-y-4 bg-background p-4">
      <header className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ShoppingBag className="size-5" />
        </span>
        <div>
          <h1 className="text-base font-bold">همراه خرید</h1>
          <p className="text-[11px] text-muted-foreground">برنامه مراجعه حضوری (فقط خواندنی)</p>
        </div>
      </header>
      <TripPlan plan={plan} planId={id} sharePath={`/plan/${id}`} />
      <p className="text-[11px] leading-5 text-muted-foreground">
        قیمت‌ها «قیمت ثبت‌شده» در ترب هستند؛ وضعیت موجودی از پیگیری شبیه‌سازی‌شده می‌آید. ساعت رسیدن با پیاده‌روی ۸۰ متر در دقیقه و ۵ دقیقه برای هر مغازه تخمین زده شده است.
      </p>
    </main>
  );
}
