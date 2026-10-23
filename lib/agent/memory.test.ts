import { describe, expect, it } from 'vitest';
import { initialStateFrom, memoryForPrompt, rememberContext, rememberTurn } from './memory';
import { DEFAULT_STATE, type SessionState } from './state';

const s = (o: Partial<SessionState> = {}): SessionState => ({ ...DEFAULT_STATE, ...o });

describe('rememberTurn', () => {
  it('records new searches (most recent first, unique, capped)', () => {
    let mem = {};
    for (const need of ['هدفون', 'گوشی', 'هدفون']) mem = rememberTurn(mem, s(), s({ need }))!;
    expect((mem as { searches: Array<{ text: string }> }).searches.map((x) => x.text)).toEqual(['هدفون', 'گوشی']);
  });
  it('records a newly chosen product with its title', () => {
    const mem = rememberTurn({}, s(), s({ chosenProduct: 'p1' }), { productTitle: 'گوشی A17' })!;
    expect(mem.products?.[0]).toMatchObject({ product_id: 'p1', title: 'گوشی A17' });
  });
  it('returns null when nothing worth remembering changed', () => {
    expect(rememberTurn({}, s({ need: 'x' }), s({ need: 'x' }))).toBeNull();
  });
});

describe('rememberContext / initialStateFrom', () => {
  it('remembers a chosen location and radius, not the default one', () => {
    const tajrish = { lat: 35.8, lon: 51.43, label: 'تجریش', source: 'text' as const };
    expect(rememberContext({}, s(), s())).toBeNull();
    const mem = rememberContext({}, s(), s({ location: tajrish, radius_m: 2000 }))!;
    expect(mem).toMatchObject({ location: tajrish, radius_m: 2000 });
    const next = initialStateFrom(mem);
    expect(next.location.label).toBe('تجریش');
    expect(next.radius_m).toBe(2000);
    expect(next.candidates).toEqual([]);
  });
  it('defaults without memory', () => {
    expect(initialStateFrom(null).location.label).toBe(DEFAULT_STATE.location.label);
  });
});

describe('memoryForPrompt', () => {
  it('summarizes for the system prompt', () => {
    const text = memoryForPrompt('سارا', { searches: [{ text: 'هدفون', at: '' }] });
    expect(text).toContain('سارا');
    expect(text).toContain('«هدفون»');
    expect(memoryForPrompt('علی', {})).toContain('حافظه‌ای از گفتگوهای قبلی ندارد');
  });
});
