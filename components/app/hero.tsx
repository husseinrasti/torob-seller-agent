'use client';

import { useState } from 'react';
import { Building2, Clock3, Crosshair, Map as MapIcon, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HERO_CHIPS } from '@/lib/agent/suggest';
import { useChatActions } from './chat-actions';
import { useSession } from './session-context';
import { LocationSheet } from './sheets/location-sheet';

export function Hero() {
  const { sendText, busy } = useChatActions();
  const { state, patch } = useSession();
  const [pickOpen, setPickOpen] = useState(false);

  const gps = () => {
    if (!('geolocation' in navigator)) return toast.error('مرورگر شما موقعیت‌یابی را پشتیبانی نمی‌کند.');
    navigator.geolocation.getCurrentPosition(
      (p) => patch({ location: { lat: p.coords.latitude, lon: p.coords.longitude, label: 'موقعیت من', source: 'gps' } }),
      () => toast.error('دسترسی به موقعیت داده نشد؛ از «انتخاب روی نقشه» استفاده کنید.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <section className="space-y-6 pt-4">
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold leading-10">
          چی می‌خوای بخری؟
          <br />
          <span className="text-primary">نزدیک‌ترین مغازه‌ای که دارد را پیدا می‌کنم.</span>
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          کالا را با هم انتخاب می‌کنیم، فروشنده‌های اطرافت را با قیمت، تازگی قیمت، فاصله و ساعت کاری مقایسه می‌کنیم، موجودی را پیگیری می‌کنم و مسیر پاساژ تا طبقه و واحد را می‌چینم.
        </p>
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Sparkles className="size-3.5" />
          از یکی از این‌ها شروع کن:
        </p>
        <div className="grid gap-2">
          {HERO_CHIPS.map((t) => (
            <button
              key={t}
              disabled={busy}
              onClick={() => sendText(t)}
              className="min-h-12 rounded-2xl border bg-card px-4 py-3 text-start text-sm font-medium shadow-xs transition hover:border-primary hover:bg-accent active:scale-[0.99] disabled:opacity-60"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          محل فعلی: <span className="font-semibold text-foreground">{state?.location.label ?? '…'}</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={gps}>
            <Crosshair className="size-4" />
            موقعیت من
          </Button>
          <Button variant="outline" className="h-11" onClick={() => setPickOpen(true)}>
            <MapIcon className="size-4" />
            انتخاب روی نقشه
          </Button>
        </div>
      </div>

      <ul className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
        <li className="space-y-1 rounded-xl bg-muted/60 p-2">
          <Building2 className="mx-auto size-4 text-primary" />
          پاساژ، طبقه و واحد
        </li>
        <li className="space-y-1 rounded-xl bg-muted/60 p-2">
          <Clock3 className="mx-auto size-4 text-primary" />
          تازگی قیمت و ساعت کاری
        </li>
        <li className="space-y-1 rounded-xl bg-muted/60 p-2">
          <ShieldCheck className="mx-auto size-4 text-primary" />
          پیگیری موجودی
        </li>
      </ul>
      <LocationSheet open={pickOpen} onOpenChange={setPickOpen} />
    </section>
  );
}
