import { NextResponse, type NextRequest } from 'next/server';
import { q } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/** GET /api/products/specs?ids=a,b — full registered specs for the spec table (no LLM). */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 3);
  if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 });
  const rows = await q<{ product_id: string; title: string; specs: unknown }>('SELECT product_id, persian_title AS title, specs FROM products WHERE product_id = ANY($1::text[])', [ids]);
  return NextResponse.json({ products: ids.map((id) => rows.find((r) => r.product_id === id)).filter(Boolean) }, { headers: { 'cache-control': 'private, max-age=600' } });
}
