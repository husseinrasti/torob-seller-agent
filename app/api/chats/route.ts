import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listChats } from '@/lib/agent/state';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/chats → the signed-in user's chats, most recent first. */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ chats: await listChats(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
