import { NextResponse } from 'next/server';
import { q } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

async function count(table: string): Promise<number> {
  try {
    const rows = await q<{ n: string }>(`select count(*)::bigint as n from ${table}`);
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0; // table not created yet
  }
}

export async function GET() {
  let db = false;
  try {
    await q('select 1');
    db = true;
  } catch {
    db = false;
  }
  const counts = db
    ? { shops: await count('shops'), products: await count('products'), offers: await count('offers') }
    : { shops: 0, products: 0, offers: 0 };
  return NextResponse.json(
    { ok: db, db, counts, llm_provider: process.env.LLM_PROVIDER || 'openai' },
    { status: db ? 200 : 503 },
  );
}
