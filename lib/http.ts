import { NextResponse } from 'next/server';

/** An error that maps to an HTTP status with a Persian message for the UI. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('[api]', err);
  return NextResponse.json({ error: 'خطای داخلی سرور' }, { status: 500 });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The chat a request belongs to: `x-chat-id` header or `?chat=` (the chat route sends it in the body). */
export function chatIdFrom(req: Request): string | null {
  const h = req.headers.get('x-chat-id');
  if (h) return h;
  try {
    return new URL(req.url).searchParams.get('chat');
  } catch {
    return null;
  }
}
