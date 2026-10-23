import { NextResponse, type NextRequest } from 'next/server';
import type { UIMessage } from 'ai';
import { chatSession, saveMessages } from '@/lib/agent/state';
import { errorResponse, HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * PUT /api/chats/[id]/messages — the client saves cards it updated after the reply ended
 * (seller lists re-filtered by the ContextBar, follow-up results), so a resumed chat shows them.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) throw new HttpError(413, 'گفتگو خیلی بزرگ است');
    const body = JSON.parse(raw) as { messages?: UIMessage[] };
    if (!Array.isArray(body.messages)) throw new HttpError(400, 'messages required');
    const session = await chatSession((await params).id);
    await saveMessages(session.id, body.messages);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
