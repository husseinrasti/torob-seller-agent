'use client';

import { useRef, useState } from 'react';
import { ArrowUp, Camera, Loader2, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useChatActions } from './chat-actions';
import { preparePhoto } from './photo';

export function Composer({ onStop }: { onStop: () => void }) {
  const { sendText, sendAction, busy } = useChatActions();
  const [text, setText] = useState('');
  const [identifying, setIdentifying] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetHeight = () =>
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = '';
    });

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    sendText(t);
    setText('');
    resetHeight();
  };

  // F1: photo (camera or gallery) → downscale → /api/vision/identify → photo_search with the typed text, if any
  const onPhoto = async (file: File | undefined) => {
    if (!file || busy || identifying) return;
    setIdentifying(true);
    try {
      const { blob, id } = await preparePhoto(file);
      const form = new FormData();
      form.set('image', blob, 'photo.jpg');
      const res = await fetch('/api/vision/identify', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تشخیص عکس ناموفق بود.');
      const t = text.trim();
      sendAction(t || 'این کالا را از روی عکس پیدا کن', 'photo_search', { vision: data.vision ?? { brand: null, model: null, product_type: null, visible_price_toman: null, text_lines: [], confidence: 0 }, ...(t ? { text: t } : {}) }, { photo: id });
      setText('');
      resetHeight();
    } catch (err) {
      toast.error(err instanceof Error && /[؀-ۿ]/.test(err.message) ? err.message : 'تشخیص عکس ناموفق بود؛ اسم کالا را بنویسید.');
    } finally {
      setIdentifying(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <form
      className="flex items-end gap-2 px-3 pb-3 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden data-photo-input onChange={(e) => onPhoto(e.target.files?.[0])} />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-12 shrink-0 rounded-2xl"
        disabled={busy || identifying}
        onClick={() => fileRef.current?.click()}
        aria-label="جستجو با عکس (دوربین یا گالری)"
        title="عکس کالا، جعبه یا برچسب قیمت — عکس فقط برای تشخیص به ارائه‌دهنده‌ی مدل فرستاده می‌شود و ذخیره نمی‌شود"
      >
        {identifying ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
      </Button>
      <textarea
        ref={ref}
        value={text}
        rows={1}
        dir="auto"
        enterKeyHint="send"
        aria-label="پیام به همراه خرید"
        placeholder={identifying ? 'در حال تشخیص عکس…' : 'چی می‌خوای بخری؟'}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="max-h-[120px] min-h-12 min-w-0 flex-1 resize-none rounded-2xl border bg-background px-4 py-3 text-base leading-6 outline-none placeholder:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      />
      {busy ? (
        <Button type="button" size="icon" variant="outline" className="size-12 shrink-0 rounded-2xl" onClick={onStop} aria-label="توقف">
          <Square className="size-4" />
        </Button>
      ) : (
        <Button type="submit" size="icon" className="size-12 shrink-0 rounded-2xl" disabled={!text.trim()} aria-label="ارسال">
          <ArrowUp className="size-5" />
        </Button>
      )}
    </form>
  );
}
