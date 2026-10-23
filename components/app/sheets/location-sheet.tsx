'use client';

import { useEffect, useState } from 'react';
import { Building2, Check, Crosshair, Loader2, MapPin, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toFaDigits } from '@/lib/fa/digits';
import { DEFAULT_LOCATION } from '@/lib/geo';
import { LazyMap } from '@/components/map/lazy-map';
import { useSession } from '../session-context';
import { BottomSheet } from './bottom-sheet';

type Place = { name: string; kind: 'area' | 'mall' | 'gazetteer'; lat: number; lon: number; shops: number };

export function LocationSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, patch } = useSession();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [pick, setPick] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setResults(d.places ?? []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    if (!open) setPick(null);
  }, [open]);

  if (!state) return null;

  const done = () => onOpenChange(false);

  const gps = () => {
    if (!('geolocation' in navigator)) {
      toast.error('مرورگر شما موقعیت‌یابی را پشتیبانی نمی‌کند.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        patch({ location: { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'موقعیت من', source: 'gps' } });
        done();
      },
      () => {
        setLocating(false);
        toast.error('دسترسی به موقعیت داده نشد؛ محل را جست‌وجو کنید یا روی نقشه بزنید.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const confirmPick = async () => {
    if (!pick) return;
    setSaving(true);
    const label = await fetch(`/api/places?near=${pick.lat},${pick.lon}`)
      .then((r) => r.json())
      .then((d) => d.label as string)
      .catch(() => 'نقطه انتخابی روی نقشه');
    await patch({ location: { lat: pick.lat, lon: pick.lon, label, source: 'map' } });
    setSaving(false);
    done();
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="محل شما" description={`الان: ${state.location.label}`}>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11" onClick={gps} disabled={locating}>
            {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
            موقعیت من
          </Button>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => {
              patch({ location: { ...DEFAULT_LOCATION } });
              done();
            }}
          >
            <RotateCcw className="size-4" />
            فردوسی (پیش‌فرض)
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="محله یا پاساژ: تجریش، علاءالدین، چارسو…" className="h-11 ps-9" />
        </div>
        {results.length > 0 && (
          <ul className="max-h-48 divide-y overflow-y-auto rounded-xl border">
            {results.map((p) => (
              <li key={p.kind + p.name}>
                <button
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted"
                  onClick={() => {
                    patch({ location: { lat: p.lat, lon: p.lon, label: p.name, source: 'text' } });
                    done();
                  }}
                >
                  {p.kind === 'mall' ? <Building2 className="size-4 text-muted-foreground" /> : <MapPin className="size-4 text-muted-foreground" />}
                  <span className="flex-1">{p.name}</span>
                  <span className={`text-[11px] ${p.kind === 'gazetteer' && p.shops === 0 ? 'text-recent' : 'text-muted-foreground'}`}>
                    {p.kind === 'gazetteer' ? (p.shops ? `${toFaDigits(p.shops)} فروشگاه در ۱ کیلومتری` : 'فروشگاهی در ۱ کیلومتری ثبت نشده') : `${toFaDigits(p.shops)} فروشگاه`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">یا روی نقشه بزنید:</p>
          <LazyMap
            center={pick ?? { lat: state.location.lat, lon: state.location.lon }}
            radiusM={state.radius_m}
            pick={pick}
            onPick={(lat, lon) => setPick({ lat, lon })}
            className="h-56 w-full overflow-hidden rounded-2xl border"
          />
          <Button className="h-11 w-full" disabled={!pick || saving} onClick={confirmPick}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            تأیید این نقطه
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
