import prisma from "../db.server";
import { ORDER_BY_ID_QUERY } from "../graphql/orders";
import { computeOrderProductDayRows, type OrderNode, type OrderProductDayRow } from "./salesAggregator.server";

type GraphqlClient = { request: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<{ data?: unknown }> };

/** Upserts a set of rows, keyed by (shopDomain, orderId, productId). Idempotent. */
export async function upsertOrderProductDayRows(shopDomain: string, rows: OrderProductDayRow[]): Promise<void> {
  for (const row of rows) {
    await prisma.orderProductDay.upsert({
      where: {
        shopDomain_orderId_productId: {
          shopDomain,
          orderId: row.orderId,
          productId: row.productId,
        },
      },
      create: {
        shopDomain,
        orderId: row.orderId,
        productId: row.productId,
        day: row.day,
        grossUnits: row.grossUnits,
        refundedUnits: row.refundedUnits,
        netUnits: row.netUnits,
        cancelled: row.cancelled,
      },
      update: {
        grossUnits: row.grossUnits,
        refundedUnits: row.refundedUnits,
        netUnits: row.netUnits,
        cancelled: row.cancelled,
      },
    });
  }
}

/**
 * Re-fetches one order's authoritative state from the Admin API and upserts
 * its OrderProductDay rows. Used by every webhook handler (orders/paid,
 * orders/cancelled, orders/updated, refunds/create): rather than trying to
 * interpret each webhook payload's partial view, we always go back to the
 * source of truth (`currentQuantity`), which makes every handler idempotent
 * and correct regardless of delivery order or duplicate delivery.
 */
export async function refetchAndUpsertOrder(
  shopDomain: string,
  admin: GraphqlClient,
  orderGid: string,
  timeZone: string,
): Promise<OrderProductDayRow[]> {
  const response = await admin.request(ORDER_BY_ID_QUERY, { variables: { id: orderGid } });
  const data = response.data as { order: OrderNode | null } | undefined;
  const order = data?.order;
  if (!order) {
    // Order no longer accessible (e.g. fully deleted) — nothing to record.
    return [];
  }

  const rows = computeOrderProductDayRows(order, timeZone);
  await upsertOrderProductDayRows(shopDomain, rows);
  return rows;
}

export function orderGidFromLegacyId(legacyId: string | number): string {
  return `gid://shopify/Order/${legacyId}`;
}
