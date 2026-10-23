import { toEnDigits } from '../fa/digits';
import { normalizeForSearch } from '../fa/normalize';
import { atLocalTime, JS_DAY_KEYS, localClock, type DayKey } from '../data/hours';
import type { Transport, Urgency } from './decide';
import { WALK_M_PER_MIN } from './decide';

/**
 * Situational requests (pure): «ساعت ۱۱:۳۰ شب، شارژر گوشی می‌خوام»، «جمعه ظهر هدفون می‌خوام»،
 * «کابل تایپ‌سی، ۱۵ دقیقه دیگه قطار دارم» → the moment, urgency, a time budget and the product words.
 */

export type Situation = {
  situational: boolean;
  /** an explicit moment, time budget or «همین الان / کجا بازه» — wins over a mission without budget or checks */
  strong: boolean;
  urgency: Urgency;
  /** the moment the user means («ساعت ۱۱:۳۰ شب»، «جمعه ظهر»); null = now */
  at: Date | null;
  /** «۱۵ دقیقه دیگه قطار دارم» → 15 (walking only, radius from the budget) */
  time_budget_min: number | null;
  transport: Transport | null;
  radius_m: number | null;
  /** the product words left after removing time, cues and filler */
  need_text: string;
};

const DAYS: Array<[RegExp, DayKey]> = [
  [/یک ?شنبه|یکشنبه/u, 'sun'],
  [/دو ?شنبه/u, 'mon'],
  [/سه ?شنبه/u, 'tue'],
  [/چهار ?شنبه/u, 'wed'],
  [/پنج ?شنبه/u, 'thu'],
  [/جمعه/u, 'fri'],
  [/(?:^| )شنبه(?= |$)/u, 'sat'],
];
const PART: Record<string, number> = { صبح: 10 * 60, ظهر: 13 * 60, عصر: 17 * 60, بعدازظهر: 16 * 60, 'بعد از ظهر': 16 * 60, شب: 21 * 60 };

const TIME_RE = /ساعت ?(\d{1,2})(?:[:٫.](\d{2}))?(?: ?(صبح|ظهر|عصر|بعدازظهر|بعد از ظهر|شب))?/u;
const PART_RE = /(?:^| )(صبح|ظهر|عصر|بعدازظهر|بعد از ظهر)(?= |$)/u;
const NOW_RE = /همین الان|(?:^| )الان(?= |$)|فوری|فورا|این ساعت|امشب|نصف ?شب|نیمه ?شب|دیروقت|عجله|دقیقه دیگه|دقیقه دیگر|دقیقه وقت|قطار|اتوبوس|پرواز|کجا بازه|کجا باز است|کی بازه|بازه\b|بازن\b/u;
const TODAY_RE = /امروز|تا عصر|تا شب/u;
const STRONG_NOW_RE = /همین الان|فوری|فورا|این ساعت|امشب|نصف ?شب|نیمه ?شب|کجا بازه|کجا باز است|کی بازه/u;
const MISSION_WORDS_RE = /بپرس|چک کن|پیگیری|مطمئن شو|میلیون|تومن|تومان|ارزون|ارزان/u;
const BUDGET_RE = /(\d{1,3}) ?دقیقه ?(?:دیگه|دیگر|وقت)/u;
const FILLER =
  /(?:^| )(?:من|یه|یک|می ?خوام|میخوام|میخواستم|لازم دارم|نیاز دارم|احتیاج دارم|پیدا کن|کجا بخرم|کجا بازه|کجا باز است|کی بازه|بازه|بازن|دارم|است|هست|شده|و|که|رو|را|برای|الان|همین|فوری|فورا|امشب|امروز|فردا|شب|ظهر|صبح|عصر|ساعت|دقیقه|دیگه|دیگر|قطار|اتوبوس|پرواز|عجله|این|وقت|تا|نصف|نیمه|دیروقت|فقط|اونایی|اونا|اونها|اینا|کدوم|کدوما|کدام|هستن|هستند|باشه|باشن|کجاست|کجا|نزدیک|نزدیکم|اطراف|اطرافم|بگو|ببین|چی|چیزی|جایی|بخرم|بگیرم|یکی)(?= |$)/gu;

/** Which day/time the words mean, relative to `now` (Tehran time); `t` = the «ساعت …» match on the raw text. */
function momentOf(norm: string, t: RegExpMatchArray | null, now: Date): Date | null {
  const { dayIdx, minutes } = localClock(now);
  let dayOffset: number | null = null;
  if (/(?:^| )فردا(?= |$)/u.test(norm)) dayOffset = 1;
  for (const [re, key] of DAYS) {
    if (!re.test(norm)) continue;
    const target = JS_DAY_KEYS.indexOf(key);
    dayOffset = (target - dayIdx + 7) % 7;
    break;
  }
  let at: number | null = null;
  if (t) {
    let h = Number(t[1]);
    const m = Number(t[2] ?? 0);
    const part = t[3];
    if (part === 'شب') h = h === 12 ? 0 : h <= 4 ? h : h < 12 ? h + 12 : h;
    else if ((part === 'عصر' || part === 'بعدازظهر' || part === 'بعد از ظهر') && h < 12) h += 12;
    else if (part === 'ظهر' && h < 5) h += 12;
    if (h <= 24 && m < 60) at = (h % 24) * 60 + m;
  } else {
    const p = norm.match(PART_RE);
    if (p && dayOffset !== null) at = PART[p[1]];
  }
  if (at === null && dayOffset === null) return null;
  const mins = at ?? minutes;
  const hh = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  return atLocalTime(now, hh, dayOffset ?? 0);
}

export function parseSituation(text: string, now: Date): Situation {
  // «ساعت ۱۱:۳۰ شب» is read before normalization (which drops the colon), then removed from the words
  const raw = toEnDigits(text).replace(/\u200c/g, ' ').replace(/\s+/g, ' ');
  const t = raw.match(TIME_RE);
  const norm = normalizeForSearch(t ? raw.replace(t[0], ' ') : raw).replace(/[؟?!.،,]/g, ' ');
  const at = momentOf(norm, t, now);
  const budget = norm.match(BUDGET_RE);
  const timeBudget = budget ? Number(budget[1]) : null;
  const nowCue = NOW_RE.test(norm);
  const urgency: Urgency = nowCue || timeBudget || (at && Math.abs(at.getTime() - now.getTime()) < 90 * 60_000) ? 'now' : TODAY_RE.test(norm) ? 'today' : at ? 'now' : 'flexible';
  // half the budget there, half back, walking
  const radius = timeBudget ? Math.min(1500, Math.max(300, Math.round(((timeBudget / 2) * WALK_M_PER_MIN) / 100) * 100)) : null;
  const need = norm
    .replace(BUDGET_RE, ' ')
    .replace(/(?:یک ?شنبه|دو ?شنبه|سه ?شنبه|چهار ?شنبه|پنج ?شنبه|جمعه|(?:^| )شنبه(?= |$))/gu, ' ')
    .replace(FILLER, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    // «فقط اونایی که الان بازن» is a filter on the list on screen, not a new question
    situational: Boolean(nowCue || timeBudget || at) && !/(?:^| )(?:فقط|فیلتر)(?= |$)/u.test(norm),
    strong: Boolean(t || at || timeBudget || STRONG_NOW_RE.test(norm)) && !MISSION_WORDS_RE.test(norm),
    urgency,
    at,
    time_budget_min: timeBudget,
    transport: timeBudget ? 'walk' : null,
    radius_m: radius,
    need_text: need,
  };
}
