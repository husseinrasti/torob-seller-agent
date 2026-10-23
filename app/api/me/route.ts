import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { llmMode } from '@/lib/llm';

export const dynamic = 'force-dynamic';

/** GET /api/me → the signed-in user and what the assistant remembers about them (`user: null` when signed out). */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null, llm: llmMode() });
  return NextResponse.json({ user: { id: user.id, name: user.name }, memory: user.memory, llm: llmMode() });
}
