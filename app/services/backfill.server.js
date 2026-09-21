import prisma from "../db.server";
import { PAGINATED_ORDERS_QUERY, buildOrdersSearchQuery } from "../graphql/orders";
import { computeOrderProductDayRows } from "./salesAggregator.server";
import { upsertOrderProductDayRows } from "./orderSync.server";
import { trailingWindow } from "./timezone.server";

/**
 * The Admin API client wraps GraphQL-level errors (bad field, missing
 * scope, etc.) in a generic "review graphQLErrors for details" message —
 * pull the actual reason out so it's useful in Shop.backfillError /
 * lastSyncError instead of that boilerplate.
 */
export function describeError(error) {
  const graphQLErrors = error?.response?.errors?.graphQLErrors;
  if (Array.isArray(graphQLErrors) && graphQLErrors.length > 0) {
    return graphQLErrors.map((e) => e.message).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

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
  const window = trailingWindow(new Date(), timeZone, options.windowDays);
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
    await syncTrailingWindow(shopDomain, admin, timeZone, {
      resumeCursor: shop?.backfillCursor,
      windowDays: shop?.windowDays,
    });
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
        backfillError: describeError(error),
      },
    });
    throw error;
  }
}

export async function runReconciliation(shopDomain, admin, timeZone) {
  try {
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    await syncTrailingWindow(shopDomain, admin, timeZone, { windowDays: shop?.windowDays });
    const clearStaleBackfillFailure =
      shop?.backfillStatus === "pending" || shop?.backfillStatus === "failed";
    await prisma.shop.update({
      where: { shopDomain },
      data: {
        lastReconciledAt: new Date(),
        lastSyncError: null,
        ...(clearStaleBackfillFailure
          ? { backfillStatus: "completed", backfillError: null, backfillCompletedAt: new Date() }
          : {}),
      },
    });
  } catch (error) {
    await prisma.shop.update({
      where: { shopDomain },
      data: { lastSyncError: describeError(error) },
    });
    throw error;
  }
}
