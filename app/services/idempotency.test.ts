import { describe, expect, it } from "vitest";
import { computeOrderProductDayRows, sumNetUnits, type OrderNode } from "./salesAggregator.server";

/**
 * Mirrors orderSync.server.ts's upsert keyed on (shopDomain, orderId,
 * productId), without a real database, to prove that replaying the same
 * webhook (or re-running reconciliation) never double-counts.
 */
class FakeOrderProductDayStore {
  private rows = new Map<string, { netUnits: number }>();

  upsert(shopDomain: string, row: { orderId: string; productId: string; netUnits: number }) {
    this.rows.set(`${shopDomain}|${row.orderId}|${row.productId}`, { netUnits: row.netUnits });
  }

  totalNetUnitsFor(shopDomain: string, productId: string): number {
    return sumNetUnits(
      Array.from(this.rows.entries())
        .filter(([key]) => {
          const [s, , p] = key.split("|");
          return s === shopDomain && p === productId;
        })
        .map(([, value]) => value),
    );
  }
}

const PRODUCT_A = "gid://shopify/Product/1";

function paidOrder(quantity: number): OrderNode {
  return {
    id: "gid://shopify/Order/1",
    createdAt: "2026-06-15T10:00:00Z",
    cancelledAt: null,
    displayFinancialStatus: "PAID",
    lineItems: { nodes: [{ quantity, currentQuantity: quantity, isGiftCard: false, product: { id: PRODUCT_A } }] },
  };
}

describe("webhook redelivery idempotency", () => {
  it("processing the same orders/paid webhook twice does not double the total", () => {
    const store = new FakeOrderProductDayStore();
    const order = paidOrder(5);

    for (const row of computeOrderProductDayRows(order, "UTC")) {
      store.upsert("shop.myshopify.com", row);
    }
    // Shopify redelivers the same webhook (at-least-once delivery).
    for (const row of computeOrderProductDayRows(order, "UTC")) {
      store.upsert("shop.myshopify.com", row);
    }

    expect(store.totalNetUnitsFor("shop.myshopify.com", PRODUCT_A)).toBe(5);
  });

  it("a later refund overwrites (not adds to) the order's row", () => {
    const store = new FakeOrderProductDayStore();

    for (const row of computeOrderProductDayRows(paidOrder(10), "UTC")) {
      store.upsert("shop.myshopify.com", row);
    }
    expect(store.totalNetUnitsFor("shop.myshopify.com", PRODUCT_A)).toBe(10);

    const partiallyRefunded: OrderNode = {
      id: "gid://shopify/Order/1",
      createdAt: "2026-06-15T10:00:00Z",
      cancelledAt: null,
      displayFinancialStatus: "PARTIALLY_REFUNDED",
      lineItems: { nodes: [{ quantity: 10, currentQuantity: 6, isGiftCard: false, product: { id: PRODUCT_A } }] },
    };
    for (const row of computeOrderProductDayRows(partiallyRefunded, "UTC")) {
      store.upsert("shop.myshopify.com", row);
    }

    expect(store.totalNetUnitsFor("shop.myshopify.com", PRODUCT_A)).toBe(6);

    // The refund webhook is redelivered — still 6, not 6 minus another refund.
    for (const row of computeOrderProductDayRows(partiallyRefunded, "UTC")) {
      store.upsert("shop.myshopify.com", row);
    }
    expect(store.totalNetUnitsFor("shop.myshopify.com", PRODUCT_A)).toBe(6);
  });
});
