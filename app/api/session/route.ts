import { NextResponse, type NextRequest } from 'next/server';
import { applyPatch, chatSession, saveState, StatePatchSchema } from '@/lib/agent/state';
import { rememberContext } from '@/lib/agent/memory';
import { saveMemory } from '@/lib/auth';
import { suggestFromState } from '@/lib/agent/suggest';
import { llmMode } from '@/lib/llm';
import { chatIdFrom, errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/session (x-chat-id) → the chat's state + suggestions. A new chat is not stored until it is used. */
export async function GET(req: NextRequest) {
  try {
    const session = await chatSession(chatIdFrom(req), { create: false });
    return NextResponse.json({ state: session.state, suggestions: suggestFromState(session.state), llm: llmMode() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/session — ContextBar/chips update the chat's state without calling the LLM. */
export async function PATCH(req: NextRequest) {
  const parsed = StatePatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid patch', issues: parsed.error.issues }, { status: 400 });
  try {
    const session = await chatSession(chatIdFrom(req));
    const state = applyPatch(session.state, parsed.data);
    await saveState(session.id, state);
    const mem = rememberContext(session.user.memory, session.state, state);
    if (mem) await saveMemory(session.user.id, mem);
    return NextResponse.json({ state, suggestions: suggestFromState(state) });
  } catch (err) {
    return errorResponse(err);
  }
}
