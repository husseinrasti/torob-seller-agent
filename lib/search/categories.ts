import { generateText, Output } from 'ai';
import { z } from 'zod';
import { q } from '../db/client';
import { llmConfigured, model } from '../llm';
import { parseQuery, type Budget } from './query';
import { rankCandidates, retrieveCandidates } from './products';

export type Route = {
  categories: string[];
  keywords: string;
  budget?: Budget;
  mustHave: string[];
  source: 'llm' | 'rules';
  /** candidate categories with vote share, for debugging / the LLM */
  candidates: Array<{ name: string; share: number }>;
  /** true when `budget` was parsed from the text itself */
  textBudget?: boolean;
};

const cache = new Map<string, Route>();
const CACHE_MAX = 500;

/** Cached routes are hint-free (the text decides); a caller's budget hint is applied on the way out. */
function remember(key: string, r: Route, hints: { budget?: Budget }): Route {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, r);
  return withHints(r, hints);
}

/** Budget priority: an amount in the text > the caller's hint > the routing model's reading. */
function withHints(r: Route, hints: { budget?: Budget }): Route {
  return r.textBudget ? r : { ...r, budget: hints.budget ?? r.budget };
}

/** Category votes from the best-matching products, plus category-name matches. */
export async function categoryCandidates(keywords: string, tokens: string[]): Promise<Array<{ name: string; share: number }>> {
  const votes = new Map<string, number>();
  if (keywords) {
    const ranked = rankCandidates(await retrieveCandidates(keywords, [], 150), tokens, {}).slice(0, 40);
    for (const c of ranked) if (c.category_name) votes.set(c.category_name, (votes.get(c.category_name) ?? 0) + c.score);
    const byName = await q<{ name: string; ws: number }>(
      `SELECT name, word_similarity(name_norm, $1) AS ws FROM categories
        WHERE product_count > 0 AND word_similarity(name_norm, $1) >= 0.6
        ORDER BY ws DESC, product_count DESC LIMIT 5`,
      [keywords],
    );
    const total0 = [...votes.values()].reduce((a, b) => a + b, 0) || 1;
    for (const c of byName) votes.set(c.name, (votes.get(c.name) ?? 0) + c.ws * total0 * 0.15);
  }
  const total = [...votes.values()].reduce((a, b) => a + b, 0) || 1;
  return [...votes.entries()]
    .map(([name, v]) => ({ name, share: v / total }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 15);
}

function rulesPick(cands: Array<{ name: string; share: number }>): string[] {
  if (!cands.length) return [];
  const top = cands[0].share;
  return cands.filter((c, i) => i === 0 || (c.share >= 0.2 && c.share >= top * 0.5)).slice(0, 3).map((c) => c.name);
}

const RouteSchema = z.object({
  categories: z.array(z.string()).max(5).describe('≤5 relevant category names, copied exactly from the candidate list; empty if none fits'),
  keywords: z.string().describe('product keywords only (type, brand, model, capacity), Persian, no budget/location/filler words'),
  budget_min_toman: z.number().nullable(),
  budget_max_toman: z.number().nullable(),
  must_have: z.array(z.string()).max(5).describe('must-have features mentioned by the user, short Persian phrases'),
});

/**
 * Spec §5.1. Deterministic first (product votes + name trigram); the fast LLM refines the choice only when
 * the vote is ambiguous. Always falls back to rules on any LLM error.
 */
export async function routeCategories(userText: string, hints: { budget?: Budget } = {}): Promise<Route> {
  const pq = parseQuery(userText);
  const key = pq.norm;
  const hit = cache.get(key);
  if (hit) return withHints(hit, hints);

  const candidates = await categoryCandidates(pq.keywords, pq.tokens);
  const rules: Route = {
    categories: rulesPick(candidates),
    keywords: pq.keywords,
    budget: pq.budget,
    textBudget: Boolean(pq.budget),
    mustHave: [],
    source: 'rules',
    candidates,
  };
  const confident = candidates.length > 0 && candidates[0].share >= 0.6;
  if (confident || !candidates.length || !llmConfigured() || process.env.LLM_ROUTING === 'off') return remember(key, rules, hints);

  try {
    const { output } = await generateText({
      model: model('fast'),
      output: Output.object({ schema: RouteSchema }),
      timeout: 6000,
      maxRetries: 0,
      prompt: [
        'You route a Persian shopping request to product categories of an Iranian price-comparison catalog.',
        `User request: «${userText}»`,
        `Candidate categories (with vote share): ${candidates.map((c) => `${c.name} (${c.share.toFixed(2)})`).join(' | ')}`,
        'Pick at most 5 categories ONLY from the candidates (exact strings). Prefer the category of the product itself, not its accessories, unless the user asks for an accessory.',
        'Budget: convert Persian amounts to toman (e.g. «۶۰ میلیون» = 60000000, «۶۰ تومن» = 60000000, «۵۰۰ هزار» = 500000). Null if not mentioned. Numbers that describe specs (۲۰ هزار میلی‌آمپر, ۲۰ وات) are NOT budgets.',
      ].join('\n'),
    });
    const valid = new Set(candidates.map((c) => c.name));
    const cats = output.categories.filter((c) => valid.has(c));
    // the model may invent a budget (e.g. its prompt example) — only trust it when the text names an amount
    const saysAmount = /[0-9۰-۹]|میلیون|ملیون|میلیارد|هزار|تومن|تومان/u.test(userText);
    const llmBudget: Budget | undefined =
      saysAmount && (output.budget_max_toman || output.budget_min_toman)
        ? { min: output.budget_min_toman ?? undefined, max: output.budget_max_toman ?? undefined }
        : undefined;
    return remember(key, {
      categories: cats.length ? cats : rules.categories,
      keywords: parseQuery(output.keywords || pq.keywords).keywords || pq.keywords,
      budget: pq.budget ?? llmBudget,
      textBudget: Boolean(pq.budget),
      mustHave: output.must_have,
      source: 'llm',
      candidates,
    }, hints);
  } catch (err) {
    console.warn('[routeCategories] LLM failed, using rules:', (err as Error).message);
    return remember(key, rules, hints);
  }
}
