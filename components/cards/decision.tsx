'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeftRight, BellPlus, Building2, Clock3, HelpCircle, Loader2, MessageCircleQuestion, Navigation, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDistance, formatToman } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import { navLinks } from '@/lib/geo';
import { atLocalTime } from '@/lib/data/hours';
import { travelLabel, type Confidence, type HubPick, type ShopPick, type Tier, type Transport, type Urgency } from '@/lib/agent/decide';
import type { DecisionOutput } from '@/lib/search/decide-data';
import type { HubShopRow } from '@/lib/search/hubs';
import { useChatActions } from '@/components/app/chat-actions';
import { useSession } from '@/components/app/session-context';
import { ShopDetailsSheet } from './shop-details-sheet';

const DecisionMap = dynamic(() => import('@/components/map/decision-map-view'), { ssr: false, loading: () => <Skeleton className="size-full" /> });

const CONF: Record<Confidence, { label: string; cls: string }> = {
  high: { label: 'مطمئن', cls: 'bg-fresh-bg text-fresh' },
  medium: { label: 'احتمالی', cls: 'bg-recent-bg text-recent' },
  low: { label: 'نامطمئن', cls: 'bg-muted text-muted-foreground' },
};
const RADII = [500, 1000, 2000, 4000];
const URGENCY: Array<[Urgency, string]> = [
  ['now', 'فوری'],
  ['today', 'امروز'],
  ['flexible', 'هر وقت'],
];
const TRANSPORT: Array<[Transport, string]> = [
  ['auto', 'خودکار'],
  ['walk', 'پیاده'],
  ['car', 'ماشین'],
];

function Seg<T extends string>({ value, options, onChange, name }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex shrink-0 rounded-full bg-muted p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={v === value}
          data-seg={`${name}:${v}`}
          onClick={() => onChange(v)}
          className={cn('h-8 whitespace-nowrap rounded-full px-3 text-xs transition', v === value ? 'bg-background font-semibold shadow-xs' : 'text-muted-foreground')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ShopLine({ s, onOpen }: { s: ShopPick; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-start justify-between gap-2 py-2 text-start">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{s.name}</span>
        <span className="block text-[11px] text-muted-foreground">
          {[s.mall, formatDistance(s.distance_m), travelLabel(s.travel)].filter(Boolean).join(' · ')}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
          <span className={cn(s.open.open ? 'text-fresh' : 'text-muted-foreground')}>{s.opens && !s.open.open ? `بسته · ${s.opens.label} باز می‌شود` : s.open.label}</span>
          {s.hurry && !s.arrives_after_close && <span data-hurry className="rounded-full bg-recent-bg px-1.5 font-semibold text-recent">عجله کن</span>}
          {s.arrives_after_close && <span className="rounded-full bg-stale-bg px-1.5 font-semibold text-stale">تا برسی بسته است</span>}
        </span>
      </span>
      {s.price ? <span className="shrink-0 text-xs font-semibold">{formatToman(s.price)}</span> : null}
    </button>
  );
}

function HubBlock({ h, need, offsetMin, families }: { h: HubPick; need: string; offsetMin: number; families: string[] }) {
  const { api } = useSession();
  const [list, setList] = useState<HubShopRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const open = async () => {
    if (list) return setList(null);
    setLoading(true);
    const r = await api(`/api/hubs/shops?hub_id=${encodeURIComponent(h.hub_id)}&families=${families.join(',')}&offset_min=${offsetMin}`).catch(() => null);
    const d = r?.ok ? await r.json() : null;
    setList(d?.shops ?? []);
    setLoading(false);
  };
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-violet-500/5 p-2.5 text-xs leading-6">
        <p className="flex items-center gap-1.5 font-semibold text-violet-700 dark:text-violet-300">
          <Building2 className="size-3.5" />
          {toFaDigits(h.name)}
        </p>
        <p className="text-muted-foreground">
          {formatDistance(h.distance_m)} · {travelLabel(h.travel)}
          {h.typical_close && ` · ${h.typical_only ? 'معمولاً' : 'بیشتر مغازه‌های ثبت‌شده'} تا ${toFaDigits(h.typical_close)}`}
          {h.open_share !== null && ` · این ساعت ${toFaDigits(Math.round(h.open_share * 100))}٪ باز`}
        </p>
        {h.source === 'curated' ? (
          <p className="text-[11px] text-recent">بر اساس شناخت عمومی، نه داده ترب{h.note ? ` — ${h.note}` : ''}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {toFaDigits(h.shop_count)} مغازه‌ی هم‌نوع در داده‌ها، {toFaDigits(h.category_only_count)} تا بدون کالای ثبت‌شده — شاید {need} داشته باشند{h.note ? ` · ${h.note}` : ''}
          </p>
        )}
      </div>
      {list && (
        <ul data-hub-shops className="max-h-64 divide-y overflow-y-auto rounded-xl border text-xs">
          {list.map((s) => (
            <li key={s.shop_id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <span className="min-w-0 truncate">
                {s.name}
                {s.mall && <span className="text-muted-foreground"> · {s.mall}</span>}
              </span>
              <span className={cn('shrink-0 text-[11px]', s.open.open ? 'text-fresh' : 'text-muted-foreground')}>{s.open.known ? (s.open.open ? 'باز' : 'بسته') : 'ساعت؟'}</span>
            </li>
          ))}
          {!list.length && <li className="p-2.5 text-muted-foreground">مغازه‌ی هم‌نوعی در داده‌های این بورس نیست.</li>}
        </ul>
      )}
      <div className="flex items-center gap-2">
        {h.source !== 'curated' && (
          <Button size="sm" className="h-11 flex-1" onClick={open} data-hub-open>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Store className="size-4" />}
            {list ? 'بستن فهرست' : 'ببینم چه مغازه‌هایی آن‌جاست'}
          </Button>
        )}
        <a href={navLinks(h.lat, h.lon).neshan} target="_blank" rel="noreferrer" className={cn('inline-flex h-11 items-center justify-center gap-1 rounded-xl px-3 text-xs', h.source === 'curated' ? 'flex-1 bg-primary text-primary-foreground' : 'text-primary hover:bg-muted')}>
          <Navigation className="size-4" />
          مسیر
        </a>
      </div>
    </div>
  );
}

function TierCard({ t, rec, data, offsetMin, onShop }: { t: Tier; rec: boolean; data: DecisionOutput; offsetMin: number; onShop: (s: ShopPick) => void }) {
  const { sendAction, busy } = useChatActions();
  if (t.empty) {
    return (
      <li data-tier={t.key} data-tier-empty className="flex items-start gap-2 px-1 text-xs leading-6 text-muted-foreground">
        <HelpCircle className="mt-1 size-3.5 shrink-0" />
        {t.verdict}
      </li>
    );
  }
  const first = t.shops[0];
  const asks = t.shops.filter((s) => s.offer_id).slice(0, 3);
  return (
    <li data-tier={t.key} data-recommended={rec || undefined} className={cn('space-y-2 rounded-2xl p-3 transition-colors', rec ? 'bg-accent/50 ring-1 ring-primary/30' : 'bg-muted/40')}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold">
          {t.title}
          {rec && <span className="ms-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">پیشنهاد</span>}
        </h4>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', CONF[t.confidence].cls)}>{CONF[t.confidence].label}</span>
      </div>
      {/* the recommended tier's verdict is the card's headline already */}
      {!rec && <p className="text-xs leading-6">{t.verdict}</p>}
      {t.hubs.slice(0, 1).map((h) => (
        <HubBlock key={h.hub_id} h={h} need={data.need} offsetMin={offsetMin} families={data.need_spec.families} />
      ))}
      {t.shops.length > 0 && (
        <div className="divide-y">
          {t.shops.slice(0, 3).map((s) => (
            <ShopLine key={s.shop_id} s={s} onOpen={() => onShop(s)} />
          ))}
        </div>
      )}
      {(t.key === 'open_listed_near' || t.key === 'open_listed_far') && first && (
        <div className="flex items-center gap-2">
          <a href={navLinks(first.lat, first.lon).neshan} target="_blank" rel="noreferrer" data-primary className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-medium text-primary-foreground">
            <Navigation className="size-4" />
            مسیریابی تا «{first.name}»
          </a>
          {first.offer_id && (
            <button disabled={busy} onClick={() => sendAction(`موجودی «${first.name}» را بپرس`, 'contact_seller', { offer_ids: [first.offer_id], channel: 'message' })} className="h-11 rounded-xl px-3 text-xs text-primary hover:bg-muted disabled:opacity-60">
              پیگیری
            </button>
          )}
        </div>
      )}
      {t.key === 'unknown_hours_near' && (
        <Button size="sm" className="h-11 w-full" disabled={busy || !asks.length} data-primary onClick={() => sendAction('بپرس الان بازند و این کالا را دارند؟', 'contact_seller', { offer_ids: asks.map((s) => s.offer_id), channel: 'message', question: `الان بازید؟ ${data.need} دارید؟` })}>
          <MessageCircleQuestion className="size-4" />
          {asks.length ? `بپرس بازه؟ (${toFaDigits(asks.length)} فروشنده)` : 'این‌ها در ترب کالا ثبت نکرده‌اند'}
        </Button>
      )}
      {t.key === 'opens_soonest' && first?.offer_id && first.opens && (
        <Button
          size="sm"
          variant={rec ? 'default' : 'outline'}
          className="h-11 w-full"
          disabled={busy}
          data-primary
          onClick={() => sendAction(`برای ${first.opens!.label} یادآوری بگذار و برنامه را بچین`, 'plan_trip', { offer_ids: [first.offer_id], start_at: first.opens!.hhmm, day_offset: Math.max(0, first.opens!.day_offset + Math.floor(offsetMin / 1440)) })}
        >
          <BellPlus className="size-4" />
          یادآوری برای {first.opens.label}
        </Button>
      )}
    </li>
  );
}

/** Situational decision: the map is the answer, the tiers explain it; every control re-runs the engine (no LLM). */
export function DecisionCard({ output }: { output: DecisionOutput }) {
  const { api } = useSession();
  const [data, setData] = useState<DecisionOutput>(output);
  const [loading, setLoading] = useState(false);
  const now = useMemo(() => new Date(output.now), [output.now]);
  const initialOffset = Math.max(0, Math.round((new Date(output.at).getTime() - now.getTime()) / 60_000));
  const [offset, setOffset] = useState(initialOffset);
  const [radius, setRadius] = useState(output.radius_m);
  const [urgency, setUrgency] = useState<Urgency>(output.urgency);
  const [transport, setTransport] = useState<Transport>(output.transport);
  const [shop, setShop] = useState<ShopPick | null>(null);
  const req = useRef(0);
  const scrub = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rerun = useCallback(
    async (p: { offset?: number; radius?: number; urgency?: Urgency; transport?: Transport }) => {
      const next = { offset: p.offset ?? offset, radius: p.radius ?? radius, urgency: p.urgency ?? urgency, transport: p.transport ?? transport };
      setOffset(next.offset);
      setRadius(next.radius);
      setUrgency(next.urgency);
      setTransport(next.transport);
      const my = ++req.current;
      setLoading(true);
      try {
        const r = await api('/api/decide', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ need: data.need_spec, location: data.location, offset_min: next.offset, urgency: next.urgency, radius_m: next.radius, transport: next.transport }),
        });
        if (r.ok && my === req.current) setData(await r.json());
      } finally {
        if (my === req.current) setLoading(false);
      }
    },
    [api, data.need_spec, data.location, offset, radius, urgency, transport],
  );

  const tomorrow10 = Math.round((atLocalTime(now, '10:00', 1).getTime() - now.getTime()) / 60_000);
  const recTier = data.tiers.find((t) => t.key === data.recommended);
  const target = recTier?.hubs[0]
    ? { lat: recTier.hubs[0].lat, lon: recTier.hubs[0].lon, eta: travelLabel(recTier.hubs[0].travel) }
    : recTier?.shops[0]
      ? { lat: recTier.shops[0].lat, lon: recTier.shops[0].lon, eta: travelLabel(recTier.shops[0].travel) }
      : null;
  const timeChips: Array<[number, string]> = [
    [0, 'الان'],
    [60, '۱ ساعت دیگر'],
    [tomorrow10, 'فردا ۱۰:۰۰'],
  ];

  return (
    <section data-decision data-recommended={data.recommended ?? ''} className="@container overflow-hidden rounded-3xl border bg-card">
      <div className="relative h-72 @2xl:h-96">
        <DecisionMap decision={data} center={data.location} target={target} onShop={setShop} />
        <span className="pointer-events-none absolute end-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium shadow-xs">
          <Clock3 className="size-3.5" />
          {data.at_label} · {data.location.label}
        </span>
        {loading && <Loader2 className="absolute start-3 top-3 z-10 size-5 animate-spin text-primary" />}
      </div>
      <div className={cn('space-y-3 p-4 transition-opacity', loading && 'opacity-60')}>
        <div className="space-y-1">
          <p data-decision-verdict className="text-[15px] font-semibold leading-7">
            {data.verdict}
          </p>
          {data.tradeoffs.slice(0, 2).map((x) => (
            <p key={x} className="flex items-start gap-1.5 text-xs leading-6 text-muted-foreground">
              <ArrowLeftRight className="mt-1 size-3.5 shrink-0" />
              {x}
            </p>
          ))}
        </div>

        <div className="space-y-2" data-decision-controls>
          <div className="flex flex-wrap items-center gap-1.5">
            {timeChips.map(([m, label]) => (
              <button key={label} data-time-chip={label} onClick={() => rerun({ offset: m })} className={cn('h-8 rounded-full border px-3 text-xs', offset === m ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="shrink-0">زمان</span>
            <input
              type="range"
              min={0}
              max={24 * 60}
              step={10}
              value={Math.min(offset, 24 * 60)}
              data-time-scrubber
              onChange={(e) => {
                const v = Number(e.target.value);
                setOffset(v);
                // re-run once the thumb rests (no LLM, one request per pause)
                if (scrub.current) clearTimeout(scrub.current);
                scrub.current = setTimeout(() => rerun({ offset: v }), 250);
              }}
              className="h-2 flex-1 accent-[var(--primary)]"
              aria-label="زمان (۲۴ ساعت آینده)"
            />
            <span className="w-24 shrink-0 text-end font-medium text-foreground">{data.at_label}</span>
          </label>
          <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4">
            <div className="inline-flex shrink-0 rounded-full bg-muted p-0.5" role="radiogroup" aria-label="شعاع">
              {RADII.map((r) => (
                <button key={r} role="radio" aria-checked={r === radius} data-radius={r} onClick={() => rerun({ radius: r })} className={cn('h-8 whitespace-nowrap rounded-full px-2.5 text-xs', r === radius ? 'bg-background font-semibold shadow-xs' : 'text-muted-foreground')}>
                  {formatDistance(r)}
                </button>
              ))}
            </div>
            <Seg name="urgency" value={urgency} options={URGENCY} onChange={(v) => rerun({ urgency: v })} />
            <Seg name="transport" value={transport} options={TRANSPORT} onChange={(v) => rerun({ transport: v })} />
          </div>
        </div>

        <ol className="space-y-2" data-tiers>
          {data.tiers.map((t) => (
            <TierCard key={`${t.key}:${data.at}:${data.radius_m}`} t={t} rec={t.key === data.recommended} data={data} offsetMin={offset} onShop={setShop} />
          ))}
        </ol>
      </div>
      {shop && <ShopDetailsSheet open={Boolean(shop)} onOpenChange={(v) => !v && setShop(null)} shopId={shop.shop_id} productId={data.need_spec.product_id ?? undefined} />}
    </section>
  );
}
