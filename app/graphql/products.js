/**
 * Product list for the admin "Productos" page (Admin API 2026-07). Read-only;
 * `read_products` is already required by LineItem.product. `featuredMedia`
 * replaces the deprecated `featuredImage`.
 */
export const PRODUCTS_PAGE_QUERY = /* GraphQL */ `
  query ProductsPage($cursor: String) {
    products(first: 250, after: $cursor, sortKey: TITLE) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        status
        featuredMedia {
          preview {
            image {
              url(transform: { maxWidth: 80, maxHeight: 80 })
              altText
            }
          }
        }
      }
    }
  }
`;
