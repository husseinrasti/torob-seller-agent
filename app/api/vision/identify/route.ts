import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { errorResponse, HttpError } from '@/lib/http';
import { identifyProduct } from '@/lib/vision/identify';
import { NOT_RECOGNIZED, recognized, shelfPrice, visionLabel } from '@/lib/vision/parse';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * POST /api/vision/identify (multipart `image`, ≤ 4 MB; the client downscales to ≤ 1280 px) → the vision
 * model's JSON. The image goes to the model provider only: it is not written to disk or the database.
 */
export async function POST(req: Request) {
  try {
    await requireUser();
    const form = await req.formData().catch(() => null);
    const file = form?.get('image');
    if (!(file instanceof File)) throw new HttpError(400, 'عکسی ارسال نشد.');
    if (file.size > MAX_BYTES) throw new HttpError(413, 'حجم عکس بیشتر از ۴ مگابایت است.');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new HttpError(415, 'فقط عکس JPEG، PNG یا WebP.');
    const r = await identifyProduct(new Uint8Array(await file.arrayBuffer()), file.type);
    const v = r.vision;
    const ok = v ? recognized(v) : false;
    if (r.error) console.warn('[vision]', r.provider, r.model, r.error);
    return NextResponse.json({
      recognized: ok,
      vision: v,
      label: ok && v ? visionLabel(v) : null,
      shelf_price: v ? shelfPrice(v) : null,
      message: ok ? null : NOT_RECOGNIZED,
      ms: r.ms,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
