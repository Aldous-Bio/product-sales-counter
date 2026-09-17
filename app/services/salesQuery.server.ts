import prisma from "../db.server";
import { sumNetUnits } from "./salesAggregator.server";
import { addDaysToDayKey, localMidnightToUtc, trailingWindow } from "./timezone.server";

export { normalizeProductId } from "./productId";

export async function getUnitsSoldTrailing30Days(
  shopDomain: string,
  productId: string,
  ianaTimezone: string,
): Promise<{ unitsSold: number; periodDays: number }> {
  const periodDays = 30;
  const window = trailingWindow(new Date(), ianaTimezone, periodDays);
  // Rows store `day` as the UTC instant of shop-local midnight, so the
  // window bounds must be computed the same way rather than assuming UTC.
  const startOfWindow = localMidnightToUtc(window.startDayKey, ianaTimezone);
  const startOfDayAfterWindow = localMidnightToUtc(addDaysToDayKey(window.endDayKey, 1), ianaTimezone);

  const rows = await prisma.orderProductDay.findMany({
    where: {
      shopDomain,
      productId,
      cancelled: false,
      day: { gte: startOfWindow, lt: startOfDayAfterWindow },
    },
    select: { netUnits: true },
  });

  return { unitsSold: Math.max(0, sumNetUnits(rows)), periodDays };
}
