/**
 * Shared GraphQL against the Admin API (2026-07, stable). We only ever read
 * orders — never write. `currentQuantity` already excludes refunded and
 * removed units, so we don't need to separately walk Refund objects to get
 * a net figure: gross = quantity, net = currentQuantity,
 * refunded = quantity - currentQuantity.
 */

export const ORDER_FIELDS = /* GraphQL */ `
  id
  createdAt
  cancelledAt
  displayFinancialStatus
  lineItems(first: 250) {
    nodes {
      quantity
      currentQuantity
      isGiftCard
      product {
        id
      }
    }
  }
`;

/** Used for a one-off webhook-triggered refetch of a single order. */
export const ORDER_BY_ID_QUERY = /* GraphQL */ `
  query OrderById($id: ID!) {
    order(id: $id) {
      ${ORDER_FIELDS}
    }
  }
`;

/**
 * Used inside a bulk operation for the initial backfill and for periodic
 * reconciliation. `query:` uses the same search syntax as the orders list
 * REST search did; bulk operations paginate this connection automatically.
 */
export const BULK_ORDERS_QUERY = /* GraphQL */ `
  {
    orders(query: "created_at:>='%SINCE%' AND created_at:<='%UNTIL%'") {
      edges {
        node {
          ${ORDER_FIELDS}
        }
      }
    }
  }
`;

export function buildBulkOrdersQuery(sinceIso, untilIso) {
  return BULK_ORDERS_QUERY.replace("%SINCE%", sinceIso).replace("%UNTIL%", untilIso);
}

/**
 * Plain cursor-paginated equivalent of the bulk query above, used for the
 * initial backfill and for periodic reconciliation. At ~30 days of orders
 * per shop this is simple and reliable; a very high-volume shop could swap
 * this for `bulkOperationRunQuery` with `BULK_ORDERS_QUERY` without changing
 * anything downstream, since both feed the same `computeOrderProductDayRows`.
 */
export const PAGINATED_ORDERS_QUERY = /* GraphQL */ `
  query BackfillOrders($searchQuery: String!, $cursor: String) {
    orders(first: 100, after: $cursor, query: $searchQuery, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${ORDER_FIELDS}
      }
    }
  }
`;

export function buildOrdersSearchQuery(sinceIso, untilIso) {
  return `created_at:>='${sinceIso}' AND created_at:<='${untilIso}'`;
}

export const SHOP_QUERY = /* GraphQL */ `
  query ShopInfo {
    shop {
      myshopifyDomain
      ianaTimezone
    }
  }
`;
