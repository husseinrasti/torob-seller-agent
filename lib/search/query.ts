import { normalizeForSearch } from '../fa/normalize';

export type Budget = { min?: number; max?: number };

export type ParsedQuery = {
  /** normalized input */
  norm: string;
  /** product keywords after removing budget, location and filler words */
  keywords: string;
  tokens: string[];
  budget?: Budget;
  /** user mentioned «نزدیک من» / «اطراف» etc. */
  wantsNearby: boolean;
};

const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = '(میلیارد|میلیون|ملیون|هزار|تومن|تومان)';
const TOMAN = '(?:\\s*(?:تومن|تومان|تومنی|تومانی))?';
const UNIT_MULT: Record<string, number> = { میلیارد: 1e9, میلیون: 1e6, ملیون: 1e6, هزار: 1e3, تومن: 1, تومان: 1 };

function toToman(n: number, unit: string | undefined): number {
  const u = unit?.replace(/ی$/, '');
  if (!u) return n < 1000 ? n * 1e6 : n;
  if ((u === 'تومن' || u === 'تومان') && n < 1000) return n * 1e6; // colloquial «۶۰ تومن» = 60M
  return n * (UNIT_MULT[u] ?? 1);
}

const RANGE_RE = new RegExp(`(?:بین|از)\\s*${NUM}\\s*${UNIT}?\\s*(?:و|تا)\\s*${NUM}\\s*${UNIT}?${TOMAN}`, 'u');
const MAX_RE = new RegExp(
  `(?:تا|زیر|کمتر از|حداکثر|نهایتا|نهایت|ماکزیمم|سقف)\\s*${NUM}\\s*(میلیارد|میلیون|ملیون|هزار|تومن|تومان)?(?:ی)?${TOMAN}`,
  'u',
);
const ABOUT_RE = new RegExp(
  `(?:حدود|حدودا|در حد|تقریبا|حول و حوش|دور و بر|حوالی|بودجه(?:\\s*ام|م)?|با بودجه|با)\\s*(?:قیمت(?:ش|ی)?\\s*)?${NUM}\\s*${UNIT}(?:ی)?${TOMAN}`,
  'u',
);
const MIN_RE = new RegExp(
  `(?:(?:بالای|بیشتر از|حداقل|مینیمم)\\s*${NUM}\\s*(میلیارد|میلیون|ملیون|هزار)(?:ی)?${TOMAN}|از\\s*${NUM}\\s*(میلیارد|میلیون|ملیون|هزار)${TOMAN}\\s*(?:به بالا|بالاتر|به بعد))`,
  'u',
);
const PLAIN_RE = new RegExp(`${NUM}\\s*(میلیارد|میلیون|ملیون)(?:ی)?${TOMAN}|${NUM}\\s*هزار\\s*(?:تومن|تومان)|${NUM}\\s*(?:تومن|تومان)`, 'u');

export type BudgetMode = 'range' | 'max' | 'min' | 'about' | 'plain';

/**
 * Extract a budget in toman; returns the budget, the text without the matched span, how it was said
 * (`mode`) and, for «حدود ۵۰ میلیون» / «۵۰ میلیون», the stated `amount`.
 */
export function parseBudget(norm: string): { budget?: Budget; rest: string; mode?: BudgetMode; amount?: number } {
  let m = norm.match(RANGE_RE);
  if (m) {
    const unit2 = m[4] ?? m[2];
    const a = toToman(Number(m[1]), m[2] ?? unit2);
    const b = toToman(Number(m[3]), unit2);
    return { budget: { min: Math.min(a, b), max: Math.max(a, b) }, rest: norm.replace(m[0], ' '), mode: 'range' };
  }
  m = norm.match(MAX_RE);
  // «تا ۲ کیلومتر» is a radius, not a budget: require a unit or a number big enough to be a price
  if (m && (m[2] || Number(m[1]) >= 10) && !/^\s*(کیلومتر|متر|کیلو)/u.test(norm.slice((m.index ?? 0) + m[0].length))) {
    return { budget: { max: toToman(Number(m[1]), m[2]) }, rest: norm.replace(m[0], ' '), mode: 'max' };
  }
  m = norm.match(MIN_RE);
  if (m) {
    const v = m[1] ? toToman(Number(m[1]), m[2]) : toToman(Number(m[3]), m[4]);
    return { budget: { min: v }, rest: norm.replace(m[0], ' '), mode: 'min' };
  }
  m = norm.match(ABOUT_RE);
  if (m) {
    const v = toToman(Number(m[1]), m[2]);
    return { budget: { min: Math.round(v * 0.8), max: Math.round(v * 1.1) }, rest: norm.replace(m[0], ' '), mode: 'about', amount: v };
  }
  m = norm.match(PLAIN_RE);
  if (m) {
    const v = m[1] ? toToman(Number(m[1]), m[2]) : m[3] ? Number(m[3]) * 1e3 : toToman(Number(m[4]), 'تومن');
    return { budget: { min: Math.round(v * 0.8), max: Math.round(v * 1.1) }, rest: norm.replace(m[0], ' '), mode: 'plain', amount: v };
  }
  return { rest: norm };
}

// Conversational filler and condition words that should not drive product matching.
const FILLER = new Set(
  (
    'نزدیک من نزدیکم اطراف اطرافم دور و بر میخوام میخواهم میخام خوام خواهم لطفا لطفاً یه یک برای ارزون ارزان ارزونترین ارزانترین ' +
    'خوب خوبی بهترین قیمت چند کدوم کدام نمیدونم نمیدانم دونم دانم دنبال هستم میگردم گردم بخرم خرید بگیرم باشه باشد که رو را ' +
    'هم مناسب تومن تومان الان باز قسطی اقساطی اعتباری نقد نقدی فوری ارسال سریع مدل پیشنهاد بده بدید کن کنید چی چه ' +
    'خیلی یک عدد دارین دارید داره دارد هست کجا میشه می شه'
  ).split(/\s+/),
);
const FILLER_PHRASES = ['می خوام', 'می خواهم', 'نمی دونم', 'نمی دانم', 'دور و بر', 'ترب پی', 'می گردم', 'می شه'];

/** Canonical forms so «ال ای دی» matches «LED», «مداربسته» matches «مدار بسته», etc. Applied to both sides. */
const SYNONYMS: Array<[RegExp, string]> = [
  [/ال ای دی/gu, 'led'],
  [/مدار بسته/gu, 'مداربسته'],
  [/کیو سی وای/gu, 'qcy'],
  [/بی سیم/gu, 'بیسیم'],
  [/با سیم/gu, 'سیمی'],
  [/ایر ?پادز/gu, 'airpods'],
  [/ایر ?پاد/gu, 'airpods'],
  [/ایرپاد/gu, 'airpods'],
  [/پاور بانک/gu, 'پاوربانک'],
  [/هند ?زفری/gu, 'هندزفری'],
  [/اسپرسوساز/gu, 'اسپرسو ساز'],
  [/قهوهساز/gu, 'قهوه ساز'],
  [/samsung/gu, 'سامسونگ'],
  [/xiaomi/gu, 'شیائومی'],
  [/apple/gu, 'اپل'],
  [/iphone/gu, 'آیفون'],
  [/anker/gu, 'انکر'],
  [/huawei/gu, 'هواوی'],
  [/nokia/gu, 'نوکیا'],
  [/casio/gu, 'کاسیو'],
  [/sony/gu, 'سونی'],
  [/honor/gu, 'آنر'],
  [/lenovo/gu, 'لنوو'],
  [/philips/gu, 'فیلیپس'],
];

export function canon(text: string): string {
  let s = ` ${text} `;
  for (const [re, to] of SYNONYMS) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

export function tokenize(text: string): string[] {
  return Array.from(new Set(canon(text).split(' ').filter(Boolean)));
}

/** Deterministic query understanding: normalization, budget, filler removal. Pure. */
export function parseQuery(input: string): ParsedQuery {
  const norm = normalizeForSearch(input);
  const { budget, rest } = parseBudget(norm);
  const wantsNearby = /نزدیک|اطراف|دور و بر|همین حوالی/u.test(norm);
  let text = ` ${rest} `;
  for (const p of FILLER_PHRASES) text = text.replaceAll(` ${p} `, ' ');
  const words = text.split(/\s+/).filter((w) => w && !FILLER.has(w));
  const keywords = words.join(' ').trim();
  return { norm, keywords, tokens: tokenize(keywords), budget, wantsNearby };
}
