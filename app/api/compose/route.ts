import { NextResponse, type NextRequest } from 'next/server';
import { sellerMessage } from '@/lib/sim/seller-message';
import type { MessageIntent } from '@/lib/sim/compose';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

const INTENTS = new Set(['availability', 'price', 'hours', 'reserve', 'custom']);

/** GET /api/compose?offer_id&intent[&target][&note] — «خودم پیام بدهم» text and links (no LLM). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const offerId = sp.get('offer_id');
  if (!offerId) return NextResponse.json({ error: 'offer_id required' }, { status: 400 });
  const intent = (INTENTS.has(sp.get('intent') ?? '') ? sp.get('intent') : 'availability') as MessageIntent;
  const target = Number(sp.get('target'));
  try {
    return NextResponse.json(await sellerMessage({ offer_id: offerId, intent, note: sp.get('note') ?? undefined, target_price: Number.isFinite(target) && target > 0 ? target : null }));
  } catch (err) {
    return errorResponse(err);
  }
}
