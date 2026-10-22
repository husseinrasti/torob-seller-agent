'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { FollowupStatus } from '@/lib/agent/state';
import type { Availability } from '@/components/cards/badges';

/** Client view of one simulated follow-up (filled by the FollowupBoard poller). */
export type FollowupInfo = {
  id: string;
  offer_id: string;
  shop_id: string;
  shop_name: string;
  status: FollowupStatus;
  channel: 'message' | 'call';
  new_price: number | null;
  resolved_at: string | null;
};

type Store = {
  byOffer: Record<string, FollowupInfo>;
  upsert: (items: FollowupInfo[]) => void;
  availabilityFor: (offerId: string, fallback?: FollowupStatus) => Availability;
  /** true the first time it is called for an id (auto-alternatives fire once per follow-up) */
  claimAuto: (followupId: string) => boolean;
};

const Ctx = createContext<Store | null>(null);

export function FollowupsProvider({ children }: { children: React.ReactNode }) {
  const [byOffer, setByOffer] = useState<Record<string, FollowupInfo>>({});
  const upsert = useCallback((items: FollowupInfo[]) => {
    setByOffer((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const it of items) {
        const old = prev[it.offer_id];
        if (!old || old.status !== it.status || old.id !== it.id || old.resolved_at !== it.resolved_at) {
          next[it.offer_id] = it;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);
  const availabilityFor = useCallback(
    (offerId: string, fallback?: FollowupStatus): Availability => {
      const f = byOffer[offerId];
      if (f) return { status: f.status, at: f.resolved_at, newPrice: f.new_price };
      return { status: fallback ?? 'unverified' };
    },
    [byOffer],
  );
  const claimed = useRef(new Set<string>());
  const claimAuto = useCallback((id: string) => {
    if (claimed.current.has(id)) return false;
    claimed.current.add(id);
    return true;
  }, []);
  const value = useMemo(() => ({ byOffer, upsert, availabilityFor, claimAuto }), [byOffer, upsert, availabilityFor, claimAuto]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFollowups(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFollowups outside provider');
  return v;
}
