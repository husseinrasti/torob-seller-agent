import { pool, q } from '../db/client';
import { formatNumber, formatTomanShort } from '../fa/format';
import { toFaDigits } from '../fa/digits';
import { normalizeForSearch } from '../fa/normalize';
import { canon, parseQuery, type Budget } from './query';
import { productScore, type RankInput } from './rank';
import { diffSpecs, keySpecs, shortValue, specNumber, specValue, type KeySpec, type Spec } from './specs';

export type BudgetNote = 'in_budget' | 'above_budget' | 'below_budget' | null;

export type ProductHit = {
  product_id: string;
  title: string;
  brand: string | null;
  category: string | null;
  image: string | null;
  seller_count: number;
  min_price: number | null;
  median_price: number | null;
  key_specs: KeySpec[];
  why: string;
  budget_note: BudgetNote;
};

type Candidate = RankInput & { product_id: string; min_price: number | null; score: number };

const WS_THRESHOLD = 0.4;

/** Trigram retrieval (index-backed) of up to `limit` candidates by keywords and/or categories. */
export async function retrieveCandidates(keywords: string, categories: string[] = [], limit = 300): Promise<Candidate[]> {
  if (!keywords && !categories.length) return [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL pg_trgm.word_similarity_threshold = ${WS_THRESHOLD}`);
    const where = keywords
      ? categories.length
        ? `($1 <% search_text OR category_name = ANY($2::text[]))`
        : `$1 <% search_text`
      : `category_name = ANY($2::text[])`;
    const res = await client.query(
      `SELECT product_id, title_norm, search_text, category_name, seller_count,
              median_price::float8 AS median_price, min_price::float8 AS min_price,
              word_similarity($1, title_norm) AS ws_title, word_similarity($1, search_text) AS ws_text
         FROM products
        WHERE ${where}
        ORDER BY word_similarity($1, search_text) + LEAST(seller_count, 30) / 30.0 * 0.3
                 + (category_name = ANY($2::text[]))::int * 0.3 DESC
        LIMIT $3`,
      [keywords, categories, limit],
    );
    await client.query('COMMIT');
    return res.rows.map((r) => ({ ...r, score: 0 }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function rankCandidates(
  cands: Candidate[],
  tokens: string[],
  opts: { categories?: string[]; budget?: Budget; browse?: boolean },
): Candidate[] {
  for (const c of cands) c.score = productScore(c, tokens, opts);
  return cands.sort((a, b) => b.score - a.score || b.seller_count - a.seller_count);
}

function budgetNote(median: number | null, budget?: Budget): BudgetNote {
  if (!budget?.max || !median) return null;
  if (median > budget.max) return 'above_budget';
  if (budget.min && median < budget.min) return 'below_budget';
  return 'in_budget';
}

const SUPERIORITY: Array<[string, string]> = [
  ['رم', 'رم'],
  ['حافظه', 'حافظه'],
  ['باتری', 'باتری'],
];

/** One templated Persian «چرا» line per candidate (≤ 2 phrases), relative to the shown set. */
export function productWhy(
  items: Array<{ product_id: string; min_price: number | null; seller_count: number; specs: Spec[] | null; budget_note: BudgetNote }>,
  hasBudget: boolean,
): Map<string, string> {
  const out = new Map<string, string[]>();
  const add = (id: string, s: string) => {
    const arr = out.get(id) ?? [];
    if (arr.length < 2 && !arr.includes(s)) arr.push(s);
    out.set(id, arr);
  };
  for (const it of items) if (it.budget_note === 'above_budget') add(it.product_id, 'کمی بالاتر از بودجه');
  const priced = items.filter((i) => i.min_price && i.budget_note !== 'above_budget');
  if (priced.length > 1) {
    const cheapest = priced.reduce((a, b) => (b.min_price! < a.min_price! ? b : a));
    add(cheapest.product_id, hasBudget ? 'ارزان‌ترین گزینه در بودجه' : 'ارزان‌ترین گزینه');
  }
  if (items.length > 1) {
    const most = items.reduce((a, b) => (b.seller_count > a.seller_count ? b : a));
    if (most.seller_count > 1) add(most.product_id, `بیشترین فروشنده (${toFaDigits(most.seller_count)})`);
  }
  for (const [label] of SUPERIORITY) {
    const vals = items.map((i) => ({ id: i.product_id, raw: specValue(i.specs, label), n: specNumber(specValue(i.specs, label)) }));
    const known = vals.filter((v) => v.n !== null);
    if (known.length < 2) continue;
    const max = Math.max(...known.map((v) => v.n!));
    const top = known.filter((v) => v.n === max);
    if (top.length === 1 && known.some((v) => v.n! < max)) add(top[0].id, `${label} ${toFaDigits(shortValue(top[0].raw!))} بالاتر از بقیه`);
  }
  const result = new Map<string, string>();
  for (const it of items) {
    const arr = out.get(it.product_id) ?? [];
    if (!arr.length) arr.push(it.seller_count >= 10 ? `انتخاب رایج (${toFaDigits(it.seller_count)} فروشنده)` : 'تطابق خوب با درخواست شما');
    result.set(it.product_id, arr.join(' · '));
  }
  return result;
}

type DetailRow = {
  product_id: string;
  persian_title: string;
  brand_display: string | null;
  category_name: string | null;
  primary_image: string | null;
  seller_count: number;
  min_price: number | null;
  median_price: number | null;
  specs: Spec[] | null;
};

export async function productDetails(ids: string[]): Promise<DetailRow[]> {
  if (!ids.length) return [];
  const rows = await q<DetailRow>(
    `SELECT product_id, persian_title, brand_display, category_name, primary_image, seller_count,
            min_price::float8 AS min_price, median_price::float8 AS median_price, specs
       FROM products WHERE product_id = ANY($1::text[])`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [r.product_id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is DetailRow => Boolean(r));
}

export type SearchResult = {
  query: string;
  keywords: string;
  categories: string[];
  budget?: Budget;
  budget_relaxed: boolean;
  products: ProductHit[];
};

/** Product search per spec §5.2: trigram retrieval + rerank, budget ±15% with fallback, templated why. */
export async function searchProducts(opts: {
  text: string;
  keywords?: string;
  categories?: string[];
  budget?: Budget;
  limit?: number;
}): Promise<SearchResult> {
  const pq = parseQuery(opts.text);
  const keywords = (opts.keywords ? parseQuery(opts.keywords).keywords : pq.keywords) || pq.keywords;
  const tokens = parseQuery(keywords).tokens;
  const budget = opts.budget ?? pq.budget;
  const categories = opts.categories ?? [];
  const limit = opts.limit ?? 8;

  // «گوشی موبایل» alone names a category: rank by popularity instead of text overlap
  const browse = categories.some((c) => {
    const words = new Set(canon(normalizeForSearch(c)).split(' '));
    return tokens.length > 0 && tokens.every((t) => words.has(t));
  });
  const ranked = rankCandidates(await retrieveCandidates(keywords, categories), tokens, { categories, budget, browse });
  // Category-routed searches only keep products from those categories when enough exist.
  let pool_ = ranked;
  if (categories.length) {
    const inCat = ranked.filter((c) => c.category_name && categories.includes(c.category_name));
    if (inCat.length >= 3) pool_ = inCat;
  }
  let budgetRelaxed = false;
  if (budget?.max || budget?.min) {
    const lo = budget.min ? budget.min * 0.85 : 0;
    const hi = budget.max ? budget.max * 1.15 : Infinity;
    const priceOf = (c: Candidate) => c.median_price ?? c.min_price;
    const inBudget = pool_.filter((c) => {
      const p = priceOf(c);
      return p !== null && p >= lo && p <= hi;
    });
    if (inBudget.length >= 3) {
      // in-budget first; the best «slightly above budget» option takes slot 4 (upsell)
      const strict = inBudget.filter((c) => !budget.max || priceOf(c)! <= budget.max);
      const above = inBudget.filter((c) => budget.max && priceOf(c)! > budget.max);
      pool_ = strict.length >= 3 && above.length ? [...strict.slice(0, 3), above[0], ...strict.slice(3)] : inBudget;
    } else budgetRelaxed = true;
  }
  // de-duplicate identical titles (the catalog has duplicate listings), keep the best ranked
  const seen = new Set<string>();
  const top: Candidate[] = [];
  for (const c of pool_) {
    if (seen.has(c.title_norm)) continue;
    seen.add(c.title_norm);
    top.push(c);
    if (top.length >= limit) break;
  }
  const details = await productDetails(top.map((c) => c.product_id));
  const items = details.map((d) => ({
    ...d,
    budget_note: budgetNote(d.median_price ?? d.min_price, budget),
  }));
  const why = productWhy(items, Boolean(budget?.max));
  return {
    query: opts.text,
    keywords,
    categories,
    budget,
    budget_relaxed: budgetRelaxed,
    products: items.map((d) => ({
      product_id: d.product_id,
      title: d.persian_title,
      brand: d.brand_display,
      category: d.category_name,
      image: d.primary_image,
      seller_count: d.seller_count,
      min_price: d.min_price,
      median_price: d.median_price,
      key_specs: keySpecs(d.specs),
      why: why.get(d.product_id) ?? '',
      budget_note: d.budget_note,
    })),
  };
}

export type CompareTable = {
  products: Array<{ product_id: string; title: string; image: string | null; brand: string | null }>;
  rows: Array<{ key: string; values: Array<string | null> }>;
};

/** Differences only (≤ 12 spec rows) plus price/seller rows (spec §5.3). */
export async function compareProducts(ids: string[]): Promise<CompareTable> {
  const details = await productDetails(ids.slice(0, 4));
  const specRows = diffSpecs(details.map((d) => d.specs));
  const priceRows = [
    { key: 'کمترین قیمت', values: details.map((d) => (d.min_price ? `${formatNumber(d.min_price)} تومان` : null)) },
    { key: 'قیمت میانه بازار', values: details.map((d) => (d.median_price ? `${formatTomanShort(d.median_price)} تومان` : null)) },
    { key: 'تعداد فروشنده', values: details.map((d) => toFaDigits(d.seller_count)) },
  ];
  return {
    products: details.map((d) => ({ product_id: d.product_id, title: d.persian_title, image: d.primary_image, brand: d.brand_display })),
    rows: [...priceRows, ...specRows],
  };
}
