import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrCreateSession, saveState } from '@/lib/agent/state';
import { getFollowups, sessionFollowups, startFollowups } from '@/lib/sim/followups';
import { appNow } from '@/lib/data/hours';

export const dynamic = 'force-dynamic';

const Body = z.object({
  offer_ids: z.array(z.string()).min(1).max(5),
  channel: z.enum(['message', 'call']).default('message'),
  question: z.string().max(140).optional(),
});

/** POST /api/followup — start simulated follow-ups (same service as the contact_seller tool). */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  const session = await getOrCreateSession();
  const items = await startFollowups({
    sessionId: session.id,
    offerIds: parsed.data.offer_ids,
    channel: parsed.data.channel,
    question: parsed.data.question,
    now: appNow(session.state.demoTime),
  });
  const followups = { ...session.state.followups };
  for (const it of items) followups[it.offer_id] = it.status;
  await saveState(session.id, { ...session.state, followups });
  return NextResponse.json({ items });
}

/** GET /api/followup?ids=a,b — poll; due follow-ups resolve here. Without ids: this session's latest per offer. */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  const session = await getOrCreateSession();
  const items = ids.length ? await getFollowups(ids) : await sessionFollowups(session.id);
  const followups = { ...session.state.followups };
  let changed = false;
  for (const it of items) {
    if (followups[it.offer_id] !== it.status) {
      followups[it.offer_id] = it.status;
      changed = true;
    }
  }
  if (changed) await saveState(session.id, { ...session.state, followups });
  return NextResponse.json({ items });
}
