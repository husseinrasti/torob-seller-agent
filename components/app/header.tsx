'use client';

import { Map as MapIcon, Moon, RotateCcw, ShoppingBag, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { localClock, FA_DAY, parseDemoTime } from '@/lib/data/hours';
import { toFaDigits } from '@/lib/fa/digits';
import { useSession } from './session-context';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function demoLabel(demoTime: string | undefined): string | null {
  const d = parseDemoTime(demoTime);
  if (!d) return null;
  const { dayIdx, minutes } = localClock(d);
  return `${FA_DAY[DAY_KEYS[dayIdx]]} ${toFaDigits(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)}`;
}

export function Header({ mapOpen, onToggleMap, onNewChat, hasMessages }: { mapOpen: boolean; onToggleMap: () => void; onNewChat: () => void; hasMessages: boolean }) {
  const { state, llm } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const demo = demoLabel(state?.demoTime);
  return (
    <div className="flex h-14 items-center justify-between gap-2 px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ShoppingBag className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-5">همراه خرید</h1>
          {demo || llm === 'offline' ? (
            <p className="flex items-center gap-1 text-[10px] leading-4">
              {demo && <span className="whitespace-nowrap rounded bg-info-bg px-1 text-info">دمو · {demo}</span>}
              {llm === 'offline' && <span className="whitespace-nowrap rounded bg-muted px-1 text-muted-foreground">حالت آفلاین</span>}
            </p>
          ) : (
            <p className="truncate text-[11px] leading-4 text-muted-foreground">دستیار خرید حضوری تهران</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label="تغییر حالت روشن و تیره"
        >
          <Sun className="hidden size-4 dark:block" />
          <Moon className="size-4 dark:hidden" />
        </Button>
        {hasMessages && (
          <Button variant="ghost" size="icon" className="size-11" onClick={onNewChat} aria-label="گفتگوی تازه">
            <RotateCcw className="size-4" />
          </Button>
        )}
        <Button variant={mapOpen ? 'default' : 'outline'} size="sm" className={cn('h-11 gap-1.5')} onClick={onToggleMap} aria-pressed={mapOpen}>
          <MapIcon className="size-4" />
          نقشه
        </Button>
      </div>
    </div>
  );
}
