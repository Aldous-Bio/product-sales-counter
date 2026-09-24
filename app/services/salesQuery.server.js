import prisma from "../db.server";
import { sumNetUnits } from "./salesAggregator.server";
import { addDaysToDayKey, localMidnightToUtc, trailingWindow } from "./timezone.server";

export { normalizeProductId } from "./productId";

/**
 * `day` filter for the trailing window. Rows store `day` as the UTC instant
 * of shop-local midnight, so the bounds must be computed the same way
 * rather than assuming UTC.
 */
function windowDayFilter(ianaTimezone, periodDays) {
  const window = trailingWindow(new Date(), ianaTimezone, periodDays);
  return {
    gte: localMidnightToUtc(window.startDayKey, ianaTimezone),
    lt: localMidnightToUtc(addDaysToDayKey(window.endDayKey, 1), ianaTimezone),
  };
}

export async function getUnitsSoldInTrailingWindow(
  shopDomain,
  productId,
  ianaTimezone,
  periodDays = 30
) {
  const [rows, setting] = await Promise.all([
    prisma.orderProductDay.findMany({
      where: {
        shopDomain,
        productId,
        cancelled: false,
        day: windowDayFilter(ianaTimezone, periodDays),
      },
      select: {
        netUnits: true,
      },
    }),

    prisma.productDisplaySetting.findFirst({
      where: {
        shopDomain,
        productId,
      },
      select: {
        previewUnits: true,
      },
    }),
  ]);

  return {
    unitsSold: Math.max(0, sumNetUnits(rows)),
    previewUnits: setting?.previewUnits ?? null,
    periodDays,
  };
}

/** Same metric as getUnitsSoldInTrailingWindow, for every product of the shop at once (admin table). */
export async function getUnitsSoldByProduct(shopDomain, ianaTimezone, periodDays = 30) {
  const groups = await prisma.orderProductDay.groupBy({
    by: ["productId"],
    where: { shopDomain, cancelled: false, day: windowDayFilter(ianaTimezone, periodDays) },
    _sum: { netUnits: true },
  });

  return new Map(groups.map((group) => [group.productId, Math.max(0, group._sum.netUnits ?? 0)]));
}
