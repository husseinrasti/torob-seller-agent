import { cookies } from 'next/headers';
import { q } from './db/client';
import { normalizeForSearch } from './fa/normalize';
import { HttpError, UUID_RE } from './http';
import type { UserMemory } from './agent/memory';

// Name-only sign-in: there is no password. Anyone who types the same name opens the same history.
// Good enough for a demo that needs per-person chats; not an access-control mechanism.

export const USER_COOKIE = 'hk_uid';

export type User = { id: string; name: string; memory: UserMemory };

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  secure: process.env.NODE_ENV === 'production' && Boolean(process.env.APP_URL?.startsWith('https')),
});

/** Trimmed display name (2–32 chars, letters/digits/spaces) or null. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 32) return null;
  if (!/^[\p{L}\p{N}\p{M}‌ ._-]+$/u.test(name)) return null;
  return name;
}

export async function currentUser(): Promise<User | null> {
  const id = (await cookies()).get(USER_COOKIE)?.value;
  if (!id || !UUID_RE.test(id)) return null;
  const [u] = await q<User>('SELECT id, name, memory FROM users WHERE id = $1', [id]);
  return u ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'اول وارد شوید');
  return u;
}

/** Finds or creates the user by name and sets the cookie. */
export async function loginByName(rawName: unknown): Promise<User> {
  const name = cleanName(rawName);
  if (!name) throw new HttpError(400, 'نام باید بین ۲ تا ۳۲ حرف باشد');
  const key = normalizeForSearch(name);
  const [u] = await q<User>(
    `INSERT INTO users (name, name_key) VALUES ($1, $2)
     ON CONFLICT (name_key) DO UPDATE SET last_seen_at = now()
     RETURNING id, name, memory`,
    [name, key],
  );
  (await cookies()).set(USER_COOKIE, u.id, cookieOptions());
  return u;
}

export async function logout(): Promise<void> {
  (await cookies()).delete(USER_COOKIE);
}

export async function saveMemory(userId: string, memory: UserMemory): Promise<void> {
  await q('UPDATE users SET memory = $2 WHERE id = $1', [userId, JSON.stringify(memory)]);
}
