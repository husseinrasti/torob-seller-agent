'use client';

import { useEffect, useState } from 'react';
import { Copy, Info, MessageSquareText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/lib/client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { channelLinks, INTENT_LABEL, MAX_MESSAGE, type MessageIntent } from '@/lib/sim/compose';
import type { SellerMessageOutput } from '@/lib/sim/seller-message';
import { toFaDigits } from '@/lib/fa/digits';

const INTENTS: MessageIntent[] = ['availability', 'price', 'hours', 'reserve'];

/** Editable message + links that open the user's own WhatsApp / SMS with the text (real-world contact). */
export function SellerMessageBody({ initial }: { initial: SellerMessageOutput }) {
  const [data, setData] = useState(initial);
  const [text, setText] = useState(initial.text);
  const [loading, setLoading] = useState(false);
  const switchIntent = async (intent: MessageIntent) => {
    if (intent === data.intent) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ offer_id: data.offer_id, intent });
      if (data.target_price) qs.set('target', String(data.target_price));
      const d = (await (await fetch(`/api/compose?${qs}`)).json()) as SellerMessageOutput;
      if (d.text) {
        setData(d);
        setText(d.text);
      }
    } finally {
      setLoading(false);
    }
  };
  const links = channelLinks(data.contacts, text);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('متن پیام کپی شد');
    } catch {
      toast.error('کپی نشد؛ متن را دستی انتخاب کنید.');
    }
  };
  return (
    <div data-seller-message className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="موضوع پیام">
        {INTENTS.map((it) => (
          <button
            key={it}
            onClick={() => switchIntent(it)}
            aria-pressed={data.intent === it}
            className={cn('h-8 rounded-full border px-3 text-xs', data.intent === it ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
          >
            {INTENT_LABEL[it]}
          </button>
        ))}
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE))} rows={7} disabled={loading} className="text-sm leading-7" aria-label="متن پیام" />
      <p className="text-end text-[10px] text-muted-foreground">{toFaDigits(text.length)} / {toFaDigits(MAX_MESSAGE)}</p>
      <div className="grid grid-cols-3 gap-2">
        {links.map((l) =>
          l.url ? (
            <a key={l.type} href={l.url} target="_blank" rel="noreferrer" data-channel={l.type} className="flex h-11 items-center justify-center gap-1 rounded-xl border text-xs font-medium hover:bg-muted">
              <Send className="size-4" />
              {l.label}
            </a>
          ) : (
            <button key={l.type} onClick={copy} className="flex h-11 items-center justify-center gap-1 rounded-xl bg-primary text-xs font-medium text-primary-foreground">
              <Copy className="size-4" />
              {l.label}
            </button>
          ),
        )}
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {data.disclaimer}
      </p>
    </div>
  );
}

/** Sheet opened from a seller card / follow-up row: «خودم پیام بدهم». */
export function SellerMessageSheet({ offerId, intent = 'availability', target, onClose }: { offerId: string; intent?: MessageIntent; target?: number | null; onClose: () => void }) {
  const desktop = useIsDesktop();
  const [data, setData] = useState<SellerMessageOutput | null>(null);
  useEffect(() => {
    const qs = new URLSearchParams({ offer_id: offerId, intent });
    if (target) qs.set('target', String(target));
    fetch(`/api/compose?${qs}`)
      .then((r) => r.json())
      .then((d) => d.text && setData(d))
      .catch(() => {});
  }, [offerId, intent, target]);
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side={desktop ? 'left' : 'bottom'} className={desktop ? 'w-[26rem] max-w-[90vw] overflow-y-auto sm:max-w-[26rem]' : 'mx-auto max-h-[90dvh] max-w-[520px] overflow-y-auto rounded-t-3xl'}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-1.5">
            <MessageSquareText className="size-4 text-primary" />
            خودم پیام بدهم{data ? ` — ${data.shop_name}` : ''}
          </SheetTitle>
          <SheetDescription>متن آماده از داده‌های ترب؛ ویرایش کنید و با برنامه خودتان بفرستید.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">{data ? <SellerMessageBody initial={data} /> : <Skeleton className="h-56 w-full" />}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Tool output (`compose_seller_message`) in the chat. */
export function SellerMessageCard({ output }: { output: SellerMessageOutput }) {
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-bold">
        <MessageSquareText className="size-4 text-primary" />
        پیام آماده برای «{output.shop_name}»
      </h3>
      <SellerMessageBody initial={output} />
    </section>
  );
}
