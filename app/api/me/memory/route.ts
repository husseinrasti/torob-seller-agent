import { NextResponse } from 'next/server';
import { requireUser, saveMemory } from '@/lib/auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** DELETE /api/me/memory — forget remembered searches, products and location (chats stay). */
export async function DELETE() {
  try {
    const user = await requireUser();
    await saveMemory(user.id, {});
    return NextResponse.json({ memory: {} });
  } catch (err) {
    return errorResponse(err);
  }
}
