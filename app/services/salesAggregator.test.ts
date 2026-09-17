import { describe, expect, it } from "vitest";
import { computeOrderProductDayRows, sumNetUnits, type OrderNode } from "./salesAggregator.server";

const TZ = "UTC";
const PRODUCT_A = "gid://shopify/Product/1";
const PRODUCT_B = "gid://shopify/Product/2";

function order(overrides: Partial<OrderNode>): OrderNode {
  return {
    id: "gid://shopify/Order/1",
    createdAt: "2026-06-15T10:00:00Z",
    cancelledAt: null,
    displayFinancialStatus: "PAID",
    lineItems: { nodes: [] },
    ...overrides,
  };
}

describe("computeOrderProductDayRows", () => {
  it("counts a single variant of one product", () => {
    const rows = computeOrderProductDayRows(
      order({
        lineItems: {
          nodes: [{ quantity: 3, currentQuantity: 3, isGiftCard: false, product: { id: PRODUCT_A } }],
        },
      }),
      TZ,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productId: PRODUCT_A, grossUnits: 3, refundedUnits: 0, netUnits: 3 });
  });

  it("aggregates several variants of the same product into one row", () => {
    const rows = computeOrderProductDayRows(
      order({
        lineItems: {
          nodes: [
            { quantity: 2, currentQuantity: 2, isGiftCard: false, product: { id: PRODUCT_A } },
            { quantity: 5, currentQuantity: 5, isGiftCard: false, product: { id: PRODUCT_A } },
          ],
        },
      }),
      TZ,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].grossUnits).toBe(7);
    expect(rows[0].netUnits).toBe(7);
  });

  it("keeps different products as separate rows", () => {
    const rows = computeOrderProductDayRows(
      order({
        lineItems: {
          nodes: [
            { quantity: 2, currentQuantity: 2, isGiftCard: false, product: { id: PRODUCT_A } },
            { quantity: 1, currentQuantity: 1, isGiftCard: false, product: { id: PRODUCT_B } },
          ],
        },
      }),
      TZ,
    );
    expect(rows.map((r) => r.productId).sort()).toEqual([PRODUCT_A, PRODUCT_B]);
  });

  it("excludes cancelled orders entirely (zeroed, flagged cancelled)", () => {
    const rows = computeOrderProductDayRows(
      order({
        cancelledAt: "2026-06-16T00:00:00Z",
        lineItems: { nodes: [{ quantity: 4, currentQuantity: 4, isGiftCard: false, product: { id: PRODUCT_A } }] },
      }),
      TZ,
    );
    expect(rows[0]).toMatchObject({ grossUnits: 0, netUnits: 0, refundedUnits: 0, cancelled: true });
  });

  it("excludes orders that never reached a valid financial status", () => {
    const rows = computeOrderProductDayRows(
      order({
        displayFinancialStatus: "PENDING",
        lineItems: { nodes: [{ quantity: 4, currentQuantity: 4, isGiftCard: false, product: { id: PRODUCT_A } }] },
      }),
      TZ,
    );
    expect(rows[0]).toMatchObject({ grossUnits: 0, netUnits: 0 });
  });

  it("applies a partial refund via currentQuantity", () => {
    const rows = computeOrderProductDayRows(
      order({
        displayFinancialStatus: "PARTIALLY_REFUNDED",
        lineItems: { nodes: [{ quantity: 10, currentQuantity: 6, isGiftCard: false, product: { id: PRODUCT_A } }] },
      }),
      TZ,
    );
    expect(rows[0]).toMatchObject({ grossUnits: 10, refundedUnits: 4, netUnits: 6 });
  });

  it("zeroes out a fully refunded order", () => {
    const rows = computeOrderProductDayRows(
      order({
        displayFinancialStatus: "REFUNDED",
        lineItems: { nodes: [{ quantity: 10, currentQuantity: 0, isGiftCard: false, product: { id: PRODUCT_A } }] },
      }),
      TZ,
    );
    expect(rows[0]).toMatchObject({ grossUnits: 10, refundedUnits: 10, netUnits: 0 });
  });

  it("ignores line items without a product (custom items)", () => {
    const rows = computeOrderProductDayRows(
      order({ lineItems: { nodes: [{ quantity: 1, currentQuantity: 1, isGiftCard: false, product: null }] } }),
      TZ,
    );
    expect(rows).toHaveLength(0);
  });

  it("ignores gift card line items", () => {
    const rows = computeOrderProductDayRows(
      order({
        lineItems: { nodes: [{ quantity: 1, currentQuantity: 1, isGiftCard: true, product: { id: PRODUCT_A } }] },
      }),
      TZ,
    );
    expect(rows).toHaveLength(0);
  });

  it("buckets the order into the shop-local day it was created on", () => {
    // 23:00 UTC on the 15th is already the 16th in Tokyo (UTC+9).
    const rows = computeOrderProductDayRows(
      order({
        createdAt: "2026-06-15T23:00:00Z",
        lineItems: { nodes: [{ quantity: 1, currentQuantity: 1, isGiftCard: false, product: { id: PRODUCT_A } }] },
      }),
      "Asia/Tokyo",
    );
    expect(rows[0].dayKey).toBe("2026-06-16");
  });

  it("re-running the same order produces identical rows (idempotent by construction)", () => {
    const theOrder = order({
      lineItems: { nodes: [{ quantity: 5, currentQuantity: 3, isGiftCard: false, product: { id: PRODUCT_A } }] },
    });
    const first = computeOrderProductDayRows(theOrder, TZ);
    const second = computeOrderProductDayRows(theOrder, TZ);
    expect(second).toEqual(first);
  });
});

describe("sumNetUnits", () => {
  it("sums multiple orders/products without inflation from cancelled/refunded rows", () => {
    const totalA = sumNetUnits([{ netUnits: 4 }, { netUnits: 6 }]);
    expect(totalA).toBe(10);
    const totalNone = sumNetUnits([]);
    expect(totalNone).toBe(0);
  });
});
