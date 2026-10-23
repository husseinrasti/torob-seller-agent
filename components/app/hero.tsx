'use client';

import { Building2, Camera, ChevronDown, History, ListChecks, MessageSquare, Moon, Search, ShoppingBasket } from 'lucide-react';
import { HERO_CHIPS, HERO_NEW, HERO_NIGHT, MISSION_EXAMPLE } from '@/lib/agent/suggest';
import { faText } from '@/lib/fa/format';
import type { UserMemory } from '@/lib/agent/memory';
import type { ChatSummary } from '@/lib/agent/state';
import { useChatActions } from './chat-actions';

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
  const chip = 'min-h-12 w-full rounded-2xl bg-muted/60 px-4 py-3 text-start text-sm transition hover:bg-accent active:scale-[0.99] disabled:opacity-60';

  return (
    <section className="space-y-8 pt-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold leading-10">{name ? `سلام ${name}! ` : ''}چی می‌خوای بخری؟</h2>
        <p className="text-sm leading-6 text-muted-foreground">نزدیک‌ترین جایی که دارد — و الان باز است — را روی نقشه نشانت می‌دهم.</p>
      </div>

      {(recentChats.length > 0 || !!memory?.searches?.length) && (
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <History className="size-3.5" />
            از جایی که مانده بودیم
          </p>
          {recentChats.map((c) => (
            <button key={c.id} onClick={() => onOpenChat?.(c.id)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-start text-sm hover:bg-muted">
              <MessageSquare className="size-4 shrink-0 text-primary" />
              <span className="line-clamp-1 flex-1">ادامه «{faText(c.title)}»</span>
            </button>
          ))}
          {!!memory?.searches?.length && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {memory.searches.slice(0, 3).map((s) => (
                <button key={s.text} disabled={busy} onClick={() => sendText(s.text)} className="inline-flex h-9 max-w-full items-center gap-1 rounded-full bg-muted/60 px-3 text-xs hover:bg-muted">
                  <Search className="size-3 shrink-0" />
                  <span className="truncate">{s.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* at most three examples; the rest behind «نمونه‌های بیشتر» */}
      <div className="space-y-2">
        <button data-hero-chip disabled={busy} onClick={() => sendText(HERO_CHIPS[0])} className={chip}>
          {HERO_CHIPS[0]}
        </button>
        <button data-hero-chip data-hero-night disabled={busy} onClick={() => sendText(HERO_NIGHT)} className={chip}>
          <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-primary">
            <Moon className="size-3.5" />
            وقتی همه‌جا بسته است
          </span>
          {HERO_NIGHT}
        </button>
        <button data-hero-chip data-mission-chip disabled={busy} onClick={() => sendText(MISSION_EXAMPLE)} className={chip}>
          <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-primary">
            <ListChecks className="size-3.5" />
            یک پیام، تا آخر کار
          </span>
          <span className="line-clamp-2 leading-6">{MISSION_EXAMPLE}</span>
        </button>
        <details className="group">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground">
            نمونه‌های بیشتر
            <ChevronDown className="size-3.5 transition group-open:rotate-180" />
          </summary>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {HERO_CHIPS.slice(1).map((t) => (
              <button key={t} disabled={busy} onClick={() => sendText(t)} className="inline-flex h-9 items-center rounded-full bg-muted/60 px-3 text-xs hover:bg-muted">
                {t}
              </button>
            ))}
            {HERO_NEW.map((t, i) => (
              <button key={t} disabled={busy} data-hero-new={i === 0 ? 'mall' : 'basket'} onClick={() => sendText(t)} className="inline-flex h-9 items-center gap-1 rounded-full bg-muted/60 px-3 text-xs hover:bg-muted">
                {i === 0 ? <Building2 className="size-3.5 text-primary" /> : <ShoppingBasket className="size-3.5 text-primary" />}
                {t}
              </button>
            ))}
          </div>
        </details>
      </div>

      <p data-camera-hint className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Camera className="size-3.5 text-primary" />
        عکس جعبه یا برچسب قیمت داری؟ دکمه‌ی دوربین کنار کادر پیام را بزن.
      </p>
    </section>
  );
}
