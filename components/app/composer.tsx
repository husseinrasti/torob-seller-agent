'use client';

import { useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatActions } from './chat-actions';

export function Composer({ onStop }: { onStop: () => void }) {
  const { sendText, busy } = useChatActions();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    sendText(t);
    setText('');
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = '';
    });
  };

  return (
    <form
      className="flex items-end gap-2 px-3 pb-3 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        value={text}
        rows={1}
        dir="auto"
        enterKeyHint="send"
        aria-label="پیام به همراه خرید"
        placeholder="چی می‌خوای بخری؟"
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
        className="max-h-[120px] min-h-12 flex-1 resize-none rounded-2xl border bg-background px-4 py-3 text-base leading-6 outline-none placeholder:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
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
