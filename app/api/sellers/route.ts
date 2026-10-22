import { NextResponse, type NextRequest } from 'next/server';
import { findSellers } from '@/lib/search/sellers';
import { appNow } from '@/lib/data/hours';
import { DEFAULT_LOCATION } from '@/lib/geo';
import type { Filters, Intent } from '@/lib/search/score';

export const dynamic = 'force-dynamic';

const INTENTS: Intent[] = ['balanced', 'cheapest', 'nearest', 'now'];
const BOOL_FILTERS = ['open_now', 'installment', 'torobpay', 'fast_delivery', 'warranty_required', 'hide_stale', 'hide_suspicious'] as const;

function num(v: string | null, fallback: number): number {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** GET /api/sellers?product_id=…&lat&lon&radius_m&open_now=1&installment=1&max_price&intent&demo_time — no LLM involved. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get('product_id') ?? sp.get('product') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
  const filters: Filters = {};
  for (const k of BOOL_FILTERS) if (['1', 'true'].includes(sp.get(k) ?? '')) filters[k] = true;
  const maxPrice = Number(sp.get('max_price'));
  if (Number.isFinite(maxPrice) && maxPrice > 0) filters.max_price = maxPrice;
  const intent = (INTENTS.includes(sp.get('intent') as Intent) ? sp.get('intent') : 'balanced') as Intent;
  try {
    const t0 = performance.now();
    const result = await findSellers({
      product_ids: ids.slice(0, 5),
      lat: num(sp.get('lat'), DEFAULT_LOCATION.lat),
      lon: num(sp.get('lon'), DEFAULT_LOCATION.lon),
      radius_m: Math.min(Math.max(num(sp.get('radius_m') ?? sp.get('radius'), 1000), 100), 20000),
      filters,
      intent,
      now: appNow(sp.get('demo_time')),
    });
    return NextResponse.json(result, { headers: { 'Server-Timing': `sellers;dur=${(performance.now() - t0).toFixed(1)}` } });
  } catch (err) {
    console.error('[api/sellers]', err);
    return NextResponse.json({ error: 'خطا در دریافت فروشنده‌ها' }, { status: 500 });
  }
}
