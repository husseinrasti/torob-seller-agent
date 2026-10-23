import { NextResponse, type NextRequest } from 'next/server';
import { bargainingCard } from '@/lib/search/market';
import { chatSession } from '@/lib/agent/state';
import { appNow } from '@/lib/data/hours';
import { chatIdFrom, errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/bargain?offer_id (x-chat-id) — bargaining card for the shop sheet (no LLM). */
export async function GET(req: NextRequest) {
  const offerId = req.nextUrl.searchParams.get('offer_id');
  if (!offerId) return NextResponse.json({ error: 'offer_id required' }, { status: 400 });
  try {
    const session = await chatSession(chatIdFrom(req), { create: false });
    return NextResponse.json(await bargainingCard({ offer_id: offerId, state: session.state, now: appNow(session.state.demoTime) }));
  } catch (err) {
    return errorResponse(err);
  }
}
