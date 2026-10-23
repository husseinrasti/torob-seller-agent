import { NextResponse, type NextRequest } from 'next/server';
import { loginByName, logout } from '@/lib/auth';
import { wipeUser } from '@/lib/agent/state';

export const dynamic = 'force-dynamic';

/**
 * Hidden helper for recording demos.
 * `/demo-reset?name=داور&demo_time=…` signs in as that name and wipes its chats, follow-ups and memory;
 * without `name` it just signs out. Keeps `demo_time` for the app clock.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const name = sp.get('name');
  if (name) {
    const user = await loginByName(name);
    await wipeUser(user.id);
  } else {
    await logout();
  }
  const demoTime = sp.get('demo_time');
  // relative Location: behind a reverse proxy the server's own origin is not the public one
  return new NextResponse(null, { status: 307, headers: { Location: demoTime ? `/?demo_time=${encodeURIComponent(demoTime)}` : '/' } });
}
