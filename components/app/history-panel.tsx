'use client';

import { Brain, LogOut, MapPin, MessageSquare, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { faText } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { ChatSummary } from '@/lib/agent/state';
import type { UserMemory } from '@/lib/agent/memory';

function ago(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'همین الان';
  if (mins < 60) return `${toFaDigits(mins)} دقیقه پیش`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${toFaDigits(h)} ساعت پیش`;
  return `${toFaDigits(Math.floor(h / 24))} روز پیش`;
}

export type HistoryProps = {
  user: { id: string; name: string };
  chats: ChatSummary[];
  currentChatId: string;
  memory: UserMemory;
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onClearMemory: () => void;
  onLogout: () => void;
  onSearch?: (text: string) => void;
};

/** Previous chats (resumable), what the assistant remembers, and the account. */
export function HistoryPanel({ user, chats, currentChatId, memory, onNewChat, onOpenChat, onDeleteChat, onClearMemory, onLogout, onSearch }: HistoryProps) {
  const hasMemory = Boolean(memory.location || memory.searches?.length || memory.products?.length);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <Button className="h-11 w-full justify-start" onClick={onNewChat}>
          <Plus className="size-4" />
          گفتگوی تازه
        </Button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2" aria-label="گفتگوهای قبلی">
        <p className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground">گفتگوهای قبلی</p>
        {chats.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">هنوز گفتگویی ذخیره نشده. هر گفتگو بعد از اولین پیام اینجا می‌آید و می‌توانید بعداً ادامه‌اش بدهید.</p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  onClick={() => onOpenChat(c.id)}
                  aria-current={c.id === currentChatId ? 'page' : undefined}
                  className={cn(
                    'flex min-h-12 w-full items-start gap-2 rounded-xl px-2 py-2 pe-10 text-start text-sm transition hover:bg-muted',
                    c.id === currentChatId && 'bg-accent text-accent-foreground',
                  )}
                >
                  <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 font-medium">{faText(c.title)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {ago(c.updated_at)} · {toFaDigits(c.turns)} پیام
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => onDeleteChat(c.id)}
                  aria-label={`حذف «${c.title}»`}
                  className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <section className="space-y-2 border-t p-3" aria-label="حافظه">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Brain className="size-4 text-primary" />
            آنچه از شما یادم مانده
          </p>
          {hasMemory && (
            <button onClick={onClearMemory} className="tap text-[11px] text-muted-foreground underline-offset-2 hover:text-destructive hover:underline">
              پاک کردن
            </button>
          )}
        </div>
        {!hasMemory ? (
          <p className="text-[11px] leading-5 text-muted-foreground">بعد از چند جست‌وجو، محل و علاقه‌هایتان اینجا می‌آید تا گفتگوی بعدی از همان‌جا شروع شود.</p>
        ) : (
          <div className="space-y-1.5 text-[11px]">
            {memory.location && (
              <p className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="size-3.5" />
                محل معمول: <span className="text-foreground">{memory.location.label}</span>
              </p>
            )}
            {!!memory.searches?.length && (
              <div className="flex flex-wrap gap-1">
                {memory.searches.slice(0, 4).map((s) => (
                  <button
                    key={s.text}
                    onClick={() => onSearch?.(s.text)}
                    disabled={!onSearch}
                    className="inline-flex h-8 max-w-full items-center gap-1 rounded-full border bg-background px-2.5 hover:bg-muted"
                  >
                    <Search className="size-3 shrink-0" />
                    <span className="truncate">{s.text}</span>
                  </button>
                ))}
              </div>
            )}
            {!!memory.products?.length && (
              <p className="line-clamp-2 leading-5 text-muted-foreground">
                کالاهای اخیر: <span className="text-foreground">{memory.products.slice(0, 2).map((p) => faText(p.title.split('|')[0].trim())).join('، ')}</span>
              </p>
            )}
          </div>
        )}
      </section>
      <div className="flex items-center justify-between gap-2 border-t p-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{user.name.slice(0, 1)}</span>
          <span className="truncate text-sm font-medium">{user.name}</span>
        </span>
        <Button variant="ghost" size="sm" className="h-10" onClick={onLogout}>
          <LogOut className="size-4" />
          خروج
        </Button>
      </div>
    </div>
  );
}
