'use client';

import { useState } from 'react';
import { History, Loader2, LogIn, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Name-only sign-in: chats and memory are saved under this name (no password). */
export function LoginScreen({ onLogin }: { onLogin: (user: { id: string; name: string }) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ورود ناموفق بود');
      onLogin(data.user);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <form
        className="w-full max-w-sm space-y-5 rounded-3xl border bg-card p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShoppingBag className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold">همراه خرید</h1>
            <p className="text-xs text-muted-foreground">دستیار هوشمند خرید حضوری در تهران</p>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="login-name" className="text-sm font-medium">
            اسمت چیه؟
          </label>
          <Input
            id="login-name"
            value={name}
            autoFocus
            autoComplete="nickname"
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً سارا"
            className="h-12 text-base"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || name.trim().length < 2}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
          ورود
        </Button>
        <p className="flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
          <History className="mt-0.5 size-3.5 shrink-0" />
          فقط با نام وارد می‌شوید (بدون رمز). گفتگوها، محل و جست‌وجوهای اخیرتان روی همین نام ذخیره می‌شود تا بعداً ادامه بدهید؛ هر کس همین نام را وارد کند همین تاریخچه را می‌بیند.
        </p>
      </form>
    </main>
  );
}
