import { toEnDigits } from './digits';

const ZWNJ = '‌';

/**
 * Canonical Persian text for matching (pure; used for *_norm columns and queries):
 * Arabic ي/ك → Persian ی/ک, no tatweel/diacritics, ASCII digits, lowercase Latin,
 * single ZWNJ, punctuation stripped except `+`, `/` and `.` inside numbers.
 */
export function normalizeFa(input: string | null | undefined): string {
  if (!input) return '';
  let s = toEnDigits(input.normalize('NFC'));
  s = s
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ؤ]/g, 'و')
    .replace(/[أإٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '') // tatweel
    .replace(/[ً-ٰٟۖ-ۭ]/g, '') // diacritics
    .replace(/[​‍‎‏﻿]/g, '') // zero-width except ZWNJ
    .toLowerCase();
  // ZWNJ: collapse repeats, drop next to whitespace / at edges
  s = s.replace(/‌+/g, ZWNJ).replace(/\s*‌\s*/g, (m) => (/\s/.test(m) ? ' ' : ZWNJ));
  // keep '.' only between digits (2.5), keep '+' and '/', other punctuation → space
  s = s.replace(/(\d),(?=\d{3}\b)/g, '$1'); // 1,200 → 1200
  s = s.replace(/\.(?!\d)|(?<!\d)\./g, ' ');
  s = s.replace(/[^\p{L}\p{N}\s+/.‌]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^‌|‌$/g, '');
  return s;
}

/** ZWNJ → space: the form stored in title_norm and used for trigram matching. */
export function normalizeForSearch(input: string | null | undefined): string {
  return normalizeFa(input).replace(/‌/g, ' ').replace(/\s+/g, ' ').trim();
}

/** All ZWNJ variants of a normalized string: [with ZWNJ, ZWNJ removed, ZWNJ as space] (deduped). */
export function zwnjVariants(input: string | null | undefined): string[] {
  const n = normalizeFa(input);
  return Array.from(new Set([n, n.replace(/‌/g, ''), n.replace(/‌/g, ' ')]));
}
