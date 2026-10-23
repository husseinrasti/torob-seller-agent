// Mission golden checks: compound requests run end to end through the same code as /api/chat's mission path
// (rules extraction → runMission with real search, simulated follow-ups and plan), offline model.
// Usage: pnpm missions   (part of pnpm golden; needs a seeded database)
import './load-env';
import { randomUUID } from 'node:crypto';
import { parseSituation, type Situation } from '../lib/agent/situation';
import { runTool } from '../lib/agent/tools';
import type { DecisionOutput } from '../lib/search/decide-data';
import type { TierKey } from '../lib/agent/decide';
import { localClock } from '../lib/data/hours';
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

// Situational decisions (S1–S4): the chat route's rules → decide_where_to_buy, at a demo time and place
const HAFT_TIR = { lat: 35.715, lon: 51.4255, label: 'هفت‌تیر', source: 'map' as const };
const SOHREVARDI = { lat: 35.7305, lon: 51.4355, label: 'سهروردی', source: 'map' as const };
type Situ = { name: string; text: string; demo: string; loc?: SessionState['location']; checks: (d: DecisionOutput, sit: Situation) => Check[] };
const tier = (d: DecisionOutput, k: TierKey) => d.tiers.find((t) => t.key === k)!;
const SITUATIONS: Situ[] = [
  {
    name: 'S1 night charger at هفت‌تیر',
    text: 'ساعت ۱۱:۳۰ شب، شارژر گوشی می‌خوام',
    demo: '2026-10-25T23:30',
    loc: HAFT_TIR,
    checks: (d) => [
      ['T1 empty and said so', tier(d, 'open_listed_near').empty && /هیچ فروشنده‌ی ثبت‌شده/.test(tier(d, 'open_listed_near').verdict), tier(d, 'open_listed_near').verdict],
      ['T2 open far, or «nothing open up to 8 km» said', !tier(d, 'open_listed_far').empty || /تا ۸ کیلومتر هم/.test(tier(d, 'open_listed_far').verdict), tier(d, 'open_listed_far').verdict],
      ['T3 بورس موبایل جمهوری within 3 km, hours from its shops', /بورس موبایل جمهوری/.test(tier(d, 'hub_nearby').hubs[0]?.name ?? '') && tier(d, 'hub_nearby').hubs[0].distance_m <= 3000, tier(d, 'hub_nearby').hubs[0]?.pill],
      ['T5 earliest opening tomorrow', /فردا/.test(tier(d, 'opens_soonest').shops[0]?.opens?.label ?? ''), tier(d, 'opens_soonest').verdict],
      ['recommended by urgency «now» (T2 if ≤ 25 min, else the hub)', d.recommended === (tier(d, 'open_listed_far').empty ? 'hub_nearby' : 'open_listed_far'), d.recommended ?? ''],
      ['no shop shown open at 23:30 unless its hours say so', d.tiers.every((t) => t.shops.every((s) => s.open.open !== true || s.open.known)), ''],
    ],
  },
  {
    name: 'S2 evening charger at هفت‌تیر',
    text: 'همین الان شارژر گوشی می‌خوام',
    demo: '2026-10-25T18:40',
    loc: HAFT_TIR,
    checks: (d) => [
      ['T1 has open shops, some «تا ۱۹:۰۰ · عجله کن»', tier(d, 'open_listed_near').shops.some((s) => s.hurry && s.open.closesAt === '19:00'), tier(d, 'open_listed_near').verdict],
      ['T2 includes shops closing later', tier(d, 'open_listed_far').shops.some((s) => (s.closes_in_min ?? 0) > 20), tier(d, 'open_listed_far').verdict],
      ['recommended T1', d.recommended === 'open_listed_near', d.recommended ?? ''],
    ],
  },
  {
    name: 'S3 Friday noon headphones at سهروردی',
    text: 'جمعه ظهر هدفون می‌خوام',
    demo: '2026-10-30T11:00',
    loc: SOHREVARDI,
    checks: (d, sit) => [
      ['the moment is Friday 13:00', /جمعه ۱۳:۰۰/.test(d.at_label) && Boolean(sit.at), d.at_label],
      ['Friday closures said («جمعه N٪ … تعطیل»)', /جمعه [۰-۹]+٪/.test(d.day_note ?? ''), d.day_note ?? ''],
      ['nothing open near is invented', tier(d, 'open_listed_near').shops.every((s) => s.open.open === true && s.open.known), tier(d, 'open_listed_near').verdict],
      ['the earliest opening is after Friday', /شنبه|یکشنبه/.test(tier(d, 'opens_soonest').shops[0]?.opens?.label ?? ''), tier(d, 'opens_soonest').verdict],
    ],
  },
  {
    name: 'S4 Type-C cable, train in 15 min, at فردوسی',
    text: 'کابل تایپ‌سی، ۱۵ دقیقه دیگه قطار دارم',
    demo: '2026-10-25T16:00',
    checks: (d) => [
      ['walking only, radius 600 m', d.transport === 'walk' && d.radius_m === 600, `${d.transport} ${d.radius_m}`],
      ['nearest open first, with closing times', tier(d, 'open_listed_near').shops.every((s, i, a) => i === 0 || a[i - 1].travel.min <= s.travel.min) && Boolean(tier(d, 'open_listed_near').shops[0]?.open.closesAt), tier(d, 'open_listed_near').verdict],
      ['every open pick reachable on foot within the budget', tier(d, 'open_listed_near').shops.every((s) => s.travel.mode === 'walk' && s.travel.min <= 8), ''],
    ],
  },
];

async function situational(): Promise<Check[]> {
  const out: Check[] = [];
  for (const c of SITUATIONS) {
    const state: SessionState = structuredClone(DEFAULT_STATE);
    state.demoTime = c.demo;
    if (c.loc) state.location = c.loc;
    const now = appNow(c.demo);
    const sit = parseSituation(c.text, now);
    console.log(`
${c.name}: «${c.text}»`);
    const input: Record<string, unknown> = { need_text: sit.need_text, urgency: sit.urgency };
    if (sit.radius_m) input.radius_m = sit.radius_m;
    if (sit.transport) input.transport = sit.transport;
    if (sit.at && Math.abs(sit.at.getTime() - now.getTime()) > 60_000) {
      input.at_time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(sit.at);
      input.day_offset = (localClock(sit.at).dayIdx - localClock(now).dayIdx + 7) % 7;
    }
    const checks: Check[] = [['strong situational request (routes before missions)', sit.situational && sit.strong, sit.need_text]];
    const d = (await runTool('decide_where_to_buy', input, { sessionId: randomUUID(), state, now })) as DecisionOutput;
    checks.push(...c.checks(d, sit));
    checks.push(['verdict is one sentence from the engine', d.verdict.split(/[.؟!]\s/).length <= 2, d.verdict]);
    for (const ch of checks) console.log(`${ch[1] ? 'PASS' : 'FAIL'}  ${ch[0]}${ch[2] ? ` — ${ch[2]}` : ''}`);
    out.push(...checks);
  }
  return out;
}

async function main() {
  let failed = 0;
  let total = 0;
  for (const [, ok] of await situational()) {
    total++;
    if (!ok) failed++;
  }
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
