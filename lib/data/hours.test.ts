import { describe, expect, it } from 'vitest';
import { openState, parseDemoTime, hoursKnown, todayHoursText, type WeeklyHours } from './hours';

// Shape copied from data/shops.csv (shop_3f93a30a9e66c6dece07cdff)
const WEEK: WeeklyHours = {
  fri: { shifts: [{ end_time: '00:00:00', start_time: '00:00:00' }], status: 'closed' },
  mon: { shifts: [{ end_time: '19:00:00', start_time: '10:00:00' }], status: 'declared' },
  sat: { shifts: [{ end_time: '00:00:00', start_time: '00:00:00' }], status: 'closed' },
  sun: { shifts: [{ end_time: '19:00:00', start_time: '10:00:00' }], status: 'declared' },
  thu: { shifts: [{ end_time: '14:00:00', start_time: '10:00:00' }], status: 'declared' },
  tue: {
    shifts: [
      { end_time: '13:00:00', start_time: '10:00:00' },
      { end_time: '19:00:00', start_time: '16:00:00' },
    ],
    status: 'declared',
  },
  wed: { shifts: [{ end_time: '08:00:00', start_time: '08:00:00' }], status: 'unsupported' },
};

const at = (s: string) => parseDemoTime(s)!;

describe('parseDemoTime', () => {
  it('reads local Tehran time', () => {
    expect(at('2026-10-25T16:00').toISOString()).toBe('2026-10-25T12:30:00.000Z');
  });
  it('rejects garbage', () => {
    expect(parseDemoTime('nope')).toBeNull();
    expect(parseDemoTime(undefined)).toBeNull();
  });
});

describe('openState', () => {
  it('open now with closing time (Sunday 16:00)', () => {
    const s = openState(WEEK, at('2026-10-25T16:00'));
    expect(s).toMatchObject({ known: true, open: true, closesAt: '19:00' });
    expect(s.label).toBe('باز است · تا ۱۹:۰۰');
  });

  it('flags closing soon', () => {
    const s = openState(WEEK, at('2026-10-25T18:30'));
    expect(s.closingSoon).toBe(true);
    expect(s.label).toContain('به‌زودی می‌بندد');
  });

  it('closed after hours → next opening tomorrow', () => {
    const s = openState(WEEK, at('2026-10-25T20:00'));
    expect(s).toMatchObject({ known: true, open: false });
    expect(s.label).toBe('بسته است · فردا ۱۰:۰۰ باز می‌شود');
  });

  it('lunch break → opens later today', () => {
    const s = openState(WEEK, at('2026-10-27T14:00')); // Tuesday
    expect(s.label).toBe('بسته است · امروز ۱۶:۰۰ باز می‌شود');
  });

  it('Friday closed, skips closed Saturday', () => {
    const s = openState(WEEK, at('2026-10-23T12:00'));
    expect(s.open).toBe(false);
    expect(s.label).toBe('جمعه تعطیل · یکشنبه ۱۰:۰۰ باز می‌شود');
  });

  it('unsupported day is unknown, not closed', () => {
    const s = openState(WEEK, at('2026-10-28T12:00')); // Wednesday
    expect(s).toMatchObject({ known: false, open: null });
  });

  it('empty hours are unknown', () => {
    expect(openState({}, at('2026-10-25T16:00'))).toMatchObject({ known: false, open: null, label: 'ساعت کاری ثبت نشده' });
    expect(openState(null, at('2026-10-25T16:00')).known).toBe(false);
  });

  it('uses Asia/Tehran regardless of the host time zone', () => {
    // 06:00 UTC = 09:30 Tehran on Sunday → not yet open
    const s = openState(WEEK, new Date('2026-10-25T06:00:00Z'));
    expect(s.label).toBe('بسته است · امروز ۱۰:۰۰ باز می‌شود');
  });
});

describe('helpers', () => {
  it('hoursKnown', () => {
    expect(hoursKnown(WEEK)).toBe(true);
    expect(hoursKnown({})).toBe(false);
  });
  it('todayHoursText', () => {
    expect(todayHoursText(WEEK, at('2026-10-27T09:00'))).toBe('امروز ۱۰:۰۰ تا ۱۳:۰۰ و ۱۶:۰۰ تا ۱۹:۰۰');
    expect(todayHoursText(WEEK, at('2026-10-23T09:00'))).toBe('امروز تعطیل');
  });
});
