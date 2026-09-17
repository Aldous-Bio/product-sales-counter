import { describe, expect, it } from "vitest";
import { addDaysToDayKey, dayKeyInTimeZone, localMidnightToUtc, trailingWindow } from "./timezone.server";

describe("dayKeyInTimeZone", () => {
  it("buckets a UTC instant into the shop-local calendar day", () => {
    // 2026-03-01T02:00:00Z is still Feb 28 in America/Los_Angeles (UTC-8 in March before DST... actually PST is UTC-8)
    const instant = new Date("2026-03-01T02:00:00Z");
    expect(dayKeyInTimeZone(instant, "America/Los_Angeles")).toBe("2026-02-28");
    expect(dayKeyInTimeZone(instant, "UTC")).toBe("2026-03-01");
  });

  it("handles a timezone ahead of UTC rolling into the next day", () => {
    // Madrid is UTC+1 in early March (before the DST switch), so 23:30 UTC is already 00:30 the next day locally.
    const instant = new Date("2026-03-01T23:30:00Z");
    expect(dayKeyInTimeZone(instant, "Europe/Madrid")).toBe("2026-03-02");
  });
});

describe("localMidnightToUtc / dayKeyInTimeZone round-trip", () => {
  it("converts local midnight to UTC and back to the same day key", () => {
    for (const tz of ["UTC", "America/Los_Angeles", "Europe/Madrid", "Pacific/Kiritimati", "Asia/Tokyo"]) {
      const utcMidnight = localMidnightToUtc("2026-06-15", tz);
      expect(dayKeyInTimeZone(utcMidnight, tz)).toBe("2026-06-15");
    }
  });
});

describe("addDaysToDayKey", () => {
  it("moves across month/year boundaries", () => {
    expect(addDaysToDayKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToDayKey("2026-02-28", 1)).toBe("2026-03-01"); // 2026 is not a leap year
  });
});

describe("trailingWindow", () => {
  it("covers exactly 30 shop-local calendar days including today", () => {
    const now = new Date("2026-06-30T12:00:00Z");
    const window = trailingWindow(now, "UTC", 30);
    expect(window.endDayKey).toBe("2026-06-30");
    expect(window.startDayKey).toBe("2026-06-01");
  });

  it("uses the shop's own timezone to determine 'today', not UTC", () => {
    // 23:30 UTC on Jan 1 is already Jan 2 in Tokyo (UTC+9).
    const now = new Date("2026-01-01T23:30:00Z");
    const window = trailingWindow(now, "Asia/Tokyo", 30);
    expect(window.endDayKey).toBe("2026-01-02");
  });
});
