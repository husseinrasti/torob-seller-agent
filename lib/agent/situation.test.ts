import { describe, expect, it } from 'vitest';
import { parseSituation } from './situation';

const SUN_2330 = new Date('2026-10-25T23:30:00+03:30');
const SUN_1600 = new Date('2026-10-25T16:00:00+03:30');
const local = (d: Date | null) => d && new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

describe('situational requests', () => {
  it('«ساعت ۱۱:۳۰ شب، شارژر گوشی می‌خوام» → now, 23:30, «شارژر گوشی»', () => {
    const s = parseSituation('ساعت ۱۱:۳۰ شب، شارژر گوشی می‌خوام', SUN_2330);
    expect(s).toMatchObject({ situational: true, urgency: 'now', need_text: 'شارژر گوشی', time_budget_min: null });
    expect(local(s.at)).toBe('Sun 23:30');
  });

  it('«جمعه ظهر هدفون می‌خوام» → the coming Friday 13:00', () => {
    const s = parseSituation('جمعه ظهر هدفون می‌خوام', SUN_1600);
    expect(s.need_text).toBe('هدفون');
    expect(local(s.at)).toBe('Fri 13:00');
    expect(s.situational).toBe(true);
  });

  it('«کابل تایپ‌سی، ۱۵ دقیقه دیگه قطار دارم» → walking, 600 m', () => {
    const s = parseSituation('کابل تایپ‌سی، ۱۵ دقیقه دیگه قطار دارم', SUN_1600);
    expect(s).toMatchObject({ situational: true, urgency: 'now', time_budget_min: 15, transport: 'walk', radius_m: 600, need_text: 'کابل تایپ سی' });
  });

  it('an explicit moment beats a mission unless it delegates checks or names a budget', () => {
    expect(parseSituation('ساعت ۱۱:۳۰ شب، شارژر گوشی می‌خوام نزدیک میدان هفت تیر', SUN_2330).strong).toBe(true);
    expect(parseSituation('من یه گوشی سامسونگ حدود قیمت ۵۰ میلیون تومن میخوام. محدوده سعادت آباد باشه. و خودت بپرس ببین الان باز هستند.', SUN_1600).strong).toBe(false);
  });

  it('plain searches are not situational', () => {
    expect(parseSituation('گوشی سامسونگ تا ۶۰ میلیون نزدیک من', SUN_1600).situational).toBe(false);
    expect(parseSituation('هدفون بلوتوثی تا ۳ میلیون', SUN_1600).situational).toBe(false);
    expect(parseSituation('فقط اونایی که الان بازن', SUN_1600).situational).toBe(false);
    // no product words: the route falls back to the chosen product
    expect(parseSituation('الان کجا بازه؟', SUN_1600)).toMatchObject({ situational: true, need_text: '' });
  });

  it('«ساعت ۷ عصر» and «فردا صبح»', () => {
    expect(local(parseSituation('ساعت ۷ عصر پاوربانک', SUN_1600).at)).toBe('Sun 19:00');
    expect(local(parseSituation('فردا صبح شارژر', SUN_1600).at)).toBe('Mon 10:00');
  });
});
