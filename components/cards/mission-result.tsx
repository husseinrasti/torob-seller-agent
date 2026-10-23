'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock3, Info, MapPinned, Sparkles, ThumbsUp, TriangleAlert, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { faText, formatDistance, formatToman } from '@/lib/fa/format';
import { toFaDigits } from '@/lib/fa/digits';
import type { FollowupItem } from '@/lib/sim/followups';
import type { MissionResult, MissionRow, Understood, Verdict } from '@/lib/agent/mission/types';
import { effectivePrice, noRecommendationNote, pickRecommendation, verdictFor } from '@/lib/agent/mission/verdict';
import { useChatActions } from '@/components/app/chat-actions';
import { useFollowups } from '@/components/app/followups-store';
import { useSession } from '@/components/app/session-context';
import { AvailabilityBadge, FreshnessBadge, OpenDot } from './badges';
import { ShopDetailsSheet } from './shop-details-sheet';
import { TripPlan } from './trip-plan';
import { VisitTimeCard } from './visit-time';
import { floorSections } from '@/lib/data/mall-floors';

const pendingish = (s?: string) => s === 'pending' || s === 'contacting';

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  recommended: { label: 'پیشنهادی', cls: 'bg-fresh-bg text-fresh' },
  ok: { label: 'قابل قبول', cls: 'bg-muted text-foreground' },
  avoid: { label: 'توصیه نمی‌شود', cls: 'bg-stale-bg text-stale' },
  unknown: { label: 'نامشخص', cls: 'border border-dashed text-muted-foreground' },
};

// chips that can be removed (→ the mission runs again without that constraint)
const DROP_KEY: Partial<Record<Understood['key'], string>> = {
  budget: 'budget',
  location: 'location',
  open_now: 'hours',
  hours: 'hours',
  installment: 'installment',
  torobpay: 'torobpay',
  fast_delivery: 'fast_delivery',
  warranty: 'warranty',
  verify: 'verify',
  plan: 'plan',
};

function VerdictPill({ v }: { v: Verdict }) {
  return <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold', VERDICT[v].cls)}>{VERDICT[v].label}</span>;
}

function mallLine(r: MissionRow): string {
  const m = r.mall;
  return [m?.name, m?.floor_label, m?.unit_label ? `${m.unit_kind ?? 'واحد'} ${m.unit_label}` : null].filter(Boolean).join(' · ');
}

function Price({ r }: { r: MissionRow }) {
  const p = effectivePrice(r);
  if (p === null) return <span className="text-muted-foreground">ثبت نشده</span>;
  return (
    <span className="font-semibold">
      {formatToman(p)}
      {r.followup?.status === 'price_changed' && <span className="ms-1 text-[10px] font-normal text-recent">(قیمت جدید)</span>}
    </span>
  );
}

/** Consolidated report of a mission: what was understood, coverage, sellers with verdicts, recommendation, next steps. */
export function MissionResultCard({ output, toolCallId }: { output: MissionResult; toolCallId: string }) {
  const { sendAction, sendText, applySuggestion, busy, updateToolOutput } = useChatActions();
  const { api } = useSession();
  const { upsert } = useFollowups();
  const [rows, setRows] = useState<MissionRow[]>(output.rows);
  const [open, setOpen] = useState<MissionRow | null>(null);
  const hadPending = useRef(output.rows.some((r) => pendingish(r.followup?.status)));
  const synced = useRef(false);

  // replies still on their way when the report was written keep arriving here
  const pendingIds = rows.filter((r) => r.followup && pendingish(r.followup.status)).map((r) => r.followup!.id);
  const pendingKey = pendingIds.join(',');
  useEffect(() => {
    if (!pendingKey) return;
    let stop = false;
    const t = setInterval(async () => {
      try {
        const d = (await (await api(`/api/followup?ids=${pendingKey}`)).json()) as { items?: FollowupItem[] };
        if (stop || !d.items) return;
        const byId = new Map(d.items.map((i) => [i.id, i]));
        setRows((prev) =>
          prev.map((r) => {
            const f = r.followup && byId.get(r.followup.id);
            if (!f) return r;
            const followup = { id: f.id, status: f.status, new_price: f.new_price, replied_at: f.resolved_at };
            const v = verdictFor({ ...r, followup }, output.band);
            return { ...r, followup, verdict: v.verdict, verdict_reason: v.reason };
          }),
        );
      } catch {
        // keep polling
      }
    }, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [pendingKey, api, output.band]);

  // seller cards elsewhere in the chat show the same follow-up badges
  useEffect(() => {
    upsert(
      rows
        .filter((r) => r.followup)
        .map((r) => ({ id: r.followup!.id, offer_id: r.offer_id, shop_id: r.shop_id, shop_name: r.shop_name, status: r.followup!.status, channel: output.channel, new_price: r.followup!.new_price, resolved_at: r.followup!.replied_at })),
    );
  }, [rows, upsert, output.channel]);

  const recommendation = useMemo(() => pickRecommendation(rows, output.intent), [rows, output.intent]);
  const recNote = recommendation ? null : output.clarify ? output.recommendation_note : noRecommendationNote(rows, output.band);

  // keep the history in sync once the late replies are in
  useEffect(() => {
    if (!hadPending.current || pendingKey || synced.current) return;
    synced.current = true;
    updateToolOutput(toolCallId, { ...output, rows, recommendation, recommendation_note: recNote ?? undefined });
  }, [pendingKey, rows, output, toolCallId, updateToolOutput, recommendation, recNote]);

  const rerun = (label: string, key: string) => {
    const o = output.overrides ?? {};
    sendAction(`بدون «${label}» دوباره بررسی کن`, 'run_mission', { text: output.text, ...o, drop: [...new Set([...(o.drop ?? []), key])] });
  };
  const widened = output.coverage.used_radius_m > output.coverage.requested_radius_m;
  const recRow = recommendation && rows.find((r) => r.offer_id === recommendation.offer_id);
  // F2: a mission in a mall lists its sellers floor by floor
  const mallKey = output.location.kind === 'mall' ? output.location.mall_key : undefined;
  const sections = mallKey ? floorSections(rows, mallKey) : [{ key: 'all', title: '', rows }];

  return (
    <section data-mission-result className="@container overflow-hidden rounded-2xl border bg-card">
      <header className="space-y-2 border-b p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Sparkles className="size-4 text-primary" />
          گزارش مأموریت
        </h3>
        <p className="text-[11px] text-muted-foreground">این‌طور فهمیدم:</p>
        <ul className="flex flex-wrap gap-1.5" aria-label="این‌طور فهمیدم">
          {output.understood.map((u) => {
            const drop = DROP_KEY[u.key];
            return (
              <li key={u.key + u.label} className="inline-flex h-8 items-center gap-1 rounded-full border bg-background ps-2.5 pe-1 text-xs">
                {faText(u.label)}
                {drop ? (
                  <button disabled={busy} onClick={() => rerun(u.label, drop)} aria-label={`حذف «${u.label}»`} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                    <X className="size-3" />
                  </button>
                ) : (
                  <span className="w-1.5" />
                )}
              </li>
            );
          })}
        </ul>
      </header>

      <div className="space-y-2 p-3">
        {output.clarify && (
          <div className="space-y-2 rounded-xl bg-info-bg p-3 text-sm text-info">
            <p>{output.clarify.question}</p>
            <div className="flex flex-wrap gap-1.5">
              {output.clarify.chips.map((c) => (
                <button key={c.label} disabled={busy} onClick={() => sendText(c.text)} className="h-9 rounded-full border border-info/30 bg-background px-3 text-xs text-foreground hover:bg-muted">
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {output.coverage.note && (
          <p data-coverage className={cn('flex items-start gap-2 rounded-xl p-3 text-xs leading-6', widened || !rows.length ? 'bg-recent-bg text-recent' : 'bg-info-bg text-info')}>
            <MapPinned className="mt-1 size-4 shrink-0" />
            {faText(output.coverage.note)}
          </p>
        )}
        {output.conditions_note && (
          <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-2.5 text-xs leading-5 text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {faText(output.conditions_note)}
          </p>
        )}
        {recommendation ? (
          <p data-recommendation className="flex items-start gap-2 rounded-xl border border-fresh/30 bg-fresh-bg p-3 text-sm leading-6 text-fresh">
            <ThumbsUp className="mt-1 size-4 shrink-0" />
            <span>
              <strong>پیشنهاد:</strong> {faText(recommendation.reason)}
              {recRow && <span className="block text-xs text-fresh/80">{[mallLine(recRow), formatDistance(recRow.distance_m)].filter(Boolean).join(' · ')}</span>}
            </span>
          </p>
        ) : (
          recNote && (
            <p data-recommendation className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm leading-6">
              <TriangleAlert className="mt-1 size-4 shrink-0 text-recent" />
              {faText(recNote)}
            </p>
          )
        )}
      </div>

      {rows.length > 0 && (
        <>
          {/* wide chat column: a table */}
          <div className="hidden overflow-x-auto @2xl:block">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-medium">
                  <th>فروشگاه / پاساژ</th>
                  <th>قیمت</th>
                  <th>تازگی</th>
                  <th>باز؟</th>
                  <th>پیگیری</th>
                  <th>نتیجه</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sections.map((sec) => [
                  sec.title ? (
                    <tr key={sec.key} data-floor-group className="bg-muted/30">
                      <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold text-primary">
                        {sec.title} · {toFaDigits(sec.rows.length)} فروشنده
                      </td>
                    </tr>
                  ) : null,
                  ...sec.rows.map((r) => (
                  <tr key={r.offer_id} data-mission-row onClick={() => setOpen(r)} className="cursor-pointer align-top hover:bg-muted/40 [&>td]:px-3 [&>td]:py-2.5">
                    <td>
                      <p className="font-semibold">{r.shop_name}</p>
                      <p className="text-[11px] text-muted-foreground">{[mallLine(r), formatDistance(r.distance_m)].filter(Boolean).join(' · ')}</p>
                      <p className="line-clamp-1 text-[11px] text-muted-foreground">{faText(r.product_title)}</p>
                    </td>
                    <td className="whitespace-nowrap">
                      <Price r={r} />
                    </td>
                    <td>
                      <FreshnessBadge freshness={r.freshness} days={r.price_age_days} />
                    </td>
                    <td>
                      <OpenDot open={r.open} />
                    </td>
                    <td>
                      <AvailabilityBadge a={r.followup ? { status: r.followup.status, at: r.followup.replied_at, newPrice: r.followup.new_price } : { status: 'unverified' }} />
                    </td>
                    <td className="space-y-1">
                      <VerdictPill v={r.verdict} />
                      <p className="text-[11px] leading-4 text-muted-foreground">{faText(r.verdict_reason)}</p>
                    </td>
                  </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          {/* phone: stacked rows */}
          <ul className="divide-y border-t @2xl:hidden">
            {sections.map((sec) => [
              sec.title ? (
                <li key={sec.key} data-floor-group className="bg-muted/30 px-3 py-1.5 text-[11px] font-semibold text-primary">
                  {sec.title} · {toFaDigits(sec.rows.length)} فروشنده
                </li>
              ) : null,
              ...sec.rows.map((r) => (
              <li key={r.offer_id}>
                <button data-mission-row onClick={() => setOpen(r)} className="w-full space-y-1.5 p-3 text-start hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{r.shop_name}</span>
                    <VerdictPill v={r.verdict} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{[mallLine(r), formatDistance(r.distance_m)].filter(Boolean).join(' · ')}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Price r={r} />
                    <FreshnessBadge freshness={r.freshness} days={r.price_age_days} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <OpenDot open={r.open} />
                    <AvailabilityBadge a={r.followup ? { status: r.followup.status, at: r.followup.replied_at, newPrice: r.followup.new_price } : { status: 'unverified' }} />
                  </div>
                  <p className="text-[11px] leading-4 text-muted-foreground">{faText(r.verdict_reason)}</p>
                </button>
              </li>
              )),
            ])}
          </ul>
        </>
      )}

      {/* opening-hours chart on demand: one line by default */}
      {output.visit_time && (
        <Collapsible className="border-t">
          <CollapsibleTrigger className="flex h-11 w-full items-center justify-between px-3 text-xs">
            <span className="flex items-center gap-1.5">
              <Clock3 className="size-3.5 text-primary" />
              کی برم؟ ساعت کاری این فروشنده‌ها
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3">
            <VisitTimeCard output={output.visit_time} />
          </CollapsibleContent>
        </Collapsible>
      )}

      {output.plan && (
        <div className="border-t p-3">
          <TripPlan plan={output.plan} planId={output.plan.plan_id} sharePath={output.plan.share_path} />
        </div>
      )}

      {output.next_actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t p-3">
          {output.next_actions.map((s) => (
            <button key={s.label} disabled={busy} onClick={() => applySuggestion(s)} className="h-9 rounded-full border bg-background px-3 text-xs hover:bg-muted disabled:opacity-60">
              {s.label}
            </button>
          ))}
        </div>
      )}
      {output.disclaimer && (
        <p className="flex items-start gap-1.5 border-t bg-muted/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {output.disclaimer}
        </p>
      )}
      {open && <ShopDetailsSheet open onOpenChange={(v) => !v && setOpen(null)} shopId={open.shop_id} productId={open.product_id} />}
    </section>
  );
}
