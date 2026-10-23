import { describe, expect, it } from 'vitest';
import { answerSpecQuestion, groundedIn, isSpecQuestion, keywordRows, matchTopic, NOT_LISTED } from './spec-qa';

const phone = {
  product_id: 'p1',
  title: 'گوشی سامسونگ A17 4G | حافظه ۱۲۸',
  specs: [
    { key: 'رنگ', value: 'مشکی' },
    { key: 'وزن', value: '۱۹۰ گرم' },
    { key: 'ابعاد نمایشگر', value: '۶.۷ اینچ' },
    { key: 'رم اجرایی', value: '۴ گیگابایت' },
    { key: 'حافظه داخلی', value: '۱۲۸ گیگابایت' },
    { key: 'NFC', value: 'دارد' },
    { key: 'پشتیبانی از 5G', value: 'ندارد' },
    { key: 'ظرفیت باتری', value: '۵۰۰۰ میلی‌آمپرساعت' },
    { key: 'پشتیبانی از شارژ سریع', value: 'دارد (۲۵ وات)' },
    { key: 'جنس فریم', value: 'پلاستیک' },
  ],
};
const other = { product_id: 'p2', title: 'گوشی سامسونگ A07', specs: [{ key: 'رم اجرایی', value: '۴ گیگابایت' }, { key: 'وزن', value: '۱۸۴ گرم' }] };

describe('spec Q&A', () => {
  it.each([
    ['این گوشی NFC داره؟', 'بله، NFC دارد'],
    ['ان اف سی داره؟', 'بله، NFC دارد'],
    ['5G داره؟', 'نه، 5G ندارد'],
    ['وزنش چنده؟', 'وزن: ۱۹۰ گرم'],
    ['باتریش چند میلی آمپره؟', 'ظرفیت باتری: ۵۰۰۰ میلی‌آمپرساعت'],
    ['صفحه‌اش چند اینچه؟', 'ابعاد نمایشگر: ۶.۷ اینچ'],
    ['رمش چقدره؟', 'رم اجرایی: ۴ گیگابایت'],
    ['چه رنگیه؟', 'رنگ: مشکی'],
    ['شارژرش چند واته؟', 'پشتیبانی از شارژ سریع: دارد (۲۵ وات)'],
  ])('%s → %s', (question, answer) => {
    const r = answerSpecQuestion(question, [phone]);
    expect(r.answer).toBe(answer);
    expect(r.matched).toBe('topic');
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it('a spec that is not registered is said so', () => {
    expect(answerSpecQuestion('ضد آبه؟', [phone]).answer).toBe(`مقاومت در برابر آب ${NOT_LISTED}`);
    expect(answerSpecQuestion('قلم S Pen داره؟', [phone])).toMatchObject({ answer: NOT_LISTED, matched: 'none' });
  });

  it('two products: per product, or once when equal', () => {
    expect(answerSpecQuestion('وزنشون فرق داره؟', [phone, other]).answer).toBe('سامسونگ A17 4G: وزن: ۱۹۰ گرم · سامسونگ A07: وزن: ۱۸۴ گرم');
    expect(answerSpecQuestion('فرقش با اون یکی تو رم چیه؟', [phone, other]).answer).toBe('رم اجرایی هر دو ۴ گیگابایت است');
  });

  it('keyword fallback finds rows by key/value words', () => {
    expect(matchTopic('فریمش از چیه؟')).toBeNull();
    expect(keywordRows('جنس فریم چیه؟', [phone])[0]).toEqual({ product_id: 'p1', key: 'جنس فریم', value: 'پلاستیک' });
  });

  it('a generated answer may only quote numbers present in the evidence', () => {
    const ev = [{ product_id: 'p1', key: 'وزن', value: '۱۹۰ گرم' }];
    expect(groundedIn('وزنش ۱۹۰ گرم است', ev)).toBe(true);
    expect(groundedIn('وزنش ۲۰۰ گرم است', ev)).toBe(false);
  });

  it('detects spec questions about the product on screen, not searches', () => {
    expect(isSpecQuestion('این گوشی NFC داره؟')).toBe(true);
    expect(isSpecQuestion('وزنش چنده؟')).toBe(true);
    expect(isSpecQuestion('گوشی با باتری قوی تا ۱۰ میلیون')).toBe(false);
    expect(isSpecQuestion('چرا این اول شد؟')).toBe(false);
  });
});
