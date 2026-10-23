import type { UIMessage } from 'ai';
import { z } from 'zod';
import { q } from '../db/client';
import { DEFAULT_LOCATION } from '../geo';
import { HttpError, UUID_RE } from '../http';
import { requireUser, type User } from '../auth';
import { initialStateFrom } from './memory';
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
  /** «الان توی پاساژم»: location is a mall centroid, radius 300 m (F2) */
  mode?: 'in_mall';
  mall?: { key: string; name: string };
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
  if (patch.location) {
    next.location = patch.location;
    delete next.mode; // a new place picked in the UI leaves in-mall mode
    delete next.mall;
  }
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

/** A chat: its id doubles as the session id used by follow-ups and plans. */
export type Session = { id: string; state: SessionState; user: User; exists: boolean };

/**
 * The signed-in user's chat `chatId`. Missing chats are created (owned by the user, starting from the
 * remembered location) unless `create` is false — then an unsaved default state is returned.
 */
export async function chatSession(chatId: string | null | undefined, opts: { create?: boolean } = {}): Promise<Session> {
  const user = await requireUser();
  if (!chatId || !UUID_RE.test(chatId)) throw new HttpError(400, 'شناسه گفتگو معتبر نیست');
  const [row] = await q<{ state: unknown; user_id: string | null }>('SELECT state, user_id FROM sessions WHERE id = $1', [chatId]);
  if (row) {
    if (row.user_id && row.user_id !== user.id) throw new HttpError(404, 'گفتگو پیدا نشد');
    if (!row.user_id) await q('UPDATE sessions SET user_id = $2 WHERE id = $1', [chatId, user.id]);
    return { id: chatId, state: normalize(row.state), user, exists: true };
  }
  const state = initialStateFrom(user.memory);
  if (opts.create === false) return { id: chatId, state, user, exists: false };
  await q('INSERT INTO sessions (id, user_id, state) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [chatId, user.id, JSON.stringify(state)]);
  return { id: chatId, state, user, exists: true };
}

export async function saveState(id: string, state: SessionState): Promise<void> {
  await q('UPDATE sessions SET state = $2, updated_at = now() WHERE id = $1', [id, JSON.stringify(state)]);
}

/** Title of a chat: the first thing the user typed (or tapped). */
export function chatTitle(messages: UIMessage[]): string | null {
  const first = messages.find((m) => m.role === 'user');
  const text = first?.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

export async function saveMessages(id: string, messages: UIMessage[]): Promise<void> {
  await q('UPDATE sessions SET messages = $2, title = COALESCE(title, $3), updated_at = now() WHERE id = $1', [id, JSON.stringify(messages), chatTitle(messages)]);
}

export type ChatSummary = { id: string; title: string; updated_at: string; turns: number };

export async function listChats(userId: string): Promise<ChatSummary[]> {
  return q<ChatSummary>(
    `SELECT id, COALESCE(title, 'گفتگوی بی‌عنوان') AS title, updated_at,
            (SELECT count(*)::int FROM jsonb_array_elements(messages) m WHERE m->>'role' = 'user') AS turns
       FROM sessions WHERE user_id = $1 AND jsonb_array_length(messages) > 0
      ORDER BY updated_at DESC LIMIT 60`,
    [userId],
  );
}

export async function loadChat(userId: string, id: string): Promise<{ id: string; title: string | null; state: SessionState; messages: UIMessage[] } | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await q<{ id: string; title: string | null; state: unknown; messages: UIMessage[] }>(
    'SELECT id, title, state, messages FROM sessions WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return row ? { ...row, state: normalize(row.state) } : null;
}

export async function deleteChat(userId: string, id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const rows = await q<{ id: string }>('DELETE FROM sessions WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  if (rows.length) await q('DELETE FROM followups WHERE session_id = $1', [id]);
  return rows.length > 0;
}

/** Demo helper: forget everything about one user (chats, follow-ups, memory). */
export async function wipeUser(userId: string): Promise<void> {
  await q('DELETE FROM followups WHERE session_id IN (SELECT id FROM sessions WHERE user_id = $1)', [userId]);
  await q('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await q("UPDATE users SET memory = '{}'::jsonb WHERE id = $1", [userId]);
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
    `mode: ${s.mode === 'in_mall' && s.mall ? `in_mall «${s.mall.name}» (mall_key=${s.mall.key})` : 'normal'}`,
  ].join('\n');
}
