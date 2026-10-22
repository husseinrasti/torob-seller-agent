import { NextResponse, type NextRequest } from 'next/server';
import { applyPatch, getOrCreateSession, saveState, StatePatchSchema } from '@/lib/agent/state';
import { suggestFromState } from '@/lib/agent/suggest';
import { llmMode } from '@/lib/llm';

export const dynamic = 'force-dynamic';

/** GET /api/session → current state (+ suggestions); creates the session cookie on first visit. */
export async function GET() {
  const session = await getOrCreateSession();
  return NextResponse.json({ state: session.state, suggestions: suggestFromState(session.state), llm: llmMode() });
}

/** PATCH /api/session — ContextBar/chips update state without calling the LLM. */
export async function PATCH(req: NextRequest) {
  const parsed = StatePatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid patch', issues: parsed.error.issues }, { status: 400 });
  const session = await getOrCreateSession();
  const state = applyPatch(session.state, parsed.data);
  await saveState(session.id, state);
  return NextResponse.json({ state, suggestions: suggestFromState(state) });
}
