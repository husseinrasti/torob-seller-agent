import { toFaDigits } from '../fa/digits';

export type DayKey = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
type Shift = { start_time: string; end_time: string };
type DayHours = { status?: string; shifts?: Shift[] };
export type WeeklyHours = Partial<Record<DayKey, DayHours>> | null | undefined;

export type OpenState = {
  known: boolean;
  open: boolean | null;
  closesAt?: string;
  opensAt?: string;
  nextOpen?: { day: string; time: string };
  closingSoon?: boolean;
  label: string;
};

// Index = JS weekday (0 = Sunday)
const JS_DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const FA_DAY: Record<DayKey, string> = {
  sat: 'شنبه',
  sun: 'یکشنبه',
  mon: 'دوشنبه',
  tue: 'سه‌شنبه',
  wed: 'چهارشنبه',
  thu: 'پنجشنبه',
  fri: 'جمعه',
};

const TZ = 'Asia/Tehran';
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    fmtCache.set(tz, f);
  }
  return f;
}

const SHORT_TO_IDX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday index (0 = Sunday) and minutes since local midnight in the given time zone. */
export function localClock(now: Date, tz = TZ): { dayIdx: number; minutes: number } {
  const parts = formatter(tz).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return { dayIdx: SHORT_TO_IDX[get('weekday')], minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function toMin(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Declared shifts of one day as [start, end) minute ranges; end < start means "until midnight".
 * Zero-length shifts («00:00–00:00») are placeholders in the data and are ignored.
 */
function shiftsOf(day: DayHours | undefined): Array<[number, number]> | null {
  if (!day || day.status !== 'declared' || !day.shifts?.length) return null;
  const shifts = day.shifts
    .map((s): [number, number] => {
      const start = toMin(s.start_time);
      let end = toMin(s.end_time);
      if (end < start) end = 1440;
      return [start, end];
    })
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  return shifts.length ? shifts : null;
}

export function hoursKnown(weekly: WeeklyHours): boolean {
  if (!weekly) return false;
  return Object.values(weekly).some((d) => d?.status === 'declared' || d?.status === 'closed');
}

function nextOpening(weekly: Partial<Record<DayKey, DayHours>>, dayIdx: number): { day: string; time: string; inDays: number } | undefined {
  for (let i = 1; i <= 7; i++) {
    const key = JS_DAY_KEYS[(dayIdx + i) % 7];
    const shifts = shiftsOf(weekly[key]);
    if (shifts) return { day: i === 1 ? 'فردا' : FA_DAY[key], time: minToHHMM(shifts[0][0]), inDays: i };
  }
  return undefined;
}

const fa = (hhmm: string) => toFaDigits(hhmm);

/** Open/closed state at `now` in Tehran time with a Persian label. Unknown stays unknown. */
export function openState(weekly: WeeklyHours, now: Date, tz = TZ): OpenState {
  if (!weekly || Object.keys(weekly).length === 0 || !hoursKnown(weekly)) {
    return { known: false, open: null, label: 'ساعت کاری ثبت نشده' };
  }
  const { dayIdx, minutes } = localClock(now, tz);
  const todayKey = JS_DAY_KEYS[dayIdx];
  const today = weekly[todayKey];
  const next = nextOpening(weekly, dayIdx);
  const nextLabel = next ? `${next.day} ${fa(next.time)} باز می‌شود` : '';

  if (today?.status === 'closed') {
    return {
      known: true,
      open: false,
      nextOpen: next && { day: next.day, time: next.time },
      label: `${FA_DAY[todayKey]} تعطیل${next ? ` · ${nextLabel}` : ''}`,
    };
  }
  const shifts = shiftsOf(today);
  if (!shifts) return { known: false, open: null, label: 'ساعت کاری امروز ثبت نشده' };

  const current = shifts.find(([s, e]) => minutes >= s && minutes < e);
  if (current) {
    const closesAt = minToHHMM(current[1]);
    const closingSoon = current[1] - minutes <= 45;
    return {
      known: true,
      open: true,
      closesAt,
      closingSoon,
      label: `باز است · تا ${fa(closesAt)}${closingSoon ? ' (به‌زودی می‌بندد)' : ''}`,
    };
  }
  const later = shifts.find(([s]) => s > minutes);
  if (later) {
    const opensAt = minToHHMM(later[0]);
    return { known: true, open: false, opensAt, label: `بسته است · امروز ${fa(opensAt)} باز می‌شود` };
  }
  return {
    known: true,
    open: false,
    nextOpen: next && { day: next.day, time: next.time },
    label: next ? `بسته است · ${nextLabel}` : 'بسته است',
  };
}

/** Today's declared hours as text, e.g. «امروز ۱۰:۰۰ تا ۱۹:۰۰». */
export function todayHoursText(weekly: WeeklyHours, now: Date, tz = TZ): string {
  if (!weekly || !hoursKnown(weekly)) return 'ساعت کاری ثبت نشده';
  const key = JS_DAY_KEYS[localClock(now, tz).dayIdx];
  if (weekly[key]?.status === 'closed') return 'امروز تعطیل';
  const shifts = shiftsOf(weekly[key]);
  if (!shifts) return 'ساعت کاری امروز ثبت نشده';
  return 'امروز ' + shifts.map(([s, e]) => `${fa(minToHHMM(s))} تا ${fa(minToHHMM(e))}`).join(' و ');
}

/**
 * `?demo_time=2026-10-25T16:00` → Date. A value without offset is Tehran local time (UTC+03:30,
 * no DST since 2022). Invalid input → null.
 */
export function parseDemoTime(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = input.trim();
  const local = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const d = local ? new Date(`${local[1]}T${local[2]}:${local[3]}:${local[4] ?? '00'}+03:30`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The app clock: demo time when given, else real now. */
export function appNow(demoTime?: string | null): Date {
  return parseDemoTime(demoTime) ?? new Date();
}
