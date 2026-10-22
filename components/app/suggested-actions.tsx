'use client';

import { Zap } from 'lucide-react';
import type { Suggestion } from '@/lib/agent/suggest';
import { useChatActions } from './chat-actions';

export function SuggestedActions({ items }: { items: Suggestion[] }) {
  const { applySuggestion, busy } = useChatActions();
  if (!items.length) return null;
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pt-2">
      {items.slice(0, 6).map((s) => (
        <button
          key={s.label}
          disabled={busy && s.kind !== 'patch'}
          onClick={() => applySuggestion(s)}
          className="tap inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-accent px-3 text-xs font-medium text-accent-foreground transition hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
        >
          {s.kind === 'action' && <Zap className="size-3" />}
          {s.label}
        </button>
      ))}
    </div>
  );
}
