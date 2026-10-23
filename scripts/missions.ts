// Mission golden checks: compound requests run end to end through the same code as /api/chat's mission path
// (rules extraction → runMission with real search, simulated follow-ups and plan), offline model.
// Usage: pnpm missions   (part of pnpm golden; needs a seeded database)
import './load-env';
import { randomUUID } from 'node:crypto';
import { pool, q } from '../lib/db/client';
import { DEFAULT_STATE, type SessionState } from '../lib/agent/state';
import { extractMission, isMission } from '../lib/agent/mission/extract';
import { runMission } from '../lib/agent/mission/run';
import type { MissionResult } from '../lib/agent/mission/types';
import { appNow } from '../lib/data/hours';

process.env.LLM_PROVIDER = 'offline'; // deterministic: rules extraction, template seller transcripts

const DEMO_TIME = '2026-10-25T16:00';
const A17_128_4 = 'product_d24b597176bdf2a82035dcc2';
const pendingish = (s?: string) => s === 'pending' || s === 'contacting';

type Check = [string, boolean, string?];
type Case = { text: string; state?: (s: SessionState) => void; mission?: boolean; checks: (r: MissionResult, s: SessionState) => Check[] };

const CASES: Case[] = [
  {
    text: 'یه گوشی سامسونگ حدود ۵۰ میلیون میخوام، محدوده سعادت آباد، خودت بپرس قیمت‌ها آپدیته و الان بازن؟',
    checks: (r) => [
      ['location = سعادت‌آباد', r.location.label === 'سعادت‌آباد', r.location.label],
      ['radius widened ≥ 3 km with a coverage note', r.coverage.used_radius_m >= 3000 && Boolean(r.coverage.note), `${r.coverage.used_radius_m} m · ${r.coverage.note ?? '-'}`],
      ['≥ 1 seller row', r.rows.length >= 1, String(r.rows.length)],
      ['follow-ups awaited (not all pending)', r.rows.some((x) => x.followup && !pendingish(x.followup.status)), r.rows.map((x) => x.followup?.status ?? '-').join(',')],
      ['open/closed reported per row', r.rows.every((x) => x.open.label.length > 0)],
      ['recommendation or «پیشنهادی ندارم چون…»', Boolean(r.recommendation) || /^پیشنهادی ندارم چون/.test(r.recommendation_note ?? ''), r.recommendation?.reason ?? r.recommendation_note],
    ],
  },
  {
    text: 'هدفون بلوتوثی تا ۳ میلیون نزدیک میدان ولیعصر، فقط اونایی که الان بازن، ارزون‌ترین اول',
    checks: (r, s) => {
      const prices = r.rows.map((x) => x.price).filter((p): p is number => p !== null);
      return [
        ['intent cheapest + open_now', r.intent === 'cheapest' && s.filters.open_now === true],
        ['rows sorted by price', prices.every((p, i) => i === 0 || prices[i - 1] <= p), prices.slice(0, 5).join(' ≤ ')],
        ['only open sellers (or a note that none are)', r.rows.every((x) => x.open.open === true) || Boolean(r.conditions_note)],
      ];
    },
  },
  {
    text: 'ارزون‌ترین A17 توی پاساژ علاءالدین کیه و موجود داره؟ زنگ بزن',
    checks: (r) => [
      ['location = mall centroid, radius 300 m', r.location.kind === 'mall' && r.coverage.requested_radius_m === 300, `${r.location.label} · ${r.coverage.requested_radius_m}`],
      ['channel call', r.channel === 'call'],
      ['availability verified', r.rows.some((x) => x.followup && !pendingish(x.followup.status))],
    ],
  },
  {
    text: 'یه پاوربانک ۲۰ هزار بین ۱ تا ۲ میلیون تجریش، قسطی باشه',
    checks: (r, s) => [
      ['range budget 1–2 M', r.band?.min === 1_000_000 && r.band?.max === 2_000_000],
      ['installment condition', s.filters.installment === true],
      ['relaxation note when empty', r.rows.length > 0 || (/قسطی|بازه|بودجه/.test(r.conditions_note ?? '') && r.next_actions.some((a) => a.label.startsWith('بدون'))), r.conditions_note ?? `${r.rows.length} rows`],
    ],
  },
  {
    text: 'گوشی سامسونگ تا ۶۰ میلیون نزدیک من، ۳ تا فروشنده بهتر رو پیگیری کن و برنامه مراجعه بده',
    checks: (r) => [
      ['3 follow-ups', r.rows.filter((x) => x.followup).length === 3],
      ['plan built after the follow-ups', Boolean(r.plan?.plan_id), r.plan ? `${r.plan.total_minutes} min` : r.steps.find((x) => x.id === 'plan')?.detail],
    ],
  },
  {
    text: 'دوربین مداربسته برای مغازه، نارمک',
    checks: (r) => [
      ['location = نارمک', r.location.label === 'نارمک'],
      ['coverage note (≥ 5 km searched)', Boolean(r.coverage.note) && r.coverage.used_radius_m >= 5000, r.coverage.note],
      ['offers central Tehran', r.next_actions.some((a) => /مرکز شهر/.test(a.label))],
    ],
  },
  { text: 'قهوه ساز خونگی نمیدونم کدوم، حدود ۵ میلیون', mission: false, checks: () => [] },
  {
    text: 'همون گوشی قبلی رو این بار تو فردوسی چک کن',
    state: (s) => {
      s.chosenProduct = A17_128_4;
      s.candidates = [A17_128_4];
    },
    checks: (r) => [
      ['uses the chosen product', r.rows.length > 0 && r.rows.every((x) => x.product_id === A17_128_4), `${r.rows.length} rows`],
      ['location = فردوسی', r.location.label === 'فردوسی'],
      ['checked with sellers', r.rows.some((x) => x.followup)],
    ],
  },
];

/** Every row must be a real offer: same shop and listed price as the database; follow-ups real simulator rows. */
async function honest(r: MissionResult, sessionId: string): Promise<Check> {
  if (!r.rows.length) return ['no fabricated rows', true, 'no rows'];
  const offers = await q<{ offer_id: string; shop_id: string; price: number | null }>('SELECT offer_id, shop_id, price_toman::float8 AS price FROM offers WHERE offer_id = ANY($1::text[])', [r.rows.map((x) => x.offer_id)]);
  const fus = await q<{ id: string; status: string }>('SELECT id::text, status FROM followups WHERE session_id = $1', [sessionId]);
  const ok = r.rows.every((x) => {
    const o = offers.find((y) => y.offer_id === x.offer_id);
    const fu = x.followup ? fus.find((y) => y.id === x.followup!.id) : null;
    return o && o.shop_id === x.shop_id && o.price === x.price && (!x.followup || (fu && fu.status === x.followup.status));
  });
  return ['rows = DB offers, follow-ups = simulator rows', ok];
}

async function main() {
  let failed = 0;
  let total = 0;
  for (const c of CASES) {
    const state: SessionState = structuredClone(DEFAULT_STATE);
    state.demoTime = DEMO_TIME;
    c.state?.(state);
    const sessionId = randomUUID();
    const started = Date.now();
    const draft = await extractMission(c.text, state, { llm: false });
    const mission = isMission(draft.mission, { hasProductContext: Boolean(state.chosenProduct || state.candidates.length) });
    console.log(`\n«${c.text}»`);
    const checks: Check[] = [['is a mission', mission === (c.mission ?? true), mission ? 'mission' : 'normal path']];
    if (mission && c.mission !== false) {
      const r = await runMission(draft.mission, c.text, { sessionId, state, now: appNow(DEMO_TIME) });
      checks.push(...c.checks(r, state), await honest(r, sessionId));
      checks.push(['within the 20 s mission budget', Date.now() - started < 20_000, `${((Date.now() - started) / 1000).toFixed(1)} s`]);
    }
    for (const [name, ok, detail] of checks) {
      total++;
      if (!ok) failed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    }
    await q('DELETE FROM followups WHERE session_id = $1', [sessionId]);
    await q('DELETE FROM plans WHERE session_id = $1', [sessionId]);
  }
  console.log(`\nmissions: ${total - failed}/${total} checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}

main();
