import { DEFAULT_STATE, type SessionState } from './state';

/** What the assistant remembers about a person across chats. Small on purpose (shown and clearable in the UI). */
export type UserMemory = {
  location?: SessionState['location'];
  radius_m?: number;
  searches?: Array<{ text: string; at: string }>;
  products?: Array<{ product_id: string; title: string; at: string }>;
};

const MAX_SEARCHES = 8;
const MAX_PRODUCTS = 5;

function pushUnique<T>(list: T[] | undefined, item: T, same: (a: T) => boolean, max: number): T[] {
  return [item, ...(list ?? []).filter((x) => !same(x))].slice(0, max);
}

/** Memory after one turn, or null when nothing worth remembering changed. Pure. */
export function rememberTurn(
  mem: UserMemory,
  before: SessionState,
  after: SessionState,
  extra: { productTitle?: string; now?: Date } = {},
): UserMemory | null {
  const at = (extra.now ?? new Date()).toISOString();
  let next: UserMemory = { ...mem };
  let changed = false;
  if (after.need && after.need !== before.need) {
    const text = after.need.trim().slice(0, 80);
    next.searches = pushUnique(next.searches, { text, at }, (x) => x.text === text, MAX_SEARCHES);
    changed = true;
  }
  if (after.chosenProduct && after.chosenProduct !== before.chosenProduct && extra.productTitle) {
    next.products = pushUnique(
      next.products,
      { product_id: after.chosenProduct, title: extra.productTitle.slice(0, 90), at },
      (x) => x.product_id === after.chosenProduct,
      MAX_PRODUCTS,
    );
    changed = true;
  }
  const loc = rememberContext(next, before, after);
  if (loc) {
    next = loc;
    changed = true;
  }
  return changed ? next : null;
}

/** Location/radius the person chose themselves (not the default) become the start of their next chat. */
export function rememberContext(mem: UserMemory, before: Pick<SessionState, 'location' | 'radius_m'>, after: Pick<SessionState, 'location' | 'radius_m'>): UserMemory | null {
  let changed = false;
  const next = { ...mem };
  if (after.location.source !== 'default' && JSON.stringify(after.location) !== JSON.stringify(before.location)) {
    next.location = after.location;
    changed = true;
  }
  if (after.radius_m !== before.radius_m) {
    next.radius_m = after.radius_m;
    changed = true;
  }
  return changed ? next : null;
}

/** A new chat starts from the remembered location and radius. */
export function initialStateFrom(mem: UserMemory | null | undefined): SessionState {
  return {
    ...DEFAULT_STATE,
    location: mem?.location ?? DEFAULT_STATE.location,
    radius_m: mem?.radius_m ?? DEFAULT_STATE.radius_m,
  };
}

/** Persian memory block for the system prompt (personalization only; never a source of prices). */
export function memoryForPrompt(name: string, mem: UserMemory | null | undefined): string {
  const lines = [`نام کاربر: ${name}`];
  if (mem?.searches?.length) lines.push(`جست‌وجوهای اخیر در گفتگوهای قبلی: ${mem.searches.slice(0, 5).map((s) => `«${s.text}»`).join('، ')}`);
  if (mem?.products?.length) lines.push(`کالاهایی که قبلاً انتخاب کرده: ${mem.products.slice(0, 3).map((p) => `«${p.title.split('|')[0].trim()}» (${p.product_id})`).join('، ')}`);
  if (mem?.location) lines.push(`محل معمول: ${mem.location.label}${mem.radius_m ? `، شعاع ${mem.radius_m} متر` : ''}`);
  if (lines.length === 1) lines.push('حافظه‌ای از گفتگوهای قبلی ندارد.');
  return lines.join('\n');
}
