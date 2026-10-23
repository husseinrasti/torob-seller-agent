import { q } from '../db/client';
import { toFaDigits } from '../fa/digits';
import { openState, type WeeklyHours } from '../data/hours';
import type { Freshness } from '../data/quality';
import type { FollowupStatus } from '../agent/state';
import { followupResult, groundTruth } from './seller';
import { sellerTranscript, templateTranscript, type TranscriptLine } from './persona';

export type FollowupItem = {
  id: string;
  offer_id: string;
  shop_id: string;
  shop_name: string;
  product_id: string;
  product_title: string;
  channel: 'message' | 'call';
  status: FollowupStatus;
  old_price: number | null;
  new_price: number | null;
  closed_now: boolean;
  transcript: TranscriptLine[] | null;
  transcript_source: 'llm' | 'template' | null;
  created_at: string;
  due_at: string;
  resolved_at: string | null;
};

/** Stored in followups.transcript until the simulated reply is "delivered" at due_at. */
type Stored = {
  outcome: FollowupStatus;
  closed_now: boolean;
  reopen?: string | null;
  old_price: number | null;
  lines: TranscriptLine[] | null;
  source: 'llm' | 'template' | null;
  shop_name: string;
  product_title: string;
};

type Row = {
  id: string;
  session_id: string | null;
  offer_id: string;
  shop_id: string;
  product_id: string;
  channel: 'message' | 'call';
  status: FollowupStatus;
  new_price: number | null;
  transcript: Stored;
  created_at: Date;
  due_at: Date;
  resolved_at: Date | null;
};

function toItem(r: Row): FollowupItem {
  const resolved = r.status !== 'contacting' && r.status !== 'pending';
  return {
    id: r.id,
    offer_id: r.offer_id,
    shop_id: r.shop_id,
    shop_name: r.transcript.shop_name,
    product_id: r.product_id,
    product_title: r.transcript.product_title,
    channel: r.channel,
    status: r.status,
    old_price: r.transcript.old_price,
    new_price: resolved ? r.new_price : null,
    closed_now: r.transcript.closed_now,
    transcript: resolved ? r.transcript.lines : null,
    transcript_source: resolved ? r.transcript.source : null,
    created_at: new Date(r.created_at).toISOString(),
    due_at: new Date(r.due_at).toISOString(),
    resolved_at: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
  };
}

/**
 * Start simulated follow-ups. The deterministic outcome is fixed now; it becomes visible at due_at
 * (1.5–4 s later). The persona transcript is generated in the background (template when no LLM).
 */
export async function startFollowups(opts: {
  sessionId: string | null;
  offerIds: string[];
  channel: 'message' | 'call';
  question?: string | null;
  now: Date; // app clock (demo time) for open/closed; latency uses the wall clock
}): Promise<FollowupItem[]> {
  const offers = await q<{
    offer_id: string;
    shop_id: string;
    product_id: string;
    price: number | null;
    freshness: Freshness;
    median_price: number | null;
    shop_name: string;
    weekly_hours: WeeklyHours;
    persian_title: string;
  }>(
    `SELECT o.offer_id, o.shop_id, o.product_id, o.price_toman::float8 AS price, o.freshness, p.median_price::float8 AS median_price,
            s.name AS shop_name, s.weekly_hours, p.persian_title
       FROM offers o JOIN shops s USING (shop_id) JOIN products p USING (product_id)
      WHERE o.offer_id = ANY($1::text[])`,
    [opts.offerIds.slice(0, 5)],
  );
  const items: FollowupItem[] = [];
  const wall = Date.now();
  for (const o of opts.offerIds.map((id) => offers.find((x) => x.offer_id === id)).filter(Boolean) as typeof offers) {
    const os = openState(o.weekly_hours, opts.now);
    const closedNow = os.known && os.open === false;
    const truth = groundTruth({ offer_id: o.offer_id, price: o.price, freshness: o.freshness, reference_price: o.median_price });
    const result = followupResult(truth, opts.channel, closedNow);
    const reopen = os.nextOpen ? `${os.nextOpen.day} ${toFaDigits(os.nextOpen.time)} باز می‌شود` : os.opensAt ? `امروز ${toFaDigits(os.opensAt)} باز می‌شود` : null;
    const stored: Stored = {
      outcome: result.status,
      closed_now: closedNow,
      reopen,
      old_price: o.price,
      lines: null,
      source: null,
      shop_name: o.shop_name,
      product_title: o.persian_title,
    };
    const [row] = await q<Row>(
      `INSERT INTO followups (session_id, offer_id, shop_id, product_id, channel, question, status, new_price, transcript, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'contacting', $7, $8, $9) RETURNING *`,
      [opts.sessionId, o.offer_id, o.shop_id, o.product_id, opts.channel, opts.question ?? null, result.newPrice, JSON.stringify(stored), new Date(wall + truth.latencyMs)],
    );
    items.push(toItem({ ...row, new_price: row.new_price === null ? null : Number(row.new_price) }));
    // persona transcript in the background (bounded to ~3 s by sellerTranscript)
    void sellerTranscript({
      shopName: o.shop_name,
      productTitle: o.persian_title,
      channel: opts.channel,
      status: result.status as Exclude<FollowupStatus, 'pending' | 'contacting'>,
      oldPrice: o.price,
      newPrice: result.newPrice,
      closedNow,
      reopenLabel: reopen,
      question: opts.question,
    })
      .then(({ lines, source }) =>
        q(`UPDATE followups SET transcript = jsonb_set(jsonb_set(transcript, '{lines}', $2::jsonb), '{source}', to_jsonb($3::text)) WHERE id = $1`, [row.id, JSON.stringify(lines), source]),
      )
      .catch((e) => console.warn('[followups] transcript', e));
  }
  return items;
}

/** Current state of follow-ups; rows whose due time passed are resolved now (idempotent). */
export async function getFollowups(ids: string[], sessionId?: string): Promise<FollowupItem[]> {
  if (!ids.length) return [];
  const rows = sessionId
    ? await q<Row>(`SELECT * FROM followups WHERE id = ANY($1::uuid[]) AND session_id = $2`, [ids, sessionId])
    : await q<Row>(`SELECT * FROM followups WHERE id = ANY($1::uuid[])`, [ids]);
  const now = Date.now();
  const out: FollowupItem[] = [];
  for (const r of rows) {
    let row = { ...r, new_price: r.new_price === null ? null : Number(r.new_price) };
    if ((row.status === 'contacting' || row.status === 'pending') && new Date(row.due_at).getTime() <= now) {
      const t = row.transcript;
      const lines =
        t.lines ??
        templateTranscript({
          shopName: t.shop_name,
          productTitle: t.product_title,
          channel: row.channel,
          status: t.outcome as Exclude<FollowupStatus, 'pending' | 'contacting'>,
          oldPrice: t.old_price,
          newPrice: row.new_price,
          closedNow: t.closed_now,
          reopenLabel: t.reopen,
        });
      const stored: Stored = { ...t, lines, source: t.source ?? 'template' };
      const [upd] = await q<Row>(
        `UPDATE followups SET status = $2, resolved_at = due_at, transcript = $3 WHERE id = $1 AND status IN ('contacting','pending') RETURNING *`,
        [row.id, t.outcome, JSON.stringify(stored)],
      );
      if (upd) row = { ...upd, new_price: upd.new_price === null ? null : Number(upd.new_price) };
      else row = { ...row, status: t.outcome, resolved_at: row.due_at, transcript: stored };
    }
    out.push(toItem(row));
  }
  return ids.map((id) => out.find((x) => x.id === id)).filter((x): x is FollowupItem => Boolean(x));
}

/** Latest follow-up per offer for a session (to restore badges after reload). */
export async function sessionFollowups(sessionId: string): Promise<FollowupItem[]> {
  const rows = await q<{ id: string }>(
    `SELECT DISTINCT ON (offer_id) id FROM followups WHERE session_id = $1 ORDER BY offer_id, created_at DESC`,
    [sessionId],
  );
  return getFollowups(rows.map((r) => r.id));
}
