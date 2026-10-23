import { NextResponse } from 'next/server';
import { z } from 'zod';
import { chatSession } from '@/lib/agent/state';
import { appNow } from '@/lib/data/hours';
import { isShopType } from '@/lib/data/shop-types';
import { chatIdFrom, errorResponse, HttpError } from '@/lib/http';
import { decideWhereToBuy } from '@/lib/search/decide-data';

export const dynamic = 'force-dynamic';

const Body = z.object({
  need: z.object({ label: z.string().max(80), categories: z.array(z.string().max(120)).max(3), product_id: z.string().max(64).nullable().optional(), families: z.array(z.string()).max(4) }),
  location: z.object({ lat: z.number().min(25).max(40), lon: z.number().min(44).max(64), label: z.string().max(80) }).optional(),
  /** minutes after the app clock (time scrubber), 0 = now */
  offset_min: z.number().int().min(0).max(7 * 1440).default(0),
  urgency: z.enum(['now', 'today', 'flexible']).default('now'),
  radius_m: z.number().int().min(200).max(8000),
  transport: z.enum(['auto', 'walk', 'car']).default('auto'),
});

/** POST /api/decide (x-chat-id) — re-runs the decision for the map controls; no LLM. */
export async function POST(req: Request) {
  try {
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, 'درخواست نامعتبر است.');
    const session = await chatSession(chatIdFrom(req), { create: false });
    const b = body.data;
    const loc = b.location ?? { lat: session.state.location.lat, lon: session.state.location.lon, label: session.state.location.label };
    const now = appNow(session.state.demoTime);
    const at = new Date(now.getTime() + b.offset_min * 60_000);
    const need = { ...b.need, families: b.need.families.filter(isShopType) };
    return NextResponse.json(await decideWhereToBuy({ need, location: loc, at, urgency: b.urgency, radius_m: b.radius_m, transport: b.transport, now }));
  } catch (err) {
    return errorResponse(err);
  }
}
