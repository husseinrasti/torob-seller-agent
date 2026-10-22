import { cookies } from 'next/headers';
import { z } from 'zod';
import { q } from '../db/client';
import { DEFAULT_LOCATION } from '../geo';
import type { Intent } from '../search/score';

export type FollowupStatus = 'pending' | 'contacting' | 'confirmed' | 'out_of_stock' | 'price_changed' | 'no_answer';

export type SessionState = {
  need?: string;
  budget?: { min?: number; max?: number };
  mustHave: string[];
  categories: string[];
  candidates: string[];
  chosenProduct?: string;
  location: { lat: number; lon: number; label: string; source: 'gps' | 'map' | 'text' | 'default' };
  radius_m: number;
  filters: {
    open_now?: boolean;
    installment?: boolean;
    torobpay?: boolean;
    fast_delivery?: boolean;
    warranty_required?: boolean;
    hide_stale?: boolean;
    hide_suspicious?: boolean;
    max_price?: number;
  };
  intent: Intent;
  shortlist: string[];
  followups: Record<string, FollowupStatus>;
  planId?: string;
  demoTime?: string;
  checklistOffered?: boolean;
};

export const DEFAULT_STATE: SessionState = {
  mustHave: [],
  categories: [],
  candidates: [],
  location: { ...DEFAULT_LOCATION },
  radius_m: 1000,
  filters: {},
  intent: 'balanced',
  shortlist: [],
  followups: {},
};

export const SESSION_COOKIE = 'hk_sid';

const LocationSchema = z.object({
  lat: z.number().min(25).max(40),
  lon: z.number().min(44).max(64),
  label: z.string().max(80),
  source: z.enum(['gps', 'map', 'text', 'default']),
});

/** What the UI (ContextBar, chips) may change without the LLM. */
export const StatePatchSchema = z
  .object({
    location: LocationSchema,
    radius_m: z.number().int().min(100).max(20000),
    filters: z
      .object({
        open_now: z.boolean(),
        installment: z.boolean(),
        torobpay: z.boolean(),
        fast_delivery: z.boolean(),
        warranty_required: z.boolean(),
        hide_stale: z.boolean(),
        hide_suspicious: z.boolean(),
        max_price: z.number().positive().nullable(),
      })
      .partial(),
    intent: z.enum(['balanced', 'cheapest', 'nearest', 'now']),
    chosenProduct: z.string().max(64).nullable(),
    shortlist: z.array(z.string().max(64)).max(20),
    demoTime: z.string().max(32).nullable(),
    budget: z.object({ min: z.number().optional(), max: z.number().optional() }).nullable(),
  })
  .partial();

export type StatePatch = z.infer<typeof StatePatchSchema>;

/** Apply a validated partial update; `null` clears optional values. Filters merge key by key. */
export function applyPatch(state: SessionState, patch: StatePatch): SessionState {
  const next: SessionState = { ...state };
  if (patch.location) next.location = patch.location;
  if (patch.radius_m) next.radius_m = patch.radius_m;
  if (patch.intent) next.intent = patch.intent;
  if (patch.shortlist) next.shortlist = patch.shortlist;
  if (patch.chosenProduct !== undefined) next.chosenProduct = patch.chosenProduct ?? undefined;
  if (patch.demoTime !== undefined) next.demoTime = patch.demoTime ?? undefined;
  if (patch.budget !== undefined) {
    next.budget = patch.budget ?? undefined;
    next.filters = { ...next.filters, max_price: patch.budget?.max ?? undefined };
  }
  if (patch.filters) {
    const f = { ...next.filters };
    for (const [k, v] of Object.entries(patch.filters)) {
      const key = k as keyof SessionState['filters'];
      if (v === null || v === false) delete f[key];
      else (f as Record<string, unknown>)[key] = v;
    }
    next.filters = f;
    if (patch.filters.max_price !== undefined) next.budget = patch.filters.max_price ? { ...next.budget, max: patch.filters.max_price } : undefined;
  }
  return next;
}

function normalize(raw: unknown): SessionState {
  const s = (raw ?? {}) as Partial<SessionState>;
  return { ...DEFAULT_STATE, ...s, location: s.location ?? DEFAULT_STATE.location, filters: s.filters ?? {}, followups: s.followups ?? {} };
}

export type Session = { id: string; state: SessionState };

/** Reads the session cookie, creating the session row (and cookie) when missing. Route handlers only. */
export async function getOrCreateSession(): Promise<Session> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id && /^[0-9a-f-]{36}$/.test(id)) {
    const rows = await q<{ state: unknown }>('SELECT state FROM sessions WHERE id = $1', [id]);
    if (rows[0]) return { id, state: normalize(rows[0].state) };
  }
  const [row] = await q<{ id: string }>('INSERT INTO sessions (state) VALUES ($1) RETURNING id', [JSON.stringify(DEFAULT_STATE)]);
  jar.set(SESSION_COOKIE, row.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === 'production' && process.env.APP_URL?.startsWith('https') });
  return { id: row.id, state: { ...DEFAULT_STATE } };
}

export async function saveState(id: string, state: SessionState): Promise<void> {
  await q('UPDATE sessions SET state = $2, updated_at = now() WHERE id = $1', [id, JSON.stringify(state)]);
}

export async function deleteSession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id && /^[0-9a-f-]{36}$/.test(id)) {
    await q('DELETE FROM followups WHERE session_id = $1', [id]);
    await q('DELETE FROM sessions WHERE id = $1', [id]);
  }
  jar.delete(SESSION_COOKIE);
}

/** Compact one-line-per-field serialization for the system prompt. */
export function stateForPrompt(s: SessionState, extra: { productTitle?: string } = {}): string {
  const f = Object.entries(s.filters)
    .filter(([, v]) => v !== undefined && v !== false)
    .map(([k, v]) => (v === true ? k : `${k}=${v}`));
  return [
    `location: ${s.location.label} (${s.location.lat.toFixed(4)}, ${s.location.lon.toFixed(4)}, source=${s.location.source})`,
    `radius_m: ${s.radius_m}`,
    `intent: ${s.intent}`,
    `filters: ${f.length ? f.join(', ') : 'none'}`,
    `budget: ${s.budget?.max ? `max ${s.budget.max}${s.budget.min ? ` min ${s.budget.min}` : ''} toman` : 'unknown'}`,
    `chosen_product: ${s.chosenProduct ? `${s.chosenProduct}${extra.productTitle ? ` «${extra.productTitle}»` : ''}` : 'none'}`,
    `candidates: ${s.candidates.slice(0, 6).join(', ') || 'none'}`,
    `shortlist (offer_ids): ${s.shortlist.join(', ') || 'none'}`,
    `followups: ${Object.entries(s.followups).map(([o, st]) => `${o}=${st}`).join(', ') || 'none'}`,
    `checklist_offered: ${s.checklistOffered ? 'yes' : 'no'}`,
  ].join('\n');
}
