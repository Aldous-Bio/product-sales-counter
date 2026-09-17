import { dayKeyInTimeZone, localMidnightToUtc } from "./timezone.server";

/** Order financial statuses we consider "paid or valid for sale". */
const VALID_FINANCIAL_STATUSES = new Set(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);

/**
 * Turns one order's GraphQL state (`{ id, createdAt, cancelledAt,
 * displayFinancialStatus, lineItems: { nodes: [{ quantity, currentQuantity,
 * isGiftCard, product }] } }`) into the set of OrderProductDay rows it
 * should produce, aggregating all line items of the same product (e.g.
 * several variants of one product in the same order).
 *
 * - Cancelled orders and orders that never reached a valid financial status
 *   still produce rows (so a previously-counted order gets zeroed out
 *   instead of leaving a stale nonzero row behind), but with all
 *   quantities forced to 0 and `cancelled: true`.
 * - Line items with no product (custom items) or that are gift cards are
 *   skipped entirely.
 */
export function computeOrderProductDayRows(order, timeZone) {
  const isCancelled = order.cancelledAt !== null;
  const isValidSale = !isCancelled && VALID_FINANCIAL_STATUSES.has(order.displayFinancialStatus ?? "");

  const dayKey = dayKeyInTimeZone(new Date(order.createdAt), timeZone);
  const day = localMidnightToUtc(dayKey, timeZone);

  const totals = new Map();

  for (const lineItem of order.lineItems.nodes) {
    if (!lineItem.product || lineItem.isGiftCard) continue;

    const productId = lineItem.product.id;
    const current = totals.get(productId) ?? { gross: 0, net: 0 };
    current.gross += isValidSale ? lineItem.quantity : 0;
    current.net += isValidSale ? lineItem.currentQuantity : 0;
    totals.set(productId, current);
  }

  return Array.from(totals.entries()).map(([productId, { gross, net }]) => ({
    orderId: order.id,
    productId,
    day,
    dayKey,
    grossUnits: gross,
    refundedUnits: gross - net,
    netUnits: net,
    cancelled: isCancelled,
  }));
}

/** Sum of net units across the rows already restricted to a product + window. */
export function sumNetUnits(rows) {
  return rows.reduce((total, row) => total + row.netUnits, 0);
}
