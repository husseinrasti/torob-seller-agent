import type { SessionState, StatePatch } from './state';

/** A tappable chip. `message` asks the agent; `action` runs a tool immediately (agent comments after); `patch` changes context only. */
export type Suggestion =
  | { kind: 'message'; label: string; text: string }
  | { kind: 'action'; label: string; text: string; tool: string; input: Record<string, unknown> }
  | { kind: 'patch'; label: string; patch: StatePatch };

export const HERO_CHIPS = [
  'گوشی سامسونگ تا ۶۰ میلیون نزدیک من',
  'هدفون بلوتوثی تا ۳ میلیون',
  'قهوه‌ساز خانگی، نمی‌دونم کدوم',
  'دوربین مداربسته برای مغازه',
];

export function suggestFromState(s: SessionState): Suggestion[] {
  if (!s.candidates.length && !s.chosenProduct) return HERO_CHIPS.map((t) => ({ kind: 'message', label: t, text: t }));
  const out: Suggestion[] = [];
  if (s.chosenProduct) {
    const confirmed = Object.values(s.followups).filter((v) => v === 'confirmed').length;
    if (confirmed >= 1 || s.shortlist.length >= 1) {
      out.push({ kind: 'action', label: 'برنامه مراجعه', text: 'برنامه مراجعه بساز', tool: 'plan_trip', input: {} });
    }
    if (!s.checklistOffered && (confirmed >= 1 || s.planId)) {
      out.push({ kind: 'action', label: 'چک‌لیست خرید', text: 'چک‌لیست خرید حضوری را بده', tool: 'purchase_checklist', input: {} });
    }
    if (!s.filters.open_now) out.push({ kind: 'patch', label: 'فقط باز الان', patch: { filters: { open_now: true } } });
    if (s.intent !== 'cheapest') out.push({ kind: 'patch', label: 'ارزان‌ترین‌ها اول', patch: { intent: 'cheapest' } });
    if (s.intent !== 'nearest') out.push({ kind: 'patch', label: 'نزدیک‌ترین‌ها اول', patch: { intent: 'nearest' } });
  } else if (s.candidates.length >= 2) {
    out.push({
      kind: 'action',
      label: 'مقایسه دو گزینه اول',
      text: 'دو گزینه اول را مقایسه کن',
      tool: 'compare_products',
      input: { product_ids: s.candidates.slice(0, 2) },
    });
  }
  return out;
}
