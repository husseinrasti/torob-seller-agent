import { NextResponse, type NextRequest } from 'next/server';
import { loadPlaces, searchPlaces } from '@/lib/search/places';
import { haversine } from '@/lib/geo';

export const dynamic = 'force-dynamic';

/** GET /api/places?q=… (search areas & malls) or ?near=lat,lon (nearest label for a map pick). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const near = sp.get('near');
  if (near) {
    const [lat, lon] = near.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: 'bad near' }, { status: 400 });
    const places = await loadPlaces();
    let best: { name: string; d: number } | null = null;
    for (const p of places) {
      const d = haversine(lat, lon, p.lat, p.lon);
      if (!best || d < best.d) best = { name: p.name, d };
    }
    return NextResponse.json({ label: best && best.d < 3000 ? `نزدیک ${best.name}` : 'نقطه انتخابی روی نقشه', distance_m: best?.d ?? null });
  }
  const results = await searchPlaces(sp.get('q') ?? '');
  return NextResponse.json({ places: results.map(({ name, kind, lat, lon, shops }) => ({ name, kind, lat, lon, shops })) });
}
