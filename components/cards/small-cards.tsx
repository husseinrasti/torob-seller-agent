'use client';

import { MapPin, Settings2, TriangleAlert } from 'lucide-react';
import type { ClarifyOutput, ContextOutput } from '@/lib/agent/types';
import { useChatActions } from '@/components/app/chat-actions';

export function ClarifyChips({ output, isLast }: { output: ClarifyOutput; isLast: boolean }) {
  const { sendText, busy } = useChatActions();
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-3">
      <p className="text-sm font-medium">{output.question}</p>
      <div className="flex flex-wrap gap-2">
        {output.chips.map((c) => (
          <button
            key={c}
            disabled={busy || !isLast}
            onClick={() => sendText(c)}
            className="h-11 rounded-full border bg-background px-4 text-sm transition hover:bg-muted disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ContextNote({ output }: { output: ContextOutput }) {
  return (
    <div className="space-y-1.5">
      {output.changes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {output.changes.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
              {c.startsWith('📍') ? <MapPin className="size-3" /> : <Settings2 className="size-3" />}
              {c.replace('📍 ', '')}
            </span>
          ))}
        </div>
      )}
      {output.unresolved_location && (
        <p className="flex items-center gap-1 text-xs text-recent">
          <TriangleAlert className="size-3.5" />
          محل «{output.unresolved_location}» در داده‌ها نیست؛ از «موقعیت من» یا انتخاب روی نقشه استفاده کنید.
        </p>
      )}
    </div>
  );
}

export function ToolError({ text }: { text?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{text || 'این مرحله انجام نشد.'}</span>
    </div>
  );
}
