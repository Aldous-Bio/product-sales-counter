import { describe, expect, it } from "vitest";
import { normalizeProductId } from "./productId";
import { addDaysToDayKey, dayKeyInTimeZone, localMidnightToUtc, trailingWindow } from "./timezone.server";

describe("normalizeProductId", () => {
  it("accepts a bare numeric id and turns it into a GID", () => {
    expect(normalizeProductId("123456")).toBe("gid://shopify/Product/123456");
  });

  it("passes a full GID through unchanged", () => {
    expect(normalizeProductId("gid://shopify/Product/123456")).toBe("gid://shopify/Product/123456");
  });

  it("rejects garbage input, e.g. from a different resource or a nonexistent product", () => {
    expect(normalizeProductId("not-a-product-id")).toBeNull();
    expect(normalizeProductId("gid://shopify/Customer/1")).toBeNull();
    expect(normalizeProductId("")).toBeNull();
  });
});

describe("30-day window boundary", () => {
  it("includes an order exactly 30 shop-local days ago and excludes one 31 days ago", () => {
    const tz = "UTC";
    const now = new Date("2026-06-30T12:00:00Z");
    const window = trailingWindow(now, tz, 30);
    const startOfWindow = localMidnightToUtc(window.startDayKey, tz);
    const startOfDayAfterWindow = localMidnightToUtc(addDaysToDayKey(window.endDayKey, 1), tz);

    const orderExactlyOnBoundary = localMidnightToUtc(addDaysToDayKey(dayKeyInTimeZone(now, tz), -29), tz);
    const orderOneDayBeforeBoundary = localMidnightToUtc(addDaysToDayKey(dayKeyInTimeZone(now, tz), -30), tz);

    expect(orderExactlyOnBoundary >= startOfWindow && orderExactlyOnBoundary < startOfDayAfterWindow).toBe(true);
    expect(orderOneDayBeforeBoundary >= startOfWindow && orderOneDayBeforeBoundary < startOfDayAfterWindow).toBe(
      false,
    );
  });
});
