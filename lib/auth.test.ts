import { describe, expect, it } from 'vitest';
import { cleanName } from './auth';

describe('cleanName', () => {
  it('accepts Persian and Latin names, trims spaces', () => {
    expect(cleanName('  سارا   محمدی ')).toBe('سارا محمدی');
    expect(cleanName('Ali')).toBe('Ali');
    expect(cleanName('علی‌رضا')).toBe('علی‌رضا');
  });
  it('rejects empty, too long or odd input', () => {
    expect(cleanName('a')).toBeNull();
    expect(cleanName('x'.repeat(33))).toBeNull();
    expect(cleanName('<script>')).toBeNull();
    expect(cleanName(42)).toBeNull();
  });
});
