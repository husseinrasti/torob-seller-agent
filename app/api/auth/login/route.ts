import { NextResponse, type NextRequest } from 'next/server';
import { loginByName } from '@/lib/auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** POST /api/auth/login {name} — name-only sign-in (finds or creates the user). */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const user = await loginByName(body.name);
    return NextResponse.json({ user: { id: user.id, name: user.name } });
  } catch (err) {
    return errorResponse(err);
  }
}
