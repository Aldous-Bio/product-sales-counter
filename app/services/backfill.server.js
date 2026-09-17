import prisma from "../db.server";
import { PAGINATED_ORDERS_QUERY, buildOrdersSearchQuery } from "../graphql/orders";
import { computeOrderProductDayRows } from "./salesAggregator.server";
import { upsertOrderProductDayRows } from "./orderSync.server";
import { trailingWindow } from "./timezone.server";

/**
 * Walks every order in the trailing 30-day window and upserts its
 * OrderProductDay rows. Used both for the initial backfill on install and
 * for periodic/manual reconciliation — the only difference is bookkeeping
 * (Shop.backfillStatus vs Shop.lastReconciledAt).
 *
 * Resumable: the cursor of the last successfully processed page is
 * persisted on Shop.backfillCursor after every page, so a crash/restart
 * mid-run can continue instead of restarting from scratch.
 */
export async function syncTrailingWindow(shopDomain, admin, timeZone, options = {}) {
  const window = trailingWindow(new Date(), timeZone);
  const searchQuery = buildOrdersSearchQuery(window.startUtc.toISOString(), window.endUtc.toISOString());

  let cursor = options.resumeCursor ?? null;
  let ordersProcessed = 0;

  for (;;) {
    const response = await admin.request(PAGINATED_ORDERS_QUERY, {
      variables: { searchQuery, cursor },
    });
    const data = response.data;
    if (!data) break;

    for (const order of data.orders.nodes) {
      const rows = computeOrderProductDayRows(order, timeZone);
      await upsertOrderProductDayRows(shopDomain, rows);
      ordersProcessed += 1;
    }

    cursor = data.orders.pageInfo.endCursor;
    await prisma.shop.update({ where: { shopDomain }, data: { backfillCursor: cursor } });

    if (!data.orders.pageInfo.hasNextPage) break;
  }

  return { ordersProcessed };
}

export async function runInitialBackfill(shopDomain, admin, timeZone) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });

  await prisma.shop.update({
    where: { shopDomain },
    data: { backfillStatus: "running", backfillStartedAt: new Date(), backfillError: null },
  });

  try {
    await syncTrailingWindow(shopDomain, admin, timeZone, { resumeCursor: shop?.backfillCursor });
    await prisma.shop.update({
      where: { shopDomain },
      data: {
        backfillStatus: "completed",
        backfillCompletedAt: new Date(),
        backfillCursor: null,
        lastReconciledAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.shop.update({
      where: { shopDomain },
      data: {
        backfillStatus: "failed",
        backfillError: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function runReconciliation(shopDomain, admin, timeZone) {
  try {
    await syncTrailingWindow(shopDomain, admin, timeZone);
    await prisma.shop.update({
      where: { shopDomain },
      data: { lastReconciledAt: new Date(), lastSyncError: null },
    });
  } catch (error) {
    await prisma.shop.update({
      where: { shopDomain },
      data: { lastSyncError: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
