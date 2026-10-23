import { toFaDigits } from '../fa/digits';
import { FA_DAY, JS_DAY_KEYS, hoursKnown, localClock, shiftsOf, type DayKey, type WeeklyHours } from './hours';

/** Saturday-first Iranian week. */
export const WEEK: DayKey[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

type WithHours = { weekly_hours: WeeklyHours };
type DayState = 'unknown' | 'closed' | Array<[number, number]>;

function dayState(w: WeeklyHours, day: DayKey): DayState {
  if (!w || !hoursKnown(w)) return 'unknown';
  if (w[day]?.status === 'closed') return 'closed';
  return shiftsOf(w[day]) ?? 'unknown';
}

/** Shops open at hh:30 for each hour of the day (24 counts); shops without hours are not counted. */
export function hoursHistogram(shops: WithHours[], day: DayKey): number[] {
  const counts = Array<number>(24).fill(0);
  for (const s of shops) {
    const st = dayState(s.weekly_hours, day);
    if (st === 'unknown' || st === 'closed') continue;
    for (let h = 0; h < 24; h++) if (st.some(([a, b]) => h * 60 + 30 >= a && h * 60 + 30 < b)) counts[h]++;
  }
  return counts;
}

export type VisitWindow = { start: number; end: number; coverage: number };
export type DayStats = {
  day: DayKey;
  /** shops whose hours for this day are known (open or closed) */
  known: number;
  unknown: number;
  closed: number;
  /** share of known shops open at hh:30, 0..1 */
  perHour: number[];
  window: VisitWindow | null;
  /** share of known shops closed all day */
  closedShare: number;
};

/**
 * Best hours to go: the longest run of hours where at least 90 % of the day's peak share of shops is
 * open; `coverage` is the lowest share inside it (all of them are open at least that much).
 */
export function bestWindow(perHour: number[]): VisitWindow | null {
  const peak = Math.max(...perHour);
  if (peak <= 0) return null;
  const min = peak * 0.9;
  let best: VisitWindow | null = null;
  for (let h = 0; h < 24; ) {
    if (perHour[h] < min) {
      h++;
      continue;
    }
    let e = h;
    while (e < 24 && perHour[e] >= min) e++;
    const coverage = Math.min(...perHour.slice(h, e));
    if (!best || e - h > best.end - best.start) best = { start: h, end: e, coverage };
    h = e;
  }
  return best;
}

export function dayStats(shops: WithHours[], day: DayKey): DayStats {
  let unknown = 0;
  let closed = 0;
  for (const s of shops) {
    const st = dayState(s.weekly_hours, day);
    if (st === 'unknown') unknown++;
    else if (st === 'closed') closed++;
  }
  const known = shops.length - unknown;
  const counts = hoursHistogram(shops, day);
  const perHour = counts.map((c) => (known ? c / known : 0));
  return { day, known, unknown, closed, perHour, window: bestWindow(perHour), closedShare: known ? closed / known : 0 };
}

export function fridayClosedShare(shops: WithHours[]): number {
  return dayStats(shops, 'fri').closedShare;
}

export function dayKeyOf(now: Date): DayKey {
  return JS_DAY_KEYS[localClock(now).dayIdx];
}

const pct = (x: number) => `${toFaDigits(Math.round(x * 100))}٪`;

/** «شنبه بین ۱۱ تا ۱۸، ۹۲٪ فروشنده‌ها بازند؛ جمعه ۸۸٪ تعطیل‌اند؛ ساعت ۳ فروشگاه ثبت نشده» */
export function visitSentence(day: DayStats, friday: DayStats | null, noun = 'فروشنده‌ها'): string {
  const parts: string[] = [];
  if (!day.known) parts.push(`ساعت کاری ${FA_DAY[day.day]} برای این ${noun} ثبت نشده`);
  else if (!day.window) parts.push(`${FA_DAY[day.day]} همه تعطیل‌اند`);
  else parts.push(`${FA_DAY[day.day]} بین ${toFaDigits(day.window.start)} تا ${toFaDigits(day.window.end)}، ${pct(day.window.coverage)} ${noun} بازند`);
  if (friday && friday.known && day.day !== 'fri') parts.push(`جمعه ${pct(friday.closedShare)} تعطیل‌اند`);
  if (day.unknown) parts.push(`ساعت ${toFaDigits(day.unknown)} فروشگاه ثبت نشده`);
  return parts.join('؛ ');
}

/** When to start a trip: today's window start if it is still ahead, else the next day's (null = now is fine). */
export function startHint(stats: DayStats[], now: Date): { day_offset: number; at: string } | null {
  const today = dayKeyOf(now);
  const idx = WEEK.indexOf(today);
  const { minutes } = localClock(now);
  const w = stats.find((d) => d.day === today)?.window;
  if (w && minutes >= w.start * 60 && minutes < w.end * 60) return null;
  if (w && minutes < w.start * 60) return { day_offset: 0, at: `${String(w.start).padStart(2, '0')}:00` };
  for (let k = 1; k <= 7; k++) {
    const next = stats.find((d) => d.day === WEEK[(idx + k) % 7])?.window;
    if (next) return { day_offset: k, at: `${String(next.start).padStart(2, '0')}:00` };
  }
  return null;
}
