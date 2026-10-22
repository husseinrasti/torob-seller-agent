import { NextResponse, type NextRequest } from 'next/server';
import { routeCategories } from '@/lib/search/categories';
import { searchProducts } from '@/lib/search/products';

export const dynamic = 'force-dynamic';

/** GET /api/products/search?q=… — debugging endpoint for routing + product search. */
export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('q')?.trim();
  if (!text) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 8, 20);
  const route = await routeCategories(text);
  const result = await searchProducts({ text, keywords: route.keywords, categories: route.categories, budget: route.budget, limit });
  return NextResponse.json({ route, ...result });
}
