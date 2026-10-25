import { describe, it, expect } from 'vitest';
import {
  tzOffsetMs,
  zonedWallTimeToUtc,
  localDateKey,
  addDaysToKey,
  weekdayOfKey,
  weekRange,
  weekRangeForInstant,
  inclusiveRangeToUtc,
  minutesBetween,
  formatDuration,
  minutesToHours,
} from './datetime';

const NY = 'America/New_York';

describe('timezone offsets', () => {
  it('is -5h in NY winter (EST)', () => {
    expect(tzOffsetMs(new Date('2025-01-15T12:00:00Z'), NY)).toBe(-5 * 3600000);
  });
  it('is -4h in NY summer (EDT)', () => {
    expect(tzOffsetMs(new Date('2025-07-15T12:00:00Z'), NY)).toBe(-4 * 3600000);
  });
});

describe('wall time -> UTC across DST boundary (2025-03-09)', () => {
  it('01:30 is still EST (-5)', () => {
    expect(zonedWallTimeToUtc('2025-03-09', '01:30', NY).toISOString()).toBe(
      '2025-03-09T06:30:00.000Z',
    );
  });
  it('03:30 is already EDT (-4)', () => {
    expect(zonedWallTimeToUtc('2025-03-09', '03:30', NY).toISOString()).toBe(
      '2025-03-09T07:30:00.000Z',
    );
  });
  it('does not drift a recorded local time', () => {
    const utc = zonedWallTimeToUtc('2025-11-10', '08:00', NY);
    expect(utc.toISOString()).toBe('2025-11-10T13:00:00.000Z');
    expect(localDateKey(utc, NY)).toBe('2025-11-10');
  });
});

describe('shift crossing midnight', () => {
  it('groups by the clock-in local day and measures full duration', () => {
    const clockIn = zonedWallTimeToUtc('2025-06-10', '22:00', NY);
    const clockOut = zonedWallTimeToUtc('2025-06-11', '06:00', NY);
    expect(localDateKey(clockIn, NY)).toBe('2025-06-10');
    expect(minutesBetween(clockIn, clockOut)).toBe(8 * 60);
  });
});

describe('weekly grouping (Monday-based)', () => {
  it('maps a Wednesday to Mon..Sun', () => {
    expect(weekRange('2025-06-11')).toEqual({ weekStart: '2025-06-09', weekEnd: '2025-06-15' });
  });
  it('keeps Sunday in the same week', () => {
    expect(weekRange('2025-06-15').weekStart).toBe('2025-06-09');
  });
  it('identifies Monday correctly', () => {
    expect(weekdayOfKey('2025-06-09')).toBe(1);
  });
  it('uses the company tz for instants near midnight', () => {
    expect(weekRangeForInstant('2025-06-09T02:00:00Z', NY).weekStart).toBe('2025-06-02');
  });
});

describe('inclusive date range -> UTC window', () => {
  it('includes the entire end day', () => {
    const { startUtc, endUtcExclusive } = inclusiveRangeToUtc('2025-06-01', '2025-06-07', NY);
    expect(startUtc).toBe('2025-06-01T04:00:00.000Z');
    expect(endUtcExclusive).toBe('2025-06-08T04:00:00.000Z');
    const late = zonedWallTimeToUtc('2025-06-07', '23:30', NY).toISOString();
    expect(late >= startUtc && late < endUtcExclusive).toBe(true);
  });
});

describe('calendar & duration helpers', () => {
  it('adds days across boundaries', () => {
    expect(addDaysToKey('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDaysToKey('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysToKey('2025-03-01', -1)).toBe('2025-02-28');
  });
  it('formats durations', () => {
    expect(formatDuration(495)).toBe('8h 15m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(0)).toBe('0m');
  });
  it('converts minutes to decimal hours', () => {
    expect(minutesToHours(495)).toBe(8.25);
    expect(minutesToHours(30)).toBe(0.5);
  });
});
