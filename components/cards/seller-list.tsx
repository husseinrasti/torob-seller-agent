'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, Clock3, Filter, Loader2, MapPinned, Store, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { faText, formatDistance, formatTomanShort } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { SellersOutput } from '@/lib/agent/types';
import type { SellersResult } from '@/lib/search/sellers';
import type { SessionState } from '@/lib/agent/state';
import { FILTER_LABEL, type Filters } from '@/lib/search/score';
import { useSession } from '@/components/app/session-context';
import { useChatActions } from '@/components/app/chat-actions';
import { useFollowups } from '@/components/app/followups-store';
import { MallChip, OpenDot } from './badges';
import { SellerCard } from './seller-card';

type Sort = 'score' | 'price' | 'distance';

function paramsOf(s: SessionState) {
  return { lat: s.location.lat, lon: s.location.lon, radius_m: s.radius_m, intent: s.intent, filters: s.filters };
}

function sameParams(a: ReturnType<typeof paramsOf>, b: SellersResult['params']): boolean {
  const norm = (f: Filters) => JSON.stringify(Object.entries(f).filter(([, v]) => v !== undefined && v !== false && v !== null).sort());
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6 && a.radius_m === b.radius_m && a.intent === b.intent && norm(a.filters) === norm(b.filters);
}

export function SellerList({ output, isLatest, toolCallId }: { output: SellersOutput; isLatest: boolean; toolCallId: string }) {
  const { state, patch, setLatestSellers } = useSession();
  const { updateToolOutput, sendAction, busy } = useChatActions();
  const [refreshed, setRefreshed] = useState(false);
  const followups = useFollowups();
  const [data, setData] = useState<SellersResult>(output);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<Sort>('score');
  const [mall, setMall] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const reqId = useRef(0);

  // Live re-filtering: when ContextBar changes the session, the latest list re-fetches /api/sellers (no LLM).
  useEffect(() => {
    if (!isLatest || !state || !data.product) return;
    const want = paramsOf(state);
    if (sameParams(want, data.params)) return;
    const my = ++reqId.current;
    const qs = new URLSearchParams({
      product_id: data.product.product_id,
      lat: String(want.lat),
      lon: String(want.lon),
      radius_m: String(want.radius_m),
      intent: want.intent,
    });
    for (const [k, v] of Object.entries(want.filters)) if (v !== undefined && v !== null && v !== false) qs.set(k, v === true ? '1' : String(v));
    if (state.demoTime) qs.set('demo_time', state.demoTime);
    setLoading(true);
    fetch(`/api/sellers?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: SellersResult) => {
        if (my === reqId.current) {
          setData(d);
          setMall(null);
          setRefreshed(true);
          // keep the chat history in sync so the agent reasons about the list the user sees
          updateToolOutput(toolCallId, { ...output, ...d });
        }
      })
      .catch(() => {})
      .finally(() => my === reqId.current && setLoading(false));
  }, [isLatest, state, data.product, data.params, output, toolCallId, updateToolOutput]);

  useEffect(() => {
    if (isLatest) setLatestSellers(data);
  }, [isLatest, data, setLatestSellers]);

  const rows = useMemo(() => {
    let r = data.rows;
    if (mall) r = r.filter((x) => x.mall?.key === mall);
    if (sort === 'price') r = [...r].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sort === 'distance') r = [...r].sort((a, b) => a.distance_m - b.distance_m);
    return r;
  }, [data.rows, mall, sort]);

  const visible = showAll ? rows : rows.slice(0, 6);
  const activeFilters = Object.entries(data.params.filters).filter(([, v]) => v !== undefined && v !== false && v !== null) as Array<[keyof Filters, unknown]>;
  const productTitle = faText(data.product?.title.split('|')[0].trim());

  return (
    <section className="space-y-3" aria-busy={loading}>
      <header className="space-y-2 rounded-2xl border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold">
              {toFaDigits(data.count)} فروشنده در شعاع {formatDistance(data.params.radius_m)}
            </h3>
            {productTitle && <p className="line-clamp-1 text-xs text-muted-foreground">{productTitle}</p>}
            {refreshed && <p className="mt-0.5 text-[11px] text-primary">فهرست با تنظیمات جدید به‌روز شد</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isLatest && data.count > 0 && (
              <button
                disabled={busy}
                onClick={() => sendAction('کی بروم؟ این فروشنده‌ها چه ساعتی بازند؟', 'best_time_to_visit', { scope: 'sellers' })}
                className="inline-flex h-8 items-center gap-1 rounded-full border bg-background px-2.5 text-[11px] font-medium hover:bg-muted disabled:opacity-60"
              >
                <Clock3 className="size-3.5" />
                کی برم؟
              </button>
            )}
            {loading ? <Loader2 className="size-5 animate-spin text-primary" /> : <Store className="size-5 text-muted-foreground" />}
          </div>
        </div>
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {activeFilters.map(([k, v]) => (
              <button
                key={k}
                className="tap inline-flex h-8 items-center gap-1 rounded-full bg-secondary px-2.5 text-[11px] font-medium text-secondary-foreground"
                onClick={() => patch({ filters: { [k]: k === 'max_price' ? null : false } })}
              >
                <Filter className="size-3" />
                {k === 'max_price' ? `تا ${formatTomanShort(Number(v))} تومان` : FILTER_LABEL[k]}
                <X className="size-3" />
              </button>
            ))}
          </div>
        )}
        {data.clusters.length > 0 && (
          <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
            {data.clusters.map((c) => (
              <button
                key={c.mall_key}
                onClick={() => setMall(mall === c.mall_key ? null : c.mall_key)}
                className={cn(
                  'tap inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition',
                  mall === c.mall_key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                )}
              >
                <MapPinned className="size-3.5" />
                {toFaDigits(c.count)} در {c.mall_name}
              </button>
            ))}
          </div>
        )}
        {mall && isLatest && (
          <button
            disabled={busy}
            data-open-mall-view
            onClick={() => {
              const c = data.clusters.find((x) => x.mall_key === mall);
              sendAction(`الان توی ${c?.mall_name ?? 'این پاساژ'} هستم؛ طبقه‌به‌طبقه نشان بده`, 'mall_view', { mall_key: mall, ...(data.product ? { product_id: data.product.product_id } : {}) });
            }}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-accent/40 text-xs font-medium text-primary hover:bg-accent disabled:opacity-60"
          >
            <Building2 className="size-4" />
            نمای داخل پاساژ (طبقه‌به‌طبقه)
          </button>
        )}
        <ToggleGroup type="single" value={sort} onValueChange={(v) => v && setSort(v as Sort)} variant="outline" size="sm" className="w-full">
          <ToggleGroupItem value="score" className="h-9 flex-1 text-xs">بهترین امتیاز</ToggleGroupItem>
          <ToggleGroupItem value="price" className="h-9 flex-1 text-xs">ارزان‌ترین</ToggleGroupItem>
          <ToggleGroupItem value="distance" className="h-9 flex-1 text-xs">نزدیک‌ترین</ToggleGroupItem>
        </ToggleGroup>
      </header>

      {(data.count < 3 || data.relaxations.length > 0) && (data.relaxations.length > 0 || data.radius_suggestion || data.count === 0) && (
        <div className="space-y-2 rounded-2xl border border-recent/30 bg-recent-bg p-3 text-sm">
          <p className="font-medium text-recent">
            {data.count === 0 ? 'با این شرایط فروشنده‌ای در این شعاع نیست.' : `فقط ${toFaDigits(data.count)} فروشنده با این شرایط.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {data.relaxations.slice(0, 3).map((r) => (
              <Button key={r.filter} size="sm" variant="outline" className="h-9 bg-background" onClick={() => patch({ filters: { [r.filter]: r.filter === 'max_price' ? null : false } })}>
                حذف فیلتر {r.label} (+{toFaDigits(r.would_add)})
              </Button>
            ))}
            {data.radius_suggestion && (
              <Button size="sm" variant="outline" className="h-9 bg-background" onClick={() => patch({ radius_m: data.radius_suggestion!.radius_m })}>
                شعاع را {formatDistance(data.radius_suggestion.radius_m)} کن ({toFaDigits(data.radius_suggestion.count)} فروشنده)
              </Button>
            )}
            {data.count === 0 && !data.relaxations.length && !data.radius_suggestion && data.params.radius_m < 5000 && (
              <Button size="sm" variant="outline" className="h-9 bg-background" onClick={() => patch({ radius_m: 5000 })}>
                شعاع را ۵ کیلومتر کن
              </Button>
            )}
          </div>
        </div>
      )}

      <div className={cn('grid gap-3 transition-opacity @2xl:grid-cols-2', loading && 'opacity-60')}>
        {visible.map((r) => (
          <SellerCard key={r.offer_id} row={r} rank={data.rows.indexOf(r) + 1} productTitle={productTitle} availability={followups.availabilityFor(r.offer_id, state?.followups[r.offer_id])} />
        ))}
      </div>
      {rows.length > visible.length && (
        <Button variant="outline" className="h-11 w-full" onClick={() => setShowAll(true)}>
          نمایش همه ({toFaDigits(rows.length)} فروشنده)
        </Button>
      )}

      {data.maybe_shops.length > 0 && (
        <Collapsible className="rounded-2xl border border-dashed bg-card">
          <CollapsibleTrigger className="flex h-12 w-full items-center justify-between px-3 text-start text-sm">
            <span>
              ممکن است داشته باشند <span className="text-xs text-muted-foreground">(فقط دسته فعالیت · {toFaDigits(data.maybe_shops.length)})</span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="px-3 pb-2 text-[11px] leading-5 text-muted-foreground">
              این فروشگاه‌ها این کالا را ثبت نکرده‌اند؛ فقط دسته فعالیتشان مرتبط است. قیمت و موجودی ندارند — قبل از رفتن پیگیری کنید.
            </p>
            <ul className="divide-y border-t">
              {data.maybe_shops.map((m) => (
                <li key={m.shop_id} className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{m.shop_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDistance(m.distance_m)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">فقط دسته فعالیت</span>
                    <OpenDot open={m.open} />
                    <MallChip mall={m.mall} />
                  </div>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}
