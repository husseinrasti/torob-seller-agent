import { describe, expect, it } from 'vitest';
import { bestWindow, dayStats, fridayClosedShare, hoursHistogram, startHint, visitSentence } from './hours-stats';
import type { WeeklyHours } from './hours';

const shift = (a: string, b: string) => ({ status: 'declared', shifts: [{ start_time: `${a}:00`, end_time: `${b}:00` }] });
const closed = { status: 'closed', shifts: [] };
const week = (sat: object, fri: object = closed): WeeklyHours => ({ sat, sun: sat, mon: sat, tue: sat, wed: sat, thu: sat, fri }) as WeeklyHours;

const shops = [
  { weekly_hours: week(shift('10:00', '20:00')) },
  { weekly_hours: week(shift('11:00', '19:00')) },
  { weekly_hours: week(shift('09:00', '13:00')) },
  { weekly_hours: week(shift('11:00', '18:00'), shift('16:00', '20:00')) },
  { weekly_hours: null }, // hours not registered
];

describe('hours statistics', () => {
  it('counts shops open at hh:30 and ignores unknown ones', () => {
    const h = hoursHistogram(shops, 'sat');
    expect(h[9]).toBe(1);
    expect(h[11]).toBe(4);
    expect(h[15]).toBe(3);
    expect(h[19]).toBe(1);
    expect(h[22]).toBe(0);
  });

  it('best window = longest run at ≥ 90 % of the peak; coverage is its minimum', () => {
    expect(bestWindow([...Array(11).fill(0), 1, 1, 0.75, 0.75, 0.75, 0.5, ...Array(7).fill(0)])).toEqual({ start: 11, end: 13, coverage: 1 });
    const d = dayStats(shops, 'sat');
    expect(d).toMatchObject({ known: 4, unknown: 1, closed: 0 });
    expect(d.window).toEqual({ start: 11, end: 13, coverage: 1 });
    expect(bestWindow(Array(24).fill(0))).toBeNull();
  });

  it('Friday closures and the Persian sentence', () => {
    expect(fridayClosedShare(shops)).toBe(0.75);
    const sat = dayStats(shops, 'sat');
    const fri = dayStats(shops, 'fri');
    expect(visitSentence(sat, fri)).toBe('شنبه بین ۱۱ تا ۱۳، ۱۰۰٪ فروشنده‌ها بازند؛ جمعه ۷۵٪ تعطیل‌اند؛ ساعت ۱ فروشگاه ثبت نشده');
    expect(visitSentence(fri, fri)).toBe('جمعه بین ۱۶ تا ۲۰، ۲۵٪ فروشنده‌ها بازند؛ ساعت ۱ فروشگاه ثبت نشده');
  });

  it('start hint: later today, then the next day with a window', () => {
    const stats = (['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const).map((d) => dayStats(shops, d));
    // 2026-10-24 is a Saturday; 08:00 / 12:00 / 22:00 Tehran
    expect(startHint(stats, new Date('2026-10-24T04:30:00Z'))).toEqual({ day_offset: 0, at: '11:00' });
    expect(startHint(stats, new Date('2026-10-24T08:30:00Z'))).toBeNull();
    expect(startHint(stats, new Date('2026-10-24T18:30:00Z'))).toEqual({ day_offset: 1, at: '11:00' });
  });
});
