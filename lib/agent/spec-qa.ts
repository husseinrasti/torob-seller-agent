import { generateText } from 'ai';
import { q } from '../db/client';
import { llmConfigured, model } from '../llm';
import { answerSpecQuestion, groundedIn, NOT_LISTED, type Evidence, type SpecProduct } from '../search/spec-qa';
import type { SessionState } from './state';

export type SpecAnswerOutput = {
  ui: 'spec_answer';
  question: string;
  answer: string;
  evidence: Evidence[];
  products: Array<{ product_id: string; title: string }>;
  source: 'specs' | 'llm';
};

const COMPARE_RE = /فرق|مقایسه|اون یکی|آن یکی|کدوم|کدام|بهتر/u;

/** Which products a question is about: explicit ids, else the chosen product (two candidates for «فرقش …»). */
export function specProductIds(question: string, state: SessionState, ids?: string[]): string[] {
  if (ids?.length) return ids.slice(0, 3);
  if (COMPARE_RE.test(question) && state.candidates.length >= 2) {
    const first = state.chosenProduct ?? state.candidates[0];
    return [first, ...state.candidates.filter((c) => c !== first)].slice(0, 2);
  }
  const one = state.chosenProduct ?? state.candidates[0];
  return one ? [one] : [];
}

/**
 * F8: answer from `products.specs` only. Topic matches are templated; otherwise the fast model sees at
 * most 30 matching rows (6 s) and its answer is kept only if every number in it is in those rows.
 */
export async function specQa(question: string, ids: string[]): Promise<SpecAnswerOutput> {
  if (!ids.length) throw new Error('اول کالا را انتخاب کنیم؛ کدام کالا؟');
  const products = await q<SpecProduct>('SELECT product_id, persian_title AS title, specs FROM products WHERE product_id = ANY($1::text[])', [ids]);
  const ordered = ids.map((id) => products.find((p) => p.product_id === id)).filter((p): p is SpecProduct => Boolean(p));
  const res = answerSpecQuestion(question, ordered);
  const out = (answer: string, evidence: Evidence[], source: SpecAnswerOutput['source']): SpecAnswerOutput => ({
    ui: 'spec_answer',
    question,
    answer,
    evidence: evidence.slice(0, 8),
    products: ordered.map((p) => ({ product_id: p.product_id, title: p.title.split('|')[0].trim() })),
    source,
  });
  if (res.matched !== 'keywords' || !llmConfigured()) return out(res.answer, res.evidence, 'specs');
  try {
    const rows = res.evidence.slice(0, 30);
    const { text } = await generateText({
      model: model('fast'),
      system:
        'You answer a Persian shopper\'s question about products using ONLY the spec rows given. Answer in one short Persian sentence. ' +
        `If the rows do not contain the answer, reply exactly «${NOT_LISTED}». Never add facts, numbers or opinions that are not in the rows.`,
      prompt: `پرسش: ${question}\n\nمشخصات ثبت‌شده:\n${rows.map((r) => `- [${ordered.find((p) => p.product_id === r.product_id)?.title.split('|')[0].trim()}] ${r.key}: ${r.value}`).join('\n')}`,
      timeout: 6000,
      maxRetries: 0,
    });
    const answer = text.trim();
    if (answer && groundedIn(answer, rows)) return out(answer, rows, 'llm');
  } catch (err) {
    console.warn('[spec-qa] llm failed, template answer:', err instanceof Error ? err.message : err);
  }
  return out(res.answer, res.evidence, 'specs');
}
