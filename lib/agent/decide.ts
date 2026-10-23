import { FA_DAY, JS_DAY_KEYS, localClock, openState, shiftsOf, type OpenState, type WeeklyHours } from '../data/hours';
import { toFaDigits } from '../fa/digits';
import { formatDistance } from '../fa/format';

/**
 * «کجا بخرم، همین الان؟» (pure, deterministic): shops that list the need and hubs that probably sell it,
 * evaluated at one moment, sorted into five tiers with an honest confidence each, a recommended tier
 * by urgency, and the trade-offs between them. All inputs come from the database; no I/O here.
 */

export type Urgency = 'now' | 'today' | 'flexible';
export type Transport = 'auto' | 'walk' | 'car';
export type TierKey = 'open_listed_near' | 'open_listed_far' | 'hub_nearby' | 'unknown_hours_near' | 'opens_soonest';
export type Confidence = 'high' | 'medium' | 'low';

export type DecideShop = {
  shop_id: string;
  offer_id: string | null;
  name: string;
  lat: number;
  lon: number;
  distance_m: number;
  /** lists the product / a product of the need's categories in Torob */
  lists: boolean;
  price: number | null;
  weekly_hours: WeeklyHours;
  mall: string | null;
  address_short: string | null;
};

export type DecideHub = {
  hub_id: string;
  name: string;
  lat: number;
  lon: number;
  radius_m: number;
  distance_m: number;
  source: 'derived' | 'curated' | 'both';
  note: string | null;
  typical_hours: { open: string; close: string } | null;
  shop_count: number;
  listed_count: number;
  category_only_count: number;
  /** weekly hours of the hub's shops of the need's family (the open share is computed at `at`) */
  family_hours: WeeklyHours[];
};

export type Travel = { mode: 'walk' | 'car'; min: number };

export type ShopPick = {
  shop_id: string;
  offer_id: string | null;
  name: string;
  lat: number;
  lon: number;
  distance_m: number;
  price: number | null;
  mall: string | null;
  address_short: string | null;
  open: OpenState;
  closes_in_min: number | null;
  /** closes in < 45 min */
  hurry: boolean;
  travel: Travel;
  /** closes before you would get there */
  arrives_after_close: boolean;
  /** next opening for closed shops («فردا ۱۰:۰۰») */
  opens: Opening | null;
};

export type HubPick = {
  hub_id: string;
  name: string;
  lat: number;
  lon: number;
  radius_m: number;
  distance_m: number;
  travel: Travel;
  source: DecideHub['source'];
  note: string | null;
  /** share of the hub's registered shops of this kind open at `at` (null: no hours known) */
  open_share: number | null;
  known: number;
  /** median closing time that day, or the curated typical close */
  typical_close: string | null;
  /** hours only from general knowledge / too few registered hours */
  typical_only: boolean;
  /** share of them closed all day (Fridays) */
  closed_share: number | null;
  confidence: Confidence;
  category_only_count: number;
  listed_count: number;
  shop_count: number;
  pill: string;
};

export type Tier = {
  key: TierKey;
  title: string;
  verdict: string;
  confidence: Confidence;
  empty: boolean;
  shops: ShopPick[];
  hubs: HubPick[];
};

export type Decision = {
  at: string;
  at_label: string;
  need: string;
  radius_m: number;
  urgency: Urgency;
  transport: Transport;
  tiers: Tier[];
  recommended: TierKey | null;
  verdict: string;
  tradeoffs: string[];
  /** «جمعه ۸۸٪ فروشنده‌های این اطراف تعطیل‌اند» when most listed shops within 3 km are closed all day */
  day_note: string | null;
  /** listed shops within the radius that are closed at `at` (faint dots on the map) */
  closed_near: Array<{ shop_id: string; name: string; lat: number; lon: number; label: string }>;
  counts: { listed_near: number; open_near: number; closed_near: number; unknown_near: number };
};

export const WALK_M_PER_MIN = 80;
/** 25 km/h in city traffic */
export const CAR_M_PER_MIN = 25_000 / 60;
const AUTO_WALK_MAX_M = 1200;
export const FAR_MAX_M = 8000;
export const HUB_MAX_M = 3000;
const HURRY_MIN = 45;
const T2_MAX_TRAVEL_MIN = 25;

export function travelTime(distance_m: number, transport: Transport = 'auto'): Travel {
  const mode = transport === 'auto' ? (distance_m <= AUTO_WALK_MAX_M ? 'walk' : 'car') : transport;
  const speed = mode === 'walk' ? WALK_M_PER_MIN : CAR_M_PER_MIN;
  return { mode, min: Math.max(1, Math.round(distance_m / speed)) };
}

export const travelLabel = (t: Travel) => `≈ ${toFaDigits(t.min)} دقیقه ${t.mode === 'walk' ? 'پیاده' : 'با ماشین'}`;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const fa = (s: string) => toFaDigits(s);

/** Minutes until the shop next opens after `at` (later today or the next days; unknown days are skipped). */
export type Opening = { in_min: number; label: string; hhmm: string; day_offset: number };

export function nextOpening(weekly: WeeklyHours, at: Date): Opening | null {
  if (!weekly) return null;
  const { dayIdx, minutes } = localClock(at);
  for (let d = 0; d <= 7; d++) {
    const key = JS_DAY_KEYS[(dayIdx + d) % 7];
    if (weekly[key]?.status === 'closed') continue;
    const shifts = shiftsOf(weekly[key]);
    if (!shifts) continue;
    const s = d === 0 ? shifts.find(([start]) => start > minutes) : shifts[0];
    if (!s) continue;
    const day = d === 0 ? 'امروز' : d === 1 ? 'فردا' : FA_DAY[key];
    return { in_min: d * 1440 + s[0] - minutes, label: `${day} ${fa(hhmm(s[0]))}`, hhmm: hhmm(s[0]), day_offset: d };
  }
  return null;
}

function pick(s: DecideShop, at: Date, transport: Transport): ShopPick {
  const open = openState(s.weekly_hours, at);
  const { minutes } = localClock(at);
  let closesIn: number | null = null;
  if (open.open && open.closesAt) {
    const close = open.closesAt === '00:00' ? 1440 : toMin(open.closesAt);
    closesIn = Math.max(0, close - minutes);
  }
  const travel = travelTime(s.distance_m, transport);
  return {
    shop_id: s.shop_id,
    offer_id: s.offer_id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    distance_m: s.distance_m,
    price: s.price,
    mall: s.mall,
    address_short: s.address_short,
    open,
    closes_in_min: closesIn,
    hurry: closesIn !== null && closesIn < HURRY_MIN,
    travel,
    arrives_after_close: closesIn !== null && travel.min >= closesIn,
    opens: open.open ? null : nextOpening(s.weekly_hours, at),
  };
}

/** Open share of a hub's shops of this kind at `at`; null when none of them has hours that day. */
export function hubOpenAt(hours: WeeklyHours[], at: Date): { share: number | null; known: number; close: string | null; closed_share: number | null } {
  let known = 0;
  let open = 0;
  let closedDay = 0;
  const closes: number[] = [];
  const { dayIdx } = localClock(at);
  const key = JS_DAY_KEYS[dayIdx];
  for (const w of hours) {
    const st = openState(w, at);
    if (!st.known) continue;
    known++;
    if (st.open) open++;
    if (w?.[key]?.status === 'closed') closedDay++;
    const sh = shiftsOf(w?.[key]);
    if (sh) closes.push(sh[sh.length - 1][1]);
  }
  closes.sort((a, b) => a - b);
  const median = closes.length ? closes[Math.floor((closes.length - 1) / 2)] : null;
  return { share: known ? open / known : null, known, close: median === null ? null : hhmm(median), closed_share: known ? closedDay / known : null };
}

function hubPick(h: DecideHub, at: Date, transport: Transport): HubPick {
  const o = hubOpenAt(h.family_hours, at);
  const typicalOnly = o.known < 5;
  const { minutes } = localClock(at);
  const typicalOpen = h.typical_hours ? minutes >= toMin(h.typical_hours.open) && minutes < toMin(h.typical_hours.close) : null;
  const share = typicalOnly ? null : o.share;
  const confidence: Confidence = share !== null ? (share >= 0.5 ? 'medium' : 'low') : typicalOpen ? 'medium' : 'low';
  const close = (typicalOnly ? h.typical_hours?.close : o.close) ?? h.typical_hours?.close ?? null;
  const travel = travelTime(h.distance_m, transport);
  return {
    hub_id: h.hub_id,
    name: h.name,
    lat: h.lat,
    lon: h.lon,
    radius_m: h.radius_m,
    distance_m: h.distance_m,
    travel,
    source: h.source,
    note: h.note,
    open_share: share,
    known: o.known,
    typical_close: close,
    typical_only: typicalOnly,
    closed_share: typicalOnly ? null : o.closed_share,
    confidence,
    category_only_count: h.category_only_count,
    listed_count: h.listed_count,
    shop_count: h.shop_count,
    // short for the map: «بورس موبایل جمهوری · ۲٫۷ کیلومتر · احتمالاً تا ۲۰:۰۰»
    pill: `${h.name.replace(/\s*\(.*\)$/u, '')} · ${formatDistance(h.distance_m)}${close ? ` · ${typicalOnly ? 'معمولاً' : 'احتمالاً'} تا ${fa(close)}` : ''}`,
  };
}

const TITLES: Record<TierKey, string> = {
  open_listed_near: 'باز و نزدیک',
  open_listed_far: 'باز، ولی دورتر',
  hub_nearby: 'بورس نزدیک',
  unknown_hours_near: 'ساعتش ثبت نشده',
  opens_soonest: 'زودتر از همه باز می‌شود',
};

const closesText = (p: ShopPick) => (p.open.closesAt ? `تا ${fa(p.open.closesAt === '00:00' ? '24:00' : p.open.closesAt)}` : '');

export type DecideInput = {
  shops: DecideShop[];
  hubs: DecideHub[];
  at: Date;
  need: string;
  radius_m: number;
  urgency: Urgency;
  transport?: Transport;
  /** the real «now» — when `at` is later (time scrubber, «جمعه ظهر»), sentences say «ساعت …» instead of «الان» */
  now?: Date;
};

export function decide(input: DecideInput): Decision {
  const { at, need, radius_m, urgency } = input;
  const transport = input.transport ?? 'auto';
  const listed = input.shops.filter((s) => s.lists && s.distance_m <= FAR_MAX_M).map((s) => pick(s, at, transport));
  const byTravel = (a: ShopPick, b: ShopPick) => Number(a.arrives_after_close) - Number(b.arrives_after_close) || a.travel.min - b.travel.min || a.distance_m - b.distance_m;
  const near = listed.filter((p) => p.distance_m <= radius_m);
  const t1 = near.filter((p) => p.open.open === true).sort(byTravel);
  const t2 = listed.filter((p) => p.distance_m > radius_m && p.open.open === true).sort(byTravel);
  const hubs = input.hubs
    .filter((h) => h.distance_m <= HUB_MAX_M)
    .map((h) => hubPick(h, at, transport))
    .sort((a, b) => (b.open_share ?? -1) - (a.open_share ?? -1) || a.distance_m - b.distance_m)
    .slice(0, 3);
  // unknown hours: listed shops first (one tap to ask), then category-only ones nearby
  const unknown = input.shops
    .filter((s) => s.distance_m <= radius_m)
    .map((s) => ({ s, p: pick(s, at, transport) }))
    .filter(({ p }) => !p.open.known)
    .sort((a, b) => Number(b.s.lists) - Number(a.s.lists) || a.s.distance_m - b.s.distance_m)
    .map(({ p }) => p);
  // opens soonest: listed shops within the radius (3 km when none there), closed now
  const closedPool = (near.some((p) => p.open.known && !p.open.open) ? near : listed.filter((p) => p.distance_m <= HUB_MAX_M)).filter((p) => p.open.known && !p.open.open && p.opens);
  const t5 = [...closedPool].sort((a, b) => a.opens!.in_min - b.opens!.in_min || a.distance_m - b.distance_m).slice(0, 3);

  const r = formatDistance(radius_m);
  const later = input.now && Math.abs(at.getTime() - input.now.getTime()) > 5 * 60_000;
  const sameDay = input.now && localClock(input.now).dayIdx === localClock(at).dayIdx && at.getTime() - input.now.getTime() < 86_400_000;
  const { dayIdx, minutes } = localClock(at);
  const dayKey = JS_DAY_KEYS[dayIdx];
  const dayName = FA_DAY[dayKey];
  const when = later ? `${sameDay ? '' : `${dayName} `}ساعت ${fa(hhmm(minutes))}` : 'الان';
  // most listed shops around closed all day (Fridays): said once, up front
  const around = input.shops.filter((x) => x.lists && x.distance_m <= HUB_MAX_M);
  const knownDay = around.filter((x) => x.weekly_hours?.[dayKey]?.status === 'closed' || shiftsOf(x.weekly_hours?.[dayKey]));
  const closedDay = knownDay.filter((x) => x.weekly_hours?.[dayKey]?.status === 'closed').length;
  const dayNote = knownDay.length >= 3 && closedDay / knownDay.length >= 0.5 ? `${dayName} ${toFaDigits(Math.round((closedDay / knownDay.length) * 100))}٪ فروشنده‌های ${need} در ${formatDistance(HUB_MAX_M)} اطرافت تعطیل‌اند.` : null;
  const tiers: Tier[] = [
    {
      key: 'open_listed_near',
      title: TITLES.open_listed_near,
      confidence: 'high',
      empty: !t1.length,
      shops: t1.slice(0, 5),
      hubs: [],
      verdict: t1.length
        ? `${toFaDigits(t1.length)} فروشنده‌ی ${need} در ${r} اطرافت ${when} باز است؛ نزدیک‌ترین «${t1[0].name}» ${closesText(t1[0])}${t1[0].hurry ? ' — عجله کن' : ''}.`
        : `در ${r} اطرافت هیچ فروشنده‌ی ثبت‌شده‌ی ${need} ${when} باز نیست${near.length ? ` (${toFaDigits(near.length)} فروشنده هست، همه بسته یا بی‌ساعت)` : ''}.`,
    },
    {
      key: 'open_listed_far',
      title: TITLES.open_listed_far,
      confidence: t2[0]?.hurry || t2[0]?.arrives_after_close ? 'medium' : 'high',
      empty: !t2.length,
      shops: t2.slice(0, 5),
      hubs: [],
      verdict: t2.length
        ? `در ترب «${t2[0].name}» در ${formatDistance(t2[0].distance_m)}ی‌ات ${later ? `${when} ` : ''}باز است (${travelLabel(t2[0].travel)}) ${closesText(t2[0])}${t2[0].arrives_after_close ? ' — ولی تا برسی بسته می‌شود' : t2[0].hurry ? ' — عجله کن' : ''}.`
        : `تا ${formatDistance(FAR_MAX_M)} هم فروشنده‌ی بازی برای ${need} در ترب ثبت نشده.`,
    },
    {
      key: 'hub_nearby',
      title: TITLES.hub_nearby,
      confidence: hubs[0]?.confidence ?? 'low',
      empty: !hubs.length,
      shops: [],
      hubs,
      verdict: hubs.length
        ? `به نظر می‌رسد نزدیک «${hubs[0].name}» هستی (${formatDistance(hubs[0].distance_m)})؛ شاید آن‌جا مغازه‌ای باز باشد که ${need} بفروشد ولی در ترب ثبت نشده${
            hubs[0].closed_share !== null && hubs[0].closed_share >= 0.5
              ? ` — ولی ${dayName} ${toFaDigits(Math.round(hubs[0].closed_share * 100))}٪ مغازه‌های ثبت‌شده‌اش تعطیل‌اند`
              : hubs[0].open_share !== null
                ? ` — ${later ? when : 'این ساعت'} ${toFaDigits(Math.round(hubs[0].open_share * 100))}٪ مغازه‌های ثبت‌شده‌اش باز بوده‌اند`
                : hubs[0].typical_close
                  ? ` — معمولاً تا ${fa(hubs[0].typical_close)}`
                  : ''
          }.`
        : `بورس یا راسته‌ای برای ${need} در ${formatDistance(HUB_MAX_M)} اطرافت نمی‌شناسم.`,
    },
    {
      key: 'unknown_hours_near',
      title: TITLES.unknown_hours_near,
      confidence: 'low',
      empty: !unknown.length,
      shops: unknown.slice(0, 5),
      hubs: [],
      verdict: unknown.length ? `${toFaDigits(unknown.length)} مغازه‌ی نزدیک ساعتش ثبت نشده؛ شاید باز باشد — بپرس.` : 'همه‌ی مغازه‌های نزدیک ساعت کاری ثبت‌شده دارند.',
    },
    {
      key: 'opens_soonest',
      title: TITLES.opens_soonest,
      confidence: 'high',
      empty: !t5.length,
      shops: t5,
      hubs: [],
      verdict: t5.length ? `زودترین: «${t5[0].name}» ${t5[0].opens!.label} باز می‌شود (${formatDistance(t5[0].distance_m)}).` : 'زمان باز شدن فروشنده‌های نزدیک ثبت نشده.',
    },
  ];
  const get = (k: TierKey) => tiers.find((t) => t.key === k)!;
  const usable = (k: TierKey) => !get(k).empty && (k !== 'open_listed_far' || (t2[0].travel.min <= T2_MAX_TRAVEL_MIN && !t2[0].arrives_after_close));
  const order: TierKey[] =
    urgency === 'now'
      ? ['open_listed_near', 'open_listed_far', 'hub_nearby', 'unknown_hours_near', 'opens_soonest']
      : ['open_listed_near', 'opens_soonest', 'open_listed_far', 'hub_nearby', 'unknown_hours_near'];
  const recommended = order.find(usable) ?? (!get('open_listed_far').empty ? 'open_listed_far' : null);

  const tradeoffs: string[] = [];
  if (dayNote) tradeoffs.push(dayNote);
  if (t1[0]?.hurry) tradeoffs.push(`«${t1[0].name}» نزدیک است ولی ${toFaDigits(t1[0].closes_in_min!)} دقیقه‌ی دیگر می‌بندد.`);
  else if (t1.some((p) => p.hurry)) {
    const soon = t1.filter((p) => p.hurry);
    tradeoffs.push(`${toFaDigits(soon.length)} تا از بازهای نزدیک تا ${fa(soon[0].open.closesAt ?? '')} می‌بندند — اگر یکی از آن‌هاست، عجله کن.`);
  }
  if (!t1.length && t2.length && hubs.length) tradeoffs.push(`«${t2[0].name}» ${formatDistance(t2[0].distance_m)} دورتر ولی مطمئن (در ترب باز است)؛ «${hubs[0].name}» ${formatDistance(hubs[0].distance_m)} ولی نامطمئن (در ترب ثبت نشده).`);
  if (recommended !== 'opens_soonest' && t5.length && (!t1.length || urgency !== 'now')) tradeoffs.push(`اگر عجله نداری، «${t5[0].name}» ${t5[0].opens!.label} در ${formatDistance(t5[0].distance_m)}ی‌ات باز می‌شود — مطمئن‌تر.`);
  if (!t1.length && unknown.some((p) => p.offer_id)) tradeoffs.push(`${toFaDigits(unknown.filter((p) => p.offer_id).length)} فروشنده‌ی نزدیک ساعتش ثبت نشده — یک پیام کوتاه تکلیف را روشن می‌کند.`);

  // recommended first, then the rest in the engine's order; empty tiers stay (they say «nothing here» honestly)
  const ordered = recommended ? [get(recommended), ...order.filter((k) => k !== recommended).map(get)] : order.map(get);
  const closedNear = near.filter((p) => p.open.known && p.open.open === false);
  return {
    at: at.toISOString(),
    at_label: `${FA_DAY[JS_DAY_KEYS[dayIdx]]} ${fa(hhmm(minutes))}`,
    need,
    radius_m,
    urgency,
    transport,
    tiers: ordered,
    recommended,
    verdict: recommended ? get(recommended).verdict : get('open_listed_near').verdict,
    tradeoffs: tradeoffs.slice(0, 3),
    day_note: dayNote,
    closed_near: closedNear.slice(0, 80).map((p) => ({ shop_id: p.shop_id, name: p.name, lat: p.lat, lon: p.lon, label: `بسته${p.opens ? ` · ${p.opens.label}` : ''}` })),
    counts: { listed_near: near.length, open_near: t1.length, closed_near: closedNear.length, unknown_near: near.filter((p) => !p.open.known).length },
  };
}

/** The agent's reply after the map (≤ 2 sentences): what to do now, then the main trade-off. No LLM. */
export function decisionSpeech(d: Decision): string {
  const rec = d.tiers.find((t) => t.key === d.recommended);
  const s = rec?.shops[0];
  const h = rec?.hubs[0];
  let first: string;
  switch (d.recommended) {
    case 'open_listed_near':
      first = `پیشنهادم «${s!.name}» است: ${travelLabel(s!.travel)}، ${closesText(s!)}${s!.hurry ? ' — عجله کن' : ''}.`;
      break;
    case 'open_listed_far':
      first = `نزدیکت چیزی باز نیست؛ «${s!.name}» در ${formatDistance(s!.distance_m)} باز است (${travelLabel(s!.travel)}).`;
      break;
    case 'hub_nearby':
      first = `در ترب چیزی نزدیکت باز نیست؛ بهترین شانس «${h!.name.replace(/\s*\(.*\)$/u, '')}» در ${formatDistance(h!.distance_m)} است، ولی ${h!.confidence === 'low' ? 'مطمئن نیست' : 'فقط احتمالی است'}.`;
      break;
    case 'unknown_hours_near':
      first = 'فروشنده‌ی بازی در ترب ثبت نشده؛ چند مغازه‌ی نزدیک ساعتشان معلوم نیست — یک پیام بپرس.';
      break;
    case 'opens_soonest':
      first = `فعلاً نزدیکت چیزی باز نیست؛ «${s!.name}» ${s!.opens!.label} باز می‌شود.`;
      break;
    default:
      first = `برای ${d.need} در این ساعت و این محدوده فروشنده‌ای در ترب پیدا نکردم.`;
  }
  return [first, d.tradeoffs[0]].filter(Boolean).join(' ');
}
