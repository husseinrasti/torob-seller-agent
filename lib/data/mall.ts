import { toEnDigits, toFaDigits } from '../fa/digits';

export type MallInfo = {
  mall_key: string | null;
  mall_name: string | null;
  floor_label: string | null;
  floor_num: number | null;
  unit_label: string | null;
  /** «واحد» or «پلاک», whichever the address used for the unit */
  unit_kind: 'واحد' | 'پلاک' | null;
};

const EMPTY: MallInfo = {
  mall_key: null,
  mall_name: null,
  floor_label: null,
  floor_num: null,
  unit_label: null,
  unit_kind: null,
};

/** Light normalization for parsing: Persian letters, ASCII digits, single spaces. */
function prep(s: string): string {
  return toEnDigits(s)
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ـ/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[​‍﻿]/g, '')
    .replace(/\s+/g, ' ');
}

// Mall tokens. پاساژ/مجتمع/مرکز خرید may be glued to the name («پاساژعلاءالدین»);
// generic words (بازار، برج، ساختمان) need a space to avoid «بازارچه», «ساختمانی».
const MALL_RE =
  /(?<!\p{L})(?:(پاساژ|مجتمع تجاری|مجتمع|مرکز خرید)\s*|(بازار|برج|ساختمان|مرکز(?=\s+تجارت))\s+)([^،,:;()\-–—|]+(?:\(\s*\d+\s*\))?)/gu;

// A token preceded by one of these describes a neighbour, not the shop's own mall.
const NEIGHBOUR_RE =
  /(?<!\p{L})(جنب|روبرو|روبروی|روبه‌روی|رو به روی|روبه روی|کنار|مقابل|پشت|نبش|بعد|بعد از|قبل از|نرسیده به|ابتدای|انتهای|نزدیک|بین)\s*$/u;

// The name ends where one of these words starts (addresses without a comma after the name).
const NAME_STOP_RE =
  /(?:^|\s)(?:طبقه|طبقات|واحد|پلاک|بلوک|ورودی|غرفه|سالن|راهرو|کد پستی|تلفن|جنب|روبروی|روبه‌روی|نبش|زیرزمین|همکف|خیابان|کوچه|بن بست|تقاطع|بر)(?:\s|$)[\s\S]*$/u;

// Spelling unification for well-known malls (علاالدین / علاءالدین / علائدین / علالدین …).
const ALAEDDIN_RE = /عل[اآ]?[ءئأ]?\s?[اآ]?ل?دین/gu;
const NAME_ALIASES: Array<[RegExp, string]> = [
  [ALAEDDIN_RE, 'علاءالدین'],
  [/چهارسو|چارسو/gu, 'چارسو'],
];

// Whole-name aliases after unification.
const KEY_ALIASES: Record<string, string> = {
  'تجارت جهانی فردوسی': 'تجارت جهانی',
  '110 فردوسی': '110',
  'علاءالدین تهران': 'علاءالدین',
  'موبایل علاءالدین 3': 'علاءالدین 3',
  'موبایل علاءالدین': 'علاءالدین',
};

const NUMBER_WORDS: Record<string, string> = { یک: '1', دو: '2', سه: '3', چهار: '4' };

/** Canonical mall key (Persian digits) or null when the name is unusable. */
export function mallKey(rawName: string): string | null {
  let name = prep(rawName)
    .replace(/[()]/g, ' ')
    .replace(/‌/g, ' ')
    .replace(/(\p{L})(\d)/gu, '$1 $2')
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(NAME_STOP_RE, '')
    .trim();
  for (const [re, to] of NAME_ALIASES) name = name.replace(re, to);
  name = name.replace(/ (یک|دو|سه|چهار)$/u, (_, w: string) => ` ${NUMBER_WORDS[w]}`);
  name = name.replace(/ تهران$/u, '').trim();
  name = KEY_ALIASES[name] ?? name;
  name = name.replace(/ 1$/u, ''); // «علاءالدین ۱» is the main building
  if (!name || name.length < 2 || name.length > 30) return null;
  if (/^\d+$/.test(name) && name.length > 3) return null;
  return toFaDigits(name);
}

const FLOOR_WORDS: Array<[RegExp, number]> = [
  [/^(زیر ?همکف|زیر ?زمین|زیرین)/u, -1],
  [/^بالای همکف/u, 1],
  [/^همکف/u, 0],
  [/^(اول|یکم|یک)(?!\p{L})/u, 1],
  [/^(دوم|دو)(?!\p{L})/u, 2],
  [/^(سوم|سه)(?!\p{L})/u, 3],
  [/^(چهارم|چهار)(?!\p{L})/u, 4],
  [/^(پنجم|پنج)(?!\p{L})/u, 5],
  [/^(ششم|شش)(?!\p{L})/u, 6],
  [/^(هفتم|هفت)(?!\p{L})/u, 7],
  [/^(هشتم|هشت)(?!\p{L})/u, 8],
  [/^(نهم|نه)(?!\p{L})/u, 9],
  [/^(دهم|ده)(?!\p{L})/u, 10],
];

/** «منفی یک» → -1, «۲» → 2, «همکف» → 0, «اول» → 1; null when not understood. */
export function parseFloor(label: string): number | null {
  let s = prep(label).replace(/‌/g, ' ').trim();
  let sign = 1;
  const neg = s.match(/^منفی\s*(.*)$/u);
  if (neg) {
    sign = -1;
    s = neg[1].trim();
  }
  const num = s.match(/^([-−]?)\s*(\d{1,2})\s*([-−]?)/u);
  if (num) {
    const n = Number(num[2]);
    if (n === 0) return 0;
    return (num[1] || num[3] ? -1 : sign) * n;
  }
  for (const [re, n] of FLOOR_WORDS) if (re.test(s)) return n === 0 ? 0 : sign * n;
  return null;
}

/** Parse the shop address into mall / floor / unit. Pure. */
export function parseMall(address: string | null | undefined): MallInfo {
  if (!address) return { ...EMPTY };
  const a = prep(address);
  const out: MallInfo = { ...EMPTY };

  // Mall: the last token that is not a neighbour reference («جنب پاساژ X»).
  for (const m of a.matchAll(MALL_RE)) {
    if (NEIGHBOUR_RE.test(a.slice(0, m.index ?? 0))) continue;
    const token = (m[1] ?? m[2]).trim();
    const key = mallKey(m[3]);
    if (!key) continue;
    out.mall_key = key;
    out.mall_name = `${token} ${key}`;
  }
  // Bare well-known names without a token («جمهوری، علاالدین، طبقه اول»).
  if (!out.mall_key) {
    let offset = 0;
    for (const seg of a.split(/[،,]/)) {
      const before = a.slice(0, offset);
      offset += seg.length + 1;
      if (NEIGHBOUR_RE.test(before) || NEIGHBOUR_RE.test(seg.replace(ALAEDDIN_RE, '').trim())) continue;
      const bare = seg.trim().match(new RegExp(`(?:^|\\s)(${ALAEDDIN_RE.source}\\s*\\d?|چهارسو|چارسو)$`, 'u'));
      if (bare) {
        out.mall_key = mallKey(bare[1]);
        out.mall_name = out.mall_key ? `پاساژ ${out.mall_key}` : null;
      }
    }
  }

  // Floor
  const f = a.match(/طبقه(?:‌?ی)?\s*[:\-]?\s*([^،,]+)/u);
  if (f) {
    const label = f[1].replace(/\s*(واحد|پلاک|غرفه)[\s\S]*$/u, '').trim();
    const short = label.split(/\s+/).slice(0, 2).join(' ');
    out.floor_num = parseFloor(short);
    out.floor_label = short ? toFaDigits(short) : null;
  }

  // Unit: prefer «واحد», else the last «پلاک» (an earlier one is often the building number)
  const unitRe = /(واحد|پلاک)\s*[:\-]?\s*(\d+[A-Za-z]?(?:\s*[/\-]\s*\d+)?|[A-Za-z]\s*-?\s*\d+)/gu;
  const units = Array.from(a.matchAll(unitRe));
  const pick = units.find((u) => u[1] === 'واحد') ?? units[units.length - 1];
  if (pick) {
    out.unit_kind = pick[1] as 'واحد' | 'پلاک';
    out.unit_label = pick[2].replace(/\s+/g, '').toUpperCase();
  }
  return out;
}

/** Human floor text for chips: 0 → «همکف», -1 → «طبقه منفی ۱», 6 → «طبقه ۶». */
export function floorText(floorNum: number | null, floorLabel?: string | null): string | null {
  if (floorNum === null || floorNum === undefined) return floorLabel ? `طبقه ${floorLabel}` : null;
  if (floorNum === 0) return 'همکف';
  if (floorNum < 0) return `طبقه منفی ${toFaDigits(Math.abs(floorNum))}`;
  return `طبقه ${toFaDigits(floorNum)}`;
}
