import { NextResponse, type NextRequest } from 'next/server';
import { shopsNear } from '@/lib/search/shops-near';
import { DEFAULT_LOCATION } from '@/lib/geo';

export const dynamic = 'force-dynamic';

/** GET /api/shops/near?lat&lon&radius_m[&product_id] — all shops in the area for the map layer (no LLM). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const num = (k: string, d: number) => (Number.isFinite(Number(sp.get(k))) && sp.get(k) !== null ? Number(sp.get(k)) : d);
  const radius = Math.min(Math.max(num('radius_m', 1000), 100), 5000);
  const { shops, malls } = await shopsNear(num('lat', DEFAULT_LOCATION.lat), num('lon', DEFAULT_LOCATION.lon), radius, sp.get('product_id'));
  return NextResponse.json({ radius_m: radius, shops, malls }, { headers: { 'cache-control': 'private, max-age=60' } });
}
