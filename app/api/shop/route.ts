import { NextResponse, type NextRequest } from 'next/server';
import { shopDetails } from '@/lib/search/sellers';
import { appNow } from '@/lib/data/hours';
import { q } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/** GET /api/shop?id=…&product_id=… — shop details sheet (no LLM). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const productId = sp.get('product_id') ?? undefined;
  const category = productId
    ? (await q<{ category_name: string | null }>('SELECT category_name FROM products WHERE product_id = $1', [productId]))[0]?.category_name
    : null;
  const data = await shopDetails(id, { category, excludeProductId: productId, now: appNow(sp.get('demo_time')) });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(data);
}
