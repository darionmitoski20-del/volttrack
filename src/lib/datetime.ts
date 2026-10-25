/**
 * Centralized date & timezone utility for VoltTrack.
 *
 * Rules of the road:
 *  - Every instant is STORED in UTC (the DB uses timestamptz / ISO strings).
 *  - The COMPANY timezone (an IANA name, e.g. "America/New_York") is stored
 *    separately and used only for *display* and for *grouping* (which local
 *    day / week a UTC instant belongs to).
 *  - This module has no third-party dependencies. It relies on the platform's
 *    Intl time zone database, which correctly models DST transitions. That
 *    means a recorded local time will not silently shift by an hour or two.
 *
 * If you ever need date-fns for formatting elsewhere, keep the *timezone*
 * math here so there is a single source of truth.
 */

export type DateKey = string; // 'YYYY-MM-DD' calendar date, timezone-independent

/** Milliseconds a zone is ahead of UTC at a given instant (handles DST). */
export function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Convert a wall-clock time in a zone to the correct UTC instant.
 * Two-pass offset resolution correctly handles DST boundaries.
 */
export function zonedWallTimeToUtc(
  dateKey: DateKey,
  time: string, // 'HH:mm' or 'HH:mm:ss'
  timeZone: string,
): Date {
  const [y = 1970, m = 1, d = 1] = dateKey.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = time.split(':').map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  // First guess: subtract the offset measured at the naive instant.
  let offset = tzOffsetMs(new Date(naiveUtc), timeZone);
  let utc = naiveUtc - offset;
  // Refine once using the offset at the candidate instant (DST edges).
  offset = tzOffsetMs(new Date(utc), timeZone);
  utc = naiveUtc - offset;
  return new Date(utc);
}

/** Local calendar date ('YYYY-MM-DD') that a UTC instant falls on in a zone. */
export function localDateKey(instant: Date | string, timeZone: string): DateKey {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA yields YYYY-MM-DD.
  return dtf.format(date);
}

/** Add whole days to a DateKey (calendar arithmetic, no timezone involved). */
export function addDaysToKey(dateKey: DateKey, days: number): DateKey {
  const [y = 1970, m = 1, d = 1] = dateKey.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

/** Day of week for a DateKey: 0=Sun … 6=Sat. */
export function weekdayOfKey(dateKey: DateKey): number {
  const [y = 1970, m = 1, d = 1] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Monday-based week that contains a DateKey.
 * Returns inclusive start (Mon) and end (Sun) DateKeys.
 */
export function weekRange(dateKey: DateKey): { weekStart: DateKey; weekEnd: DateKey } {
  const dow = weekdayOfKey(dateKey); // 0=Sun..6=Sat
  const backToMonday = (dow + 6) % 7; // Sun->6, Mon->0, Tue->1 ...
  const weekStart = addDaysToKey(dateKey, -backToMonday);
  const weekEnd = addDaysToKey(weekStart, 6);
  return { weekStart, weekEnd };
}

/** Week that a UTC instant belongs to, in the company timezone. */
export function weekRangeForInstant(instant: Date | string, timeZone: string) {
  return weekRange(localDateKey(instant, timeZone));
}

/**
 * Convert an INCLUSIVE local date range to a UTC query window.
 * Returns { startUtc, endUtcExclusive } so callers filter with
 *   clock_in >= startUtc AND clock_in < endUtcExclusive
 * which includes every instant on the end date (in the company timezone).
 */
export function inclusiveRangeToUtc(
  startKey: DateKey,
  endKey: DateKey,
  timeZone: string,
): { startUtc: string; endUtcExclusive: string } {
  const startUtc = zonedWallTimeToUtc(startKey, '00:00:00', timeZone);
  const endUtcExclusive = zonedWallTimeToUtc(addDaysToKey(endKey, 1), '00:00:00', timeZone);
  return { startUtc: startUtc.toISOString(), endUtcExclusive: endUtcExclusive.toISOString() };
}

/** Whole minutes between two instants (b - a), rounded. */
export function minutesBetween(a: Date | string, b: Date | string): number {
  const ta = (typeof a === 'string' ? new Date(a) : a).getTime();
  const tb = (typeof b === 'string' ? new Date(b) : b).getTime();
  return Math.round((tb - ta) / 60000);
}

/** Human duration: 495 -> "8h 15m", 45 -> "45m", 0 -> "0m". */
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h === 0) return `${mins}m`;
  if (mins === 0) return `${h}h`;
  return `${h}h ${mins}m`;
}

/** Decimal hours for exports/reports: 495 -> 8.25 */
export function minutesToHours(totalMinutes: number, dp = 2): number {
  return Number((Math.max(0, totalMinutes) / 60).toFixed(dp));
}

// ---------------------------------------------------------------------------
// Display formatting (always in the company timezone)
// ---------------------------------------------------------------------------

export function formatTime(instant: Date | string, timeZone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatDate(instant: Date | string, timeZone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(instant: Date | string, timeZone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** Pretty label for a week range: "Jun 9 – Jun 15, 2025". */
export function formatWeekLabel(weekStart: DateKey): string {
  const { weekEnd } = weekRange(weekStart);
  const s = new Date(`${weekStart}T00:00:00Z`);
  const e = new Date(`${weekEnd}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'UTC', month: 'short', day: 'numeric' };
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric' }).format(e);
  return `${new Intl.DateTimeFormat('en-US', opts).format(s)} – ${new Intl.DateTimeFormat('en-US', opts).format(e)}, ${year}`;
}

/** Current instant as an ISO string (UTC). Wrapped for easy test mocking. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** The current week's Monday DateKey in a given timezone. */
export function currentWeekStart(timeZone: string): DateKey {
  return weekRange(localDateKey(new Date(), timeZone)).weekStart;
}

/** A short list of common IANA timezones for the company setup form. */
export const COMMON_TIMEZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Australia/Sydney',
];

// --- <input type="datetime-local"> helpers (company-timezone aware) ---------

/**
 * Format a UTC instant as a `datetime-local` value ("YYYY-MM-DDTHH:mm") showing
 * the company-local wall-clock time, so owners edit times in the site's zone.
 */
export function toLocalInputValue(instant: Date | string, timeZone: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Convert a company-local `datetime-local` value back to a UTC ISO string. */
export function localInputToUtcIso(value: string, timeZone: string): string {
  const [datePart = '', timePart = '00:00'] = value.split('T');
  return zonedWallTimeToUtc(datePart, timePart, timeZone).toISOString();
}

/** Current company-local time as a `datetime-local` value. */
export function nowLocalInputValue(timeZone: string): string {
  return toLocalInputValue(new Date(), timeZone);
}

// --- Calendar helpers --------------------------------------------------------

/** Number of days in a given month (1-indexed month). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** First and last DateKey of a month. */
export function monthRange(year: number, month: number): { firstDay: DateKey; lastDay: DateKey } {
  const mm = String(month).padStart(2, '0');
  const firstDay: DateKey = `${year}-${mm}-01`;
  const lastDay: DateKey = `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  return { firstDay, lastDay };
}

/** Parse a DateKey into { year, month, day }. */
export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return { year: y, month: m, day: d };
}
