import { NextResponse, type NextRequest } from 'next/server';
import { chatSession } from '@/lib/agent/state';
import { appNow } from '@/lib/data/hours';
import { isShopType } from '@/lib/data/shop-types';
import { chatIdFrom, errorResponse, HttpError } from '@/lib/http';
import { hubShops } from '@/lib/search/hubs';

export const dynamic = 'force-dynamic';

/** GET /api/hubs/shops?hub_id&families=mobile,av&offset_min (x-chat-id) — the shops of a hub at that moment. */
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const hubId = p.get('hub_id');
    if (!hubId) throw new HttpError(400, 'hub_id required');
    const session = await chatSession(chatIdFrom(req), { create: false });
    const at = new Date(appNow(session.state.demoTime).getTime() + Math.max(0, Number(p.get('offset_min') || 0)) * 60_000);
    const res = await hubShops({ hub_id: hubId, families: (p.get('families') ?? '').split(',').filter(isShopType), at });
    if (!res) throw new HttpError(404, 'این بورس پیدا نشد.');
    return NextResponse.json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
