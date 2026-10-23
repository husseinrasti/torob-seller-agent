import { describe, expect, it } from 'vitest';
import { sentenceCap } from './brevity';

const run = (chunks: string[], max = 2) => {
  const cap = sentenceCap(max);
  return chunks.map((c) => cap.push(c)).join('');
};

describe('sentence cap', () => {
  it('stops after two sentences, across chunks', () => {
    expect(run(['«ماهیار» اول شد چون ارزان‌ترین است. قیمتش ', 'تازه است؛ فاصله ۱۶۰ متر. وزن‌ها: قیمت ۳۵٪، ', 'فاصله ۲۵٪. **پیگیری**'])).toBe('«ماهیار» اول شد چون ارزان‌ترین است. قیمتش تازه است؛ فاصله ۱۶۰ متر.');
  });
  it('a dot between digits and a lone first char are not sentence ends; questions and line breaks are', () => {
    expect(run(['قیمت 4.5 میلیون است. بخرم؟ بعدی'])).toBe('قیمت 4.5 میلیون است. بخرم؟');
    expect(run(['خط اول\nخط دوم\nخط سوم'])).toBe('خط اول\nخط دوم');
  });
});
