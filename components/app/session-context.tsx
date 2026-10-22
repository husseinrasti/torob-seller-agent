'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SessionState, StatePatch } from '@/lib/agent/state';
import type { Suggestion } from '@/lib/agent/suggest';
import type { SellersResult } from '@/lib/search/sellers';

type SessionCtx = {
  state: SessionState | null;
  suggestions: Suggestion[];
  llm: 'live' | 'offline' | null;
  /** optimistic update + PATCH /api/session (never calls the LLM) */
  patch: (p: StatePatch) => Promise<void>;
  refresh: () => Promise<void>;
  /** the seller list currently shown last in the chat (map + live refresh) */
  latestSellers: SellersResult | null;
  setLatestSellers: (r: SellersResult | null) => void;
  focusShop: string | null;
  setFocusShop: (id: string | null) => void;
};

const Ctx = createContext<SessionCtx | null>(null);

function optimistic(state: SessionState, p: StatePatch): SessionState {
  const next: SessionState = { ...state };
  if (p.location) next.location = p.location;
  if (p.radius_m) next.radius_m = p.radius_m;
  if (p.intent) next.intent = p.intent;
  if (p.shortlist) next.shortlist = p.shortlist;
  if (p.chosenProduct !== undefined) next.chosenProduct = p.chosenProduct ?? undefined;
  if (p.demoTime !== undefined) next.demoTime = p.demoTime ?? undefined;
  if (p.filters) {
    const f = { ...next.filters } as Record<string, unknown>;
    for (const [k, v] of Object.entries(p.filters)) {
      if (v === null || v === false) delete f[k];
      else f[k] = v;
    }
    next.filters = f as SessionState['filters'];
  }
  return next;
}

export function SessionProvider({ demoTime, children }: { demoTime: string | null; children: React.ReactNode }) {
  const [state, setState] = useState<SessionState | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [llm, setLlm] = useState<'live' | 'offline' | null>(null);
  const [latestSellers, setLatestSellers] = useState<SellersResult | null>(null);
  const [focusShop, setFocusShop] = useState<string | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/session', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setState(data.state);
    setSuggestions(data.suggestions ?? []);
    if (data.llm) setLlm(data.llm);
  }, []);

  const patch = useCallback(async (p: StatePatch) => {
    const my = ++seq.current;
    setState((s) => (s ? optimistic(s, p) : s));
    try {
      const res = await fetch('/api/session', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (my === seq.current) {
        setState(data.state);
        setSuggestions(data.suggestions ?? []);
      }
    } catch {
      toast.error('ذخیره تنظیمات ناموفق بود؛ دوباره امتحان کنید.');
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    (async () => {
      await refresh();
      // demo clock from ?demo_time= (or back to the real clock)
      await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ demoTime: demoTime ?? null }),
      }).then((r) => r.json()).then((d) => d?.state && setState(d.state)).catch(() => {});
    })();
  }, [demoTime, refresh]);

  const value = useMemo(
    () => ({ state, suggestions, llm, patch, refresh, latestSellers, setLatestSellers, focusShop, setFocusShop }),
    [state, suggestions, llm, patch, refresh, latestSellers, focusShop],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
