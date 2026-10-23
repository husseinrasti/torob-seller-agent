import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { deleteChat, loadChat } from '@/lib/agent/state';
import { errorResponse, HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/chats/[id] → messages + state to continue a previous chat. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const chat = await loadChat(user.id, (await params).id);
    if (!chat) throw new HttpError(404, 'گفتگو پیدا نشد');
    return NextResponse.json(chat);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!(await deleteChat(user.id, (await params).id))) throw new HttpError(404, 'گفتگو پیدا نشد');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
