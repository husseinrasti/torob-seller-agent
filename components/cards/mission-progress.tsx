'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Circle, ListChecks, Loader2, MapPin, MinusCircle, Route, Search, Send, Store, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { faText } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { MissionProgress, MissionStepStatus } from '@/lib/agent/mission/types';

const STEP_ICON: Record<string, LucideIcon> = { understand: ListChecks, locate: MapPin, search: Search, sellers: Store, verify: Send, plan: Route, report: CheckCircle2 };

function StatusIcon({ status }: { status: MissionStepStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-4 animate-spin text-info" />;
    case 'done':
      return <CheckCircle2 className="size-4 text-fresh" />;
    case 'failed':
      return <XCircle className="size-4 text-stale" />;
    case 'skipped':
      return <MinusCircle className="size-4 text-muted-foreground" />;
    default:
      return <Circle className="size-4 text-muted-foreground/50" />;
  }
}

/** Live steps of a running mission (streamed data part); collapses to one line when the report is ready. */
export function MissionProgressCard({ progress }: { progress: MissionProgress }) {
  const [open, setOpen] = useState(!progress.done);
  useEffect(() => {
    if (progress.done) setOpen(false);
  }, [progress.done]);
  const done = progress.steps.filter((s) => s.status === 'done').length;
  const running = progress.steps.find((s) => s.status === 'running');
  return (
    <section data-mission-progress data-done={progress.done ? 'true' : 'false'} className="rounded-2xl border bg-card">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-start">
        {progress.done ? <CheckCircle2 className="size-4 shrink-0 text-fresh" /> : <Loader2 className="size-4 shrink-0 animate-spin text-info" />}
        <span className="flex-1 text-sm font-semibold">
          {progress.done ? `مأموریت انجام شد · ${toFaDigits(done)} مرحله` : `در حال انجام مأموریت… ${running ? `(${running.label})` : ''}`}
        </span>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="space-y-1.5 border-t px-3 py-2.5">
          {progress.steps.map((s) => {
            const Icon = STEP_ICON[s.id] ?? Circle;
            return (
              <li key={s.id} className={cn('flex items-start gap-2 text-xs leading-5', s.status === 'pending' && 'text-muted-foreground')}>
                <StatusIcon status={s.status} />
                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">{s.label}</span>
                  {s.detail && <span className="text-muted-foreground"> — {faText(s.detail)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
