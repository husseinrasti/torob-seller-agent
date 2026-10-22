import { NextResponse, type NextRequest } from 'next/server';
import { deleteSession } from '@/lib/agent/state';

export const dynamic = 'force-dynamic';

/** Hidden helper for recording demos: clears the session (state, follow-ups) and starts fresh. */
export async function GET(req: NextRequest) {
  await deleteSession();
  const demoTime = req.nextUrl.searchParams.get('demo_time');
  const target = new URL(demoTime ? `/?demo_time=${encodeURIComponent(demoTime)}` : '/', req.nextUrl.origin);
  return NextResponse.redirect(target);
}
