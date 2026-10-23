import { normalizeForSearch } from '../fa/normalize';
import { toEnDigits } from '../fa/digits';
import type { Spec } from './specs';

/**
 * Grounded spec Q&A (pure): a question is mapped to spec rows of `products.specs` by topic synonyms
 * (NFC/ان‌اف‌سی, وزن/گرم, باتری/میلی‌آمپر, حافظه/رم/گیگ, صفحه/اینچ, شارژ سریع/وات …) or by keyword
 * overlap; the answer is templated from those rows. Nothing outside the rows is ever stated.
 */

export type SpecProduct = { product_id: string; title: string; specs: Spec[] | null };
export type Evidence = { product_id: string; key: string; value: string };
export type SpecAnswer = { answer: string; evidence: Evidence[]; matched: 'topic' | 'keywords' | 'none'; topic: string | null };

type Topic = { id: string; label: string; q: RegExp; key: RegExp; yesNo?: boolean };

// question patterns run on normalizeForSearch(question) (ASCII digits, ZWNJ → space, lowercase Latin)
const TOPICS: Topic[] = [
  { id: 'nfc', label: 'NFC', q: /nfc|ان ?اف ?سی|پرداخت (?:با گوشی|موبایلی|بدون تماس)/u, key: /^nfc$/iu, yesNo: true },
  { id: 'weight', label: 'وزن', q: /وزن|چند گرم|سنگین|سبکه|سبک است/u, key: /^وزن$/u },
  { id: 'battery', label: 'باتری', q: /باتری|میلی ?آمپر|mah|شارژ ?دهی|ظرفیت/u, key: /^(ظرفیت باتری|ظرفیت|ظرفیت پاوربانک|شارژدهی)$/u },
  { id: 'charging', label: 'شارژ سریع', q: /شارژ سریع|فست ?شارژ|وات|توان شارژ|شارژرش|چند وات/u, key: /^(پشتیبانی از شارژ سریع|حداکثر توان شارژ پشتیبانی شده|توان خروجی|حداکثر توان خروجی)$/u },
  { id: 'screen', label: 'اندازه صفحه', q: /صفحه|نمایشگر|اینچ|سایز/u, key: /^(ابعاد نمایشگر|اندازه صفحه نمایش|اندازه نمایشگر|سایز صفحه نمایش)$/u },
  { id: 'ram', label: 'رم', q: /(?:^| )رم(?:ش|ه|شون|ش چقدره)?(?: |$)|ram/u, key: /^(رم|رم اجرایی|مقدار ram|حافظه ram|حافظه رم)$/iu },
  { id: 'storage', label: 'حافظه داخلی', q: /حافظه(?! رم)|گیگ|حافظه داخلی/u, key: /^حافظه داخلی$/u },
  { id: 'color', label: 'رنگ', q: /رنگ/u, key: /^رنگ$/u },
  { id: '5g', label: '5G', q: /5 ?g|5 ?جی|نسل ?پنج/u, key: /^پشتیبانی از 5g$/iu, yesNo: true },
  { id: 'water', label: 'مقاومت در برابر آب', q: /ضد ?آب|آب ?بندی|ip ?\d|گرد ?و ?غبار/u, key: /^مقاومت دربرابر گردوغبار و آب$/u },
  { id: 'camera', label: 'دوربین', q: /دوربین|مگاپیکسل|عکاسی/u, key: /^(پیکربندی دوربین پشت|دوربین اصلی - واید\/استاندارد|دوربین اصلی|پیکربندی دوربین سلفی)$/u },
  { id: 'chip', label: 'تراشه', q: /پردازنده|چیپ|تراشه|cpu|چیپست/u, key: /^(مدل تراشه|پردازنده)$/u },
  { id: 'os', label: 'سیستم‌عامل', q: /اندروید|سیستم ?عامل|آپدیت/u, key: /^(سیستم‌عامل در زمان عرضه|نوع سیستم‌عامل)$/u },
  { id: 'jack', label: 'جک ۳.۵', q: /جک|3\.5|هدفون سیمی/u, key: /^جک 3\.5 میلی‌متری$/u, yesNo: true },
  { id: 'sim', label: 'سیم‌کارت', q: /سیم ?کارت|دو سیم/u, key: /^سیم‌کارت$/u },
  { id: 'box', label: 'اقلام همراه', q: /جعبه|اقلام همراه|شارژر داره|همراهش/u, key: /^اقلام همراه$/u },
  { id: 'refresh', label: 'نرخ نوسازی', q: /هرتز|نرخ نوسازی|رفرش/u, key: /^حداکثر نرخ نوسازی/u },
  { id: 'fingerprint', label: 'حسگر اثر انگشت', q: /اثر انگشت/u, key: /^نوع حسگر اثر انگشت$/u },
  { id: 'warranty', label: 'گارانتی', q: /گارانتی/u, key: /گارانتی/u },
];

const STOP = new Set('این اون آن یکی گوشی داره دارد داری هست است چنده چند چقدره چقدر فرقش فرق با و یا رو را که چیه چی کدوم بهتره مشخصات'.split(' '));

export function matchTopic(question: string): Topic | null {
  const q = normalizeForSearch(question);
  return TOPICS.find((t) => t.q.test(q)) ?? null;
}

/** Spec rows whose key matches the topic (≤ 3 per product). */
function topicRows(p: SpecProduct, t: Topic): Spec[] {
  return (p.specs ?? []).filter((s) => s?.key && s.value && t.key.test(s.key.trim())).slice(0, 3);
}

/** Rows sharing words with the question (key + value), best first, ≤ `limit` over all products. */
export function keywordRows(question: string, products: SpecProduct[], limit = 30): Evidence[] {
  const words = normalizeForSearch(question)
    .split(' ')
    .filter((w) => w.length >= 2 && !STOP.has(w));
  if (!words.length) return [];
  const scored: Array<[number, Evidence]> = [];
  for (const p of products) {
    for (const s of p.specs ?? []) {
      if (!s?.key || !s.value) continue;
      const hay = ` ${normalizeForSearch(`${s.key} ${s.value}`)} `;
      const hits = words.filter((w) => hay.includes(` ${w}`) || hay.includes(`${w} `)).length;
      if (hits) scored.push([hits + (words.some((w) => normalizeForSearch(s.key).includes(w)) ? 0.5 : 0), { product_id: p.product_id, key: s.key, value: s.value }]);
    }
  }
  return scored
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([, e]) => e);
}

const shortTitle = (t: string) => t.split('|')[0].replace(/^گوشی موبایل\s+|^گوشی\s+/u, '').trim();

function yesNo(value: string): 'yes' | 'no' | null {
  const v = normalizeForSearch(value);
  if (/^(ندارد|خیر|نه|no)(?: |$)/u.test(v)) return 'no';
  if (/^(دارد|بله|yes)(?: |$)/u.test(v)) return 'yes';
  return null;
}

export const NOT_LISTED = 'در مشخصات ثبت‌شده نیامده';

/** Template answer from the products' spec rows; `matched: 'none'` means the caller may ask the LLM. */
export function answerSpecQuestion(question: string, products: SpecProduct[]): SpecAnswer {
  const topic = matchTopic(question);
  if (topic) {
    const evidence: Evidence[] = [];
    const parts: string[] = [];
    for (const p of products) {
      const rows = topicRows(p, topic);
      const name = products.length > 1 ? `${shortTitle(p.title)}: ` : '';
      if (!rows.length) {
        parts.push(`${name}${topic.label} ${NOT_LISTED}`);
        continue;
      }
      for (const r of rows) evidence.push({ product_id: p.product_id, key: r.key, value: r.value });
      const main = rows[0];
      const yn = topic.yesNo ? yesNo(main.value) : null;
      parts.push(
        yn === 'yes'
          ? `${name}بله، ${topic.label} دارد`
          : yn === 'no'
            ? `${name}نه، ${topic.label} ندارد`
            : `${name}${main.key}: ${main.value}${rows[1] && rows[1].value !== main.value ? ` (${rows[1].key}: ${rows[1].value})` : ''}`,
      );
    }
    // two products with the same value: say it once
    const values = products.map((p) => evidence.find((e) => e.product_id === p.product_id)?.value);
    if (products.length > 1 && values.every((v) => v && v === values[0])) {
      const key = evidence[0].key;
      return { answer: `${key} هر دو ${values[0]} است`, evidence, matched: 'topic', topic: topic.id };
    }
    return { answer: parts.join(' · '), evidence, matched: 'topic', topic: topic.id };
  }
  const rows = keywordRows(question, products);
  if (!rows.length) return { answer: NOT_LISTED, evidence: [], matched: 'none', topic: null };
  return { answer: rows.slice(0, 2).map((r) => `${r.key}: ${r.value}`).join(' · '), evidence: rows, matched: 'keywords', topic: null };
}

/** A generated answer may only quote numbers that appear in the evidence (else it is rejected). */
export function groundedIn(answer: string, evidence: Evidence[]): boolean {
  const nums = toEnDigits(answer).match(/\d+(?:\.\d+)?/g) ?? [];
  const pool = toEnDigits(evidence.map((e) => `${e.key} ${e.value}`).join(' '));
  return nums.every((n) => pool.includes(n));
}

/** A question about a spec of the product on screen (topic + question cue, no budget/search words). */
export function isSpecQuestion(text: string): boolean {
  const q = normalizeForSearch(text);
  if (!matchTopic(text)) return false;
  if (/میلیون|تومن|تومان|نزدیک|فروشنده|بخرم|میخوام|پیدا کن/u.test(q)) return false;
  return /[?؟]|چنده|چقدره|چقدر|داره|دارد|هست|چیه|چند|کدوم|فرق/u.test(text);
}
