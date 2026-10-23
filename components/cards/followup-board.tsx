'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronDown, Info, ListPlus, MessageCircle, PhoneCall, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatToman, faText } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { FollowupsOutput } from '@/lib/agent/types';
import type { FollowupItem } from '@/lib/sim/followups';
import { useChatActions } from '@/components/app/chat-actions';
import { useFollowups } from '@/components/app/followups-store';
import { useSession } from '@/components/app/session-context';
import { AvailabilityBadge } from './badges';

const resolved = (i: FollowupItem) => i.status !== 'contacting' && i.status !== 'pending';

function Transcript({ item }: { item: FollowupItem }) {
  if (!item.transcript?.length) return null;
  return (
    <Collapsible defaultOpen={item.status === 'out_of_stock' || item.status === 'price_changed'}>
      <CollapsibleTrigger className="tap flex h-8 items-center gap-1 text-xs text-primary">
        <ChevronDown className="size-3.5" />
        متن {item.channel === 'call' ? 'تماس' : 'گفتگو'}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-1 space-y-1.5">
          {item.transcript.map((l, i) => (
            <li
              key={i}
              className={cn(
                'max-w-[90%] rounded-2xl px-3 py-1.5 text-xs leading-5',
                l.from === 'seller' ? 'me-auto rounded-es-md bg-muted' : l.from === 'agent' ? 'ms-auto rounded-ee-md bg-secondary text-secondary-foreground' : 'mx-auto bg-transparent text-muted-foreground',
              )}
            >
              {l.from !== 'system' && <span className="block text-[10px] text-muted-foreground">{l.from === 'agent' ? 'همراه خرید' : item.shop_name}</span>}
              {faText(l.text)}
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Row({ item }: { item: FollowupItem }) {
  const { sendAction, busy } = useChatActions();
  const { state, patch } = useSession();
  const done = resolved(item);
  const inPlan = state?.shortlist.includes(item.offer_id) ?? false;
  return (
    <li className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            {item.channel === 'call' ? <PhoneCall className="size-4 text-muted-foreground" /> : <MessageCircle className="size-4 text-muted-foreground" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.shop_name}</p>
            <p className="text-[11px] text-muted-foreground">{item.old_price ? `قیمت ثبت‌شده ${formatToman(item.old_price)}` : 'قیمت ثبت نشده'}</p>
          </div>
        </div>
        {done ? <AvailabilityBadge a={{ status: item.status, at: item.resolved_at, newPrice: item.new_price }} /> : <AvailabilityBadge a={{ status: 'contacting' }} />}
      </div>
      {!done && (
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}
      {done && <Transcript item={item} />}
      {done && (item.status === 'out_of_stock' || item.status === 'no_answer') && (
        <Button
          size="sm"
          variant="outline"
          className="h-11 w-full"
          disabled={busy}
          onClick={() => sendAction(`برای «${item.shop_name}» جایگزین پیدا کن`, 'find_alternatives', { offer_id: item.offer_id, reason: item.status })}
        >
          <Search className="size-4" />
          جایگزین پیدا کن
        </Button>
      )}
      {done && item.status === 'price_changed' && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            className="h-11"
            disabled={inPlan}
            onClick={() => {
              if (!state) return;
              patch({ shortlist: [...state.shortlist, item.offer_id] });
              toast.success(`با قیمت جدید ${formatToman(item.new_price)} به برنامه اضافه شد`);
            }}
          >
            <BadgeCheck className="size-4" />
            {inPlan ? 'در برنامه' : 'قبول قیمت جدید'}
          </Button>
          <Button size="sm" variant="outline" className="h-11" disabled={busy} onClick={() => sendAction(`برای «${item.shop_name}» جایگزین پیدا کن`, 'find_alternatives', { offer_id: item.offer_id, reason: 'price_changed' })}>
            <Search className="size-4" />
            جایگزین
          </Button>
        </div>
      )}
      {done && item.status === 'confirmed' && !inPlan && state && (
        <Button size="sm" variant="secondary" className="h-11 w-full" onClick={() => patch({ shortlist: [...state.shortlist, item.offer_id] })}>
          <ListPlus className="size-4" />
          افزودن به برنامه مراجعه
        </Button>
      )}
    </li>
  );
}

/** Live board of simulated follow-ups (polls every second until all replies arrive). */
export function FollowupBoard({ output, toolCallId }: { output: FollowupsOutput; toolCallId: string; isLastMessage?: boolean }) {
  const [items, setItems] = useState<FollowupItem[]>(output.items);
  const { upsert, claimAuto } = useFollowups();
  const { sendAction, busy, updateToolOutput } = useChatActions();
  const { refresh, api } = useSession();
  const synced = useRef(false);
  // replies that were already in when this board mounted (a resumed chat) must not trigger alternatives again
  const resolvedAtMount = useRef(new Set(output.items.filter(resolved).map((i) => i.id)));
  const allDone = items.length > 0 && items.every(resolved);

  useEffect(() => {
    upsert(items);
  }, [items, upsert]);

  useEffect(() => {
    if (allDone) return;
    let stop = false;
    const t = setInterval(async () => {
      try {
        const r = await api(`/api/followup?ids=${items.map((i) => i.id).join(',')}`);
        const d = await r.json();
        if (!stop && d.items) setItems(d.items);
      } catch {
        // keep polling
      }
    }, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [allDone, items, api]);

  // once everything is back: let the agent see the outcomes, refresh suggestions (plan, …)
  useEffect(() => {
    if (!allDone || synced.current) return;
    synced.current = true;
    updateToolOutput(toolCallId, { ...output, items });
    refresh();
  }, [allDone, items, output, toolCallId, updateToolOutput, refresh]);

  // out of stock → ask for alternatives automatically (once per follow-up)
  useEffect(() => {
    if (busy) return;
    const oos = items.find((i) => i.status === 'out_of_stock' && !resolvedAtMount.current.has(i.id));
    if (!oos || !claimAuto(oos.id)) return;
    sendAction(`«${oos.shop_name}» این کالا را ندارد؛ جایگزین پیدا کن`, 'find_alternatives', { offer_id: oos.offer_id, reason: 'out_of_stock' }, { auto: true });
  }, [items, busy, claimAuto, sendAction]);

  const counts = {
    confirmed: items.filter((i) => i.status === 'confirmed').length,
    oos: items.filter((i) => i.status === 'out_of_stock').length,
    changed: items.filter((i) => i.status === 'price_changed').length,
  };

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b p-3">
        <div>
          <h3 className="text-sm font-bold">تابلو پیگیری</h3>
          <p className="text-[11px] text-muted-foreground">
            {allDone
              ? `${toFaDigits(counts.confirmed)} تأیید · ${toFaDigits(counts.oos)} ناموجود · ${toFaDigits(counts.changed)} قیمت جدید`
              : `در حال پیگیری ${toFaDigits(items.filter((i) => !resolved(i)).length)} فروشنده…`}
          </p>
        </div>
        {items[0]?.product_title && <span className="line-clamp-1 max-w-[45%] text-[11px] text-muted-foreground">{faText(items[0].product_title.split('|')[0])}</span>}
      </header>
      <ul className="divide-y">
        {items.map((i) => (
          <Row key={i.id} item={i} />
        ))}
      </ul>
      <p className="flex items-start gap-1.5 border-t bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {output.disclaimer}
      </p>
    </section>
  );
}
