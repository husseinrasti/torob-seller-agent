'use client';

import { useState } from 'react';
import { Building2, Clock3, Crosshair, History, ListChecks, Map as MapIcon, MessageSquare, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HERO_CHIPS, MISSION_EXAMPLE } from '@/lib/agent/suggest';
import { faText } from '@/lib/fa/format';
import type { UserMemory } from '@/lib/agent/memory';
import type { ChatSummary } from '@/lib/agent/state';
import { useChatActions } from './chat-actions';
import { useSession } from './session-context';
import { LocationSheet } from './sheets/location-sheet';

export function Hero({
  name,
  memory,
  recentChats = [],
  onOpenChat,
}: {
  name?: string;
  memory?: UserMemory;
  recentChats?: ChatSummary[];
  onOpenChat?: (id: string) => void;
}) {
  const { sendText, busy } = useChatActions();
  const { state, patch } = useSession();
  const [pickOpen, setPickOpen] = useState(false);

  const gps = () => {
    if (!('geolocation' in navigator)) return toast.error('مرورگر شما موقعیت‌یابی را پشتیبانی نمی‌کند.');
    navigator.geolocation.getCurrentPosition(
      (p) => patch({ location: { lat: p.coords.latitude, lon: p.coords.longitude, label: 'موقعیت من', source: 'gps' } }),
      () => toast.error('دسترسی به موقعیت داده نشد؛ از «انتخاب روی نقشه» استفاده کنید.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <section className="space-y-6 pt-4">
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold leading-10">
          {name ? `سلام ${name}! ` : ''}چی می‌خوای بخری؟
          <br />
          <span className="text-primary">نزدیک‌ترین مغازه‌ای که دارد را پیدا می‌کنم.</span>
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          کالا را با هم انتخاب می‌کنیم، فروشنده‌های اطرافت را با قیمت، تازگی قیمت، فاصله و ساعت کاری مقایسه می‌کنیم، موجودی را پیگیری می‌کنم و مسیر پاساژ تا طبقه و واحد را می‌چینم.
        </p>
      </div>

      {(recentChats.length > 0 || !!memory?.searches?.length) && (
        <div className="space-y-2 rounded-2xl border bg-card p-3">
          <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <History className="size-3.5" />
            از جایی که مانده بودیم
          </p>
          {recentChats.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenChat?.(c.id)}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-start text-sm hover:bg-muted"
            >
              <MessageSquare className="size-4 shrink-0 text-primary" />
              <span className="line-clamp-1 flex-1">ادامه «{faText(c.title)}»</span>
            </button>
          ))}
          {!!memory?.searches?.length && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {memory.searches.slice(0, 4).map((s) => (
                <button
                  key={s.text}
                  disabled={busy}
                  onClick={() => sendText(s.text)}
                  className="inline-flex h-9 max-w-full items-center gap-1 rounded-full border bg-background px-3 text-xs hover:bg-muted"
                >
                  <Search className="size-3 shrink-0" />
                  <span className="truncate">{s.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Sparkles className="size-3.5" />
          از یکی از این‌ها شروع کن:
        </p>
        <div className="grid gap-2 @xl:grid-cols-2">
          {HERO_CHIPS.map((t) => (
            <button
              key={t}
              disabled={busy}
              onClick={() => sendText(t)}
              className="min-h-12 rounded-2xl border bg-card px-4 py-3 text-start text-sm font-medium shadow-xs transition hover:border-primary hover:bg-accent active:scale-[0.99] disabled:opacity-60"
            >
              {t}
            </button>
          ))}
          <button
            disabled={busy}
            onClick={() => sendText(MISSION_EXAMPLE)}
            data-mission-chip
            className="min-h-12 rounded-2xl border border-primary/40 bg-accent/60 px-4 py-3 text-start text-sm shadow-xs transition hover:border-primary hover:bg-accent active:scale-[0.99] disabled:opacity-60 @xl:col-span-2"
          >
            <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-primary">
              <ListChecks className="size-3.5" />
              مأموریت چندمرحله‌ای — خودش تا آخر انجام می‌دهد
            </span>
            <span className="leading-6">{MISSION_EXAMPLE}</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          محل فعلی: <span className="font-semibold text-foreground">{state?.location.label ?? '…'}</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={gps}>
            <Crosshair className="size-4" />
            موقعیت من
          </Button>
          <Button variant="outline" className="h-11" onClick={() => setPickOpen(true)}>
            <MapIcon className="size-4" />
            انتخاب روی نقشه
          </Button>
        </div>
      </div>

      <ul className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
        <li className="space-y-1 rounded-xl bg-muted/60 p-2">
          <Building2 className="mx-auto size-4 text-primary" />
          پاساژ، طبقه و واحد
        </li>
        <li className="space-y-1 rounded-xl bg-muted/60 p-2">
          <Clock3 className="mx-auto size-4 text-primary" />
          تازگی قیمت و ساعت کاری
        </li>
        <li className="space-y-1 rounded-xl bg-muted/60 p-2">
          <ShieldCheck className="mx-auto size-4 text-primary" />
          پیگیری موجودی
        </li>
      </ul>
      <LocationSheet open={pickOpen} onOpenChange={setPickOpen} />
    </section>
  );
}
