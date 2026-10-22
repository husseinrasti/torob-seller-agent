import { NextResponse, type NextRequest } from 'next/server';
import { deleteSession, SESSION_COOKIE } from '@/lib/agent/state';

export const dynamic = 'force-dynamic';

/** Hidden helper for recording demos: clears the session (state, follow-ups) and starts fresh. */
export async function GET(req: NextRequest) {
  await deleteSession();
  const demoTime = req.nextUrl.searchParams.get('demo_time');
  // relative Location: behind a reverse proxy the server's own origin is not the public one
  const res = new NextResponse(null, { status: 307, headers: { Location: demoTime ? `/?demo_time=${encodeURIComponent(demoTime)}` : '/' } });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
