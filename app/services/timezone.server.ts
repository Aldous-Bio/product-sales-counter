/**
 * Timezone-aware day bucketing.
 *
 * We never rely on a strict rolling 30*24h window. Instead we bucket every
 * order into the shop-local *calendar day* it happened on (using
 * Shop.ianaTimezone) and treat "last 30 days" as the last 30 shop-local
 * calendar days, including today. This is what SalesAggregator +
 * OrderProductDay rely on. See ARCHITECTURE.md for the tradeoff vs. a
 * strict rolling window.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" */
export type DayKey = string;

function partsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** The shop-local calendar day (YYYY-MM-DD) that `instant` falls on. */
export function dayKeyInTimeZone(instant: Date, timeZone: string): DayKey {
  const { year, month, day } = partsInTimeZone(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The UTC instant corresponding to 00:00:00 local time on `dayKey` in
 * `timeZone`. Standard one-iteration convergence: guess UTC midnight for the
 * date, see what local wall-clock time that produces, and correct by the
 * difference. Only misbehaves within a DST-transition instant itself, which
 * is an acceptable approximation for a daily sales aggregate.
 */
export function localMidnightToUtc(dayKey: DayKey, timeZone: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const local = partsInTimeZone(guess, timeZone);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  const diff = guess.getTime() - localAsUtc;
  return new Date(guess.getTime() + diff);
}

export function addDaysToDayKey(dayKey: DayKey, days: number): DayKey {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

export interface SalesWindow {
  /** UTC instant marking the start of the window (inclusive). */
  startUtc: Date;
  /** UTC instant marking the end of the window (exclusive) — "now". */
  endUtc: Date;
  /** First shop-local day included in the window. */
  startDayKey: DayKey;
  /** Last shop-local day included in the window (today). */
  endDayKey: DayKey;
}

/**
 * The trailing `days`-day window (default 30), anchored to `now`, expressed
 * both as shop-local day keys (for querying/aggregating OrderProductDay) and
 * as UTC instants (for querying Shopify orders directly, e.g. during
 * backfill).
 */
export function trailingWindow(now: Date, timeZone: string, days = 30): SalesWindow {
  const endDayKey = dayKeyInTimeZone(now, timeZone);
  const startDayKey = addDaysToDayKey(endDayKey, -(days - 1));
  const startUtc = localMidnightToUtc(startDayKey, timeZone);
  return { startUtc, endUtc: now, startDayKey, endDayKey };
}
