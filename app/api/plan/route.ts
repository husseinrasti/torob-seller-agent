import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrCreateSession, saveState } from '@/lib/agent/state';
import { buildPlan } from '@/lib/plan/service';
import { appNow } from '@/lib/data/hours';

export const dynamic = 'force-dynamic';

/** POST /api/plan {offer_ids?} — build and persist a visit plan (same service as the plan_trip tool). */
export async function POST(req: NextRequest) {
  const body = z.object({ offer_ids: z.array(z.string()).max(8).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  const session = await getOrCreateSession();
  const res = await buildPlan({ sessionId: session.id, state: session.state, now: appNow(session.state.demoTime), offerIds: body.data.offer_ids });
  if (!res) return NextResponse.json({ error: 'هنوز فروشنده‌ای برای برنامه انتخاب نشده است.' }, { status: 422 });
  await saveState(session.id, { ...session.state, planId: res.plan_id });
  return NextResponse.json({ plan_id: res.plan_id, share_path: `/plan/${res.plan_id}`, ...res.payload });
}
