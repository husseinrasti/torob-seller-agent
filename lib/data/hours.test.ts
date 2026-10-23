import { describe, expect, it } from 'vitest';
import { openState, parseDemoTime, hoursKnown, shiftsOf, todayHoursText, type WeeklyHours } from './hours';

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

  it('ignores placeholder 00:00–00:00 shifts', () => {
    const week: WeeklyHours = {
      sun: {
        shifts: [
          { end_time: '22:00:00', start_time: '11:00:00' },
          { end_time: '00:00:00', start_time: '00:00:00' },
        ],
        status: 'declared',
      },
    };
    expect(openState(week, at('2026-10-25T16:00')).label).toBe('باز است · تا ۲۲:۰۰');
    expect(openState(week, at('2026-10-25T23:00')).open).toBe(false);
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

describe('00:00–00:00 placeholder shifts (3,689 on Saturdays in the dataset)', () => {
  const placeholder = { status: 'declared', shifts: [{ start_time: '00:00:00', end_time: '00:00:00' }] };
  const real = { status: 'declared', shifts: [{ start_time: '10:00:00', end_time: '21:30:00' }] };
  // 2026-10-24 is a Saturday
  const satNoon = new Date('2026-10-24T12:00:00+03:30');

  it('a declared 00:00–00:00 day is unknown, never «open 24 h»', () => {
    expect(shiftsOf(placeholder)).toBeNull();
    const st = openState({ sat: placeholder, sun: real }, satNoon);
    expect(st.known).toBe(false);
    expect(st.open).toBeNull();
    expect(st.label).toBe('ساعت کاری امروز ثبت نشده');
  });

  it('the next opening skips placeholder days', () => {
    // Friday 23:30 → Saturday is a placeholder → Sunday 10:00
    const st = openState({ fri: { status: 'closed' }, sat: placeholder, sun: real }, new Date('2026-10-23T23:30:00+03:30'));
    expect(st.open).toBe(false);
    expect(st.nextOpen).toEqual({ day: 'یکشنبه', time: '10:00' });
  });

  it('shifts starting at midnight («00:00–10:00», «00:00–23:59») are unreliable too', () => {
    expect(shiftsOf({ status: 'declared', shifts: [{ start_time: '00:00:00', end_time: '10:00:00' }, { start_time: '00:00:00', end_time: '00:00:00' }] })).toBeNull();
    expect(openState({ sun: { status: 'declared', shifts: [{ start_time: '00:00:00', end_time: '23:59:00' }] } }, new Date('2026-10-25T23:30:00+03:30')).open).toBeNull();
    expect(shiftsOf({ status: 'declared', shifts: [{ start_time: '00:00:00', end_time: '00:00:00' }, { start_time: '10:00:00', end_time: '19:00:00' }] })).toEqual([[600, 1140]]);
  });
});
