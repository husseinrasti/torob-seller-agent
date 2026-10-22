import { describe, expect, it } from 'vitest';
import { canon, parseBudget, parseQuery } from './query';
import { normalizeForSearch } from '../fa/normalize';

const budgetOf = (s: string) => parseBudget(normalizeForSearch(s)).budget;

describe('parseBudget', () => {
  it('max budgets in Persian', () => {
    expect(budgetOf('گوشی سامسونگ تا ۶۰ میلیون')).toEqual({ max: 60_000_000 });
    expect(budgetOf('اسپیکر بلوتوثی تا ۲ میلیون')).toEqual({ max: 2_000_000 });
    expect(budgetOf('هدفون زیر ۸۰۰ هزار تومان')).toEqual({ max: 800_000 });
    expect(budgetOf('گوشی تا ۶۰ تومن')).toEqual({ max: 60_000_000 });
    expect(budgetOf('تا ۲.۵ میلیون')).toEqual({ max: 2_500_000 });
  });
  it('ranges and approximations', () => {
    expect(budgetOf('بین ۲ تا ۳ میلیون')).toEqual({ min: 2_000_000, max: 3_000_000 });
    expect(budgetOf('حدود ۳ میلیون')).toEqual({ min: 2_400_000, max: 3_300_000 });
    expect(budgetOf('یه گوشی ۶۰ میلیونی')).toEqual({ min: 48_000_000, max: 66_000_000 });
  });
  it('does not mistake specs or distances for a budget', () => {
    expect(budgetOf('پاوربانک ۲۰ هزار')).toBeUndefined();
    expect(budgetOf('لامپ ال ای دی ۲۰ وات')).toBeUndefined();
    expect(budgetOf('فروشنده تا ۲ کیلومتر')).toBeUndefined();
    expect(budgetOf('سیم برق ۲ در ۲.۵')).toBeUndefined();
  });
});

describe('parseQuery', () => {
  it('strips budget, location and filler', () => {
    const q = parseQuery('گوشی سامسونگ تا ۶۰ میلیون نزدیک من');
    expect(q.keywords).toBe('گوشی سامسونگ');
    expect(q.budget).toEqual({ max: 60_000_000 });
    expect(q.wantsNearby).toBe(true);
  });
  it('keeps descriptive words and numbers', () => {
    expect(parseQuery('سامسونگ A17 رم ۶').keywords).toBe('سامسونگ a17 رم 6');
    expect(parseQuery('قهوه‌ساز خانگی، نمی‌دونم کدوم').keywords).toBe('قهوه ساز خانگی');
  });
  it('canonicalizes synonyms', () => {
    expect(canon('لامپ ال ای دی')).toBe('لامپ led');
    expect(parseQuery('کیو سی وای T13').tokens).toEqual(['qcy', 't13']);
  });
});
