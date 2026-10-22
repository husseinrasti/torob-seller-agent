import { canon } from './query';
import type { Budget } from './query';

export type RankInput = {
  title_norm: string;
  search_text: string;
  category_name: string | null;
  seller_count: number;
  median_price: number | null;
  ws_title: number;
  ws_text: number;
};

/** Token match: exact 1, model code + suffix («t13» ~ «t13x») 0.95, prefix/stem (≥3 chars, ≤2 extra) 0.85. */
function tokenScore(q: string, words: Set<string>, wordList: string[]): number {
  if (words.has(q)) return 1;
  if (/\d/.test(q) && /[a-z]/.test(q)) {
    for (const w of wordList) if (w.startsWith(q) && w.length - q.length <= 4 && /^[a-z]+$/.test(w.slice(q.length))) return 0.95;
  }
  if (q.length >= 3 || /\d/.test(q)) {
    for (const w of wordList) {
      if (w.length >= 2 && (w.startsWith(q) || q.startsWith(w)) && Math.abs(w.length - q.length) <= 2 && Math.min(w.length, q.length) >= 2) {
        return 0.85;
      }
    }
  }
  return 0;
}

/** Fraction of query tokens found in the title (falling back to search_text at half weight). */
export function coverage(tokens: string[], titleNorm: string, searchText: string): number {
  if (!tokens.length) return 0;
  const titleWords = canon(titleNorm).split(' ');
  const textWords = canon(searchText).split(' ');
  const tSet = new Set(titleWords);
  const xSet = new Set(textWords);
  let sum = 0;
  for (const t of tokens) {
    const inTitle = tokenScore(t, tSet, titleWords);
    sum += inTitle > 0 ? inTitle : tokenScore(t, xSet, textWords) * 0.5;
  }
  return sum / tokens.length;
}

/** 0..1, log-scaled; 30+ sellers ≈ 1. */
export function sellerBoost(n: number): number {
  return Math.min(1, Math.log1p(Math.max(0, n)) / Math.log1p(30));
}

/** Budget fit bonus 0..1: prefer products whose median sits in the upper part of the budget. */
export function budgetFit(median: number | null, budget?: Budget): number {
  if (!budget?.max || !median) return 0;
  if (budget.min && median < budget.min * 0.85) return 0;
  if (median <= budget.max) return 0.4 + 0.6 * (median / budget.max);
  if (median <= budget.max * 1.15) return 0.2;
  return 0;
}

export type RankWeights = { coverage: number; wsTitle: number; wsText: number; head: number; category: number; sellers: number; budget: number };
const W: RankWeights = { coverage: 0.45, wsTitle: 0.15, wsText: 0.05, head: 0.15, category: 0.25, sellers: 0.3, budget: 0.12 };

/** Relevance score for one product candidate. Pure. `browse` = the query only names a category. */
export function productScore(
  p: RankInput,
  tokens: string[],
  opts: { categories?: string[]; budget?: Budget; browse?: boolean } = {},
): number {
  const head = tokens[0] && canon(p.title_norm).split(' ')[0] === tokens[0] ? 1 : 0;
  const cat = opts.categories?.length && p.category_name && opts.categories.includes(p.category_name) ? 1 : 0;
  if (opts.browse) return 0.6 * sellerBoost(p.seller_count) + 0.25 * cat + 0.15 * budgetFit(p.median_price, opts.budget);
  return (
    W.coverage * coverage(tokens, p.title_norm, p.search_text) +
    W.wsTitle * p.ws_title +
    W.wsText * p.ws_text +
    W.head * head +
    W.category * cat +
    W.sellers * sellerBoost(p.seller_count) +
    W.budget * budgetFit(p.median_price, opts.budget)
  );
}
