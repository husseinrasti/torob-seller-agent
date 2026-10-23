'use client';

/**
 * F1 photo search, client side: downscale to ≤ 1280 px JPEG before upload, and keep a small thumbnail
 * for the message in memory only (the photo is never stored — after a reload the message shows a placeholder).
 */

const thumbs = new Map<string, string>();

export const photoThumb = (id: string): string | undefined => thumbs.get(id);

export async function preparePhoto(file: File, max = 1280): Promise<{ blob: Blob; id: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.85));
  const t = document.createElement('canvas');
  const ts = 160 / Math.max(canvas.width, canvas.height);
  t.width = Math.round(canvas.width * ts);
  t.height = Math.round(canvas.height * ts);
  t.getContext('2d')!.drawImage(canvas, 0, 0, t.width, t.height);
  const id = `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  thumbs.set(id, t.toDataURL('image/jpeg', 0.7));
  bitmap.close();
  return { blob, id };
}
