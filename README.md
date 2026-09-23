# Product sales counter

Shows "N units sold in the last 30 days" on the storefront product page, for
any shop that installs the app. Multi-tenant: no shop, product, or currency
IDs are hardcoded anywhere.

## Architecture

```
Admin GraphQL API (orders/refunds, read-only)
        │
        ▼
Remix backend (this repo, app/)
  - webhooks: orders/paid, orders/cancelled, orders/updated, refunds/create
  - backfill + periodic reconciliation (last 30 days)
  - Prisma: OrderProductDay (per shop, per order, per product, per day)
        │
        ▼  App Proxy (HMAC-verified, /apps/sold-count)
Theme App Extension (extensions/product-sales-counter/)
  - app block on the product template
  - fetches the pre-computed count, renders the localized text
```

Liquid never queries sales data directly (it can't) — the block only passes
`product.id` + `request.locale` to a small JS file, which asks the app's
backend via App Proxy. See the comments at the top of each
`app/services/*.server.js` file for the reasoning behind each design choice
(timezone bucketing, idempotency key, why `currentQuantity` is used instead
of manually replaying refunds, etc).

Plain JavaScript throughout (no TypeScript), to match the rest of this
org's apps.

Key files:

| Concern | File |
|---|---|
| Timezone/day bucketing | `app/services/timezone.server.js` |
| Sales calculation (pure, tested) | `app/services/salesAggregator.server.js` |
| Idempotent DB writes | `app/services/orderSync.server.js` |
| Backfill + reconciliation | `app/services/backfill.server.js` |
| Window query for the proxy endpoint | `app/services/salesQuery.server.js` |
| i18n / pluralization / number formatting | `app/i18n/messages.js` |
| Webhooks | `app/routes/webhooks.*.jsx` |
| App Proxy endpoint | `app/routes/proxy.sold-count.jsx` |
| Admin dashboard | `app/routes/app._index.jsx` |
| Theme App Extension | `extensions/product-sales-counter/` |

## Data model (`prisma/schema.prisma`)

- `Shop` — one row per installed shop: timezone, backfill/reconciliation
  status, the "hide when zero" default and the trailing window length.
- `ProductDisplaySetting` — per-product overrides from the admin
  "Productos" page (`app/routes/app.products.jsx`): `hidden` (never show the
  counter; sales are still synced, the proxy answers `{ hidden: true }`)
  and `previewUnits` (a test figure used **only** inside the theme editor,
  via `request.design_mode`; shoppers always see real sales). Only products
  that differ from the defaults have a row.
- `OrderProductDay` — one row per **(shop, order, product)**, tagged with
  the shop-local calendar day the order was created on, storing
  `grossUnits` / `refundedUnits` / `netUnits`. The unique constraint on
  `(shopDomain, orderId, productId)` is the idempotency key: every write
  (webhook, backfill, or reconciliation) re-derives the row from the
  order's current GraphQL state (`quantity` / `currentQuantity`) and
  upserts, so replayed webhooks or repeated reconciliation passes overwrite
  rather than double-count. The "units sold in the last 30 days" figure is
  just `SUM(netUnits)` over the last 30 shop-local days for a product.

**Why per-order-per-day rows instead of a single running total per
product?** A single total would need something to *expire* old orders out
of it after 30 days, can't be recomputed/audited, and any double-delivered
or out-of-order webhook risks permanent drift. Per-order rows are naturally
idempotent (upsert, not increment), self-healing (reconciliation just
re-derives and overwrites), and auditable (you can see exactly which order
contributed what). The cost is more rows, which is fine at this scale and
is trivially indexed (`shopDomain, productId, day`).

No customer-identifying data is ever stored — only shop domain, product ID,
and quantities.

## Sales metric definition

- Window: trailing 30 **shop-local calendar days**, including today
  (`Shop.ianaTimezone`, converted to UTC for querying Shopify).
- Included: orders with `displayFinancialStatus` of `PAID`,
  `PARTIALLY_REFUNDED`, or `REFUNDED`.
- Excluded: cancelled orders (`cancelledAt != null`), gift card line items,
  line items with no `product` (custom items).
- Refunds/returns: handled via `LineItem.currentQuantity`, which the Admin
  API already reports net of refunds/removals — no manual refund-line-item
  bookkeeping needed.
- Variants: all variants of the same product in the same order are summed
  into one row.
- Result: a non-negative integer.

## Requirements

- Node.js ≥ 18.20
- A Shopify Partner account and a development store
- The [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) (`npm i -g @shopify/cli` or use `npx shopify`)
- A Postgres database (a local one for dev, e.g. via Docker, and a managed one in production)

## Setup

```shell
npm install
cp .env.example .env   # fill in DATABASE_URL / RECONCILE_SECRET; SHOPIFY_* are set by `shopify app dev`
npm run setup          # prisma generate + prisma db push (creates the tables in DATABASE_URL)
```

> **Note on `app_proxy.url`:** `shopify.app.toml`'s `application_url` is
> kept in sync with your dev tunnel automatically, but double-check the
> `[app_proxy]` `url` after linking the app config (`shopify app config
> link`) — it must point at `<your app url>/proxy/sold-count` exactly, with
> no trailing path, since a request to `/apps/sold-count` (no extra
> segments) is forwarded to `url` verbatim.

## Running locally

```shell
npm run dev
```

This first starts a local Postgres with `prisma dev` (no Docker needed;
stop it with `npm run dev:db:stop`) and syncs the schema, so `.env` needs
`DATABASE_URL="postgres://postgres:postgres@localhost:51214/template1?sslmode=disable&connection_limit=1&pgbouncer=true"`
(`pgbouncer=true` stops Prisma from using prepared statements, which
`prisma dev` can't isolate between connections: without it the second
`db push` fails with `prepared statement "s0" already exists`).
Then it runs `shopify app dev`, which tunnels your local server, updates the
app's URLs, and prints an install link. Open it, install the app on your
dev store — this triggers the initial 30-day backfill automatically (see
`hooks.afterAuth` in `app/shopify.server.js`).

## Installing on a development store

1. `npm run dev` and follow the printed install URL (or `npm run deploy`
   then install from your Partner Dashboard for a persistent install).
2. Approve the `read_orders` and `read_products` scopes (the latter is
   needed because `LineItem.product` requires it, even though we never
   otherwise touch product data).
3. The app dashboard (`/app`) shows connection status and backfill
   progress — refresh until `backfillStatus` is `completed`.
4. In the store admin, go to **Online Store → Themes → Customize**, open a
   product page, **Add block → Apps → Product sales counter**. The app
   never touches the theme automatically — you add the block explicitly.

## Manually checking the calculation

- Place a test order and mark it paid (or use a test-mode payment).
- Visit the product page: the block should show "1 unit sold in the last
  30 days" (or "1 unidad vendida..." depending on `request.locale`) within
  a few seconds of the `orders/paid` webhook arriving.
- To force a full re-sync instead of waiting on webhooks, use the "Run
  reconciliation now" button on the app dashboard, or call
  `POST /api/reconcile` with header `x-reconcile-secret: $RECONCILE_SECRET`.
- Refund the order (fully or partially) and confirm the count decreases
  after the `refunds/create` webhook / next reconciliation.

## Periodic reconciliation

`POST /api/reconcile` (header `x-reconcile-secret`) re-syncs every
installed shop's trailing 30-day window. Point an external scheduler at it
— e.g. a cron job, Cloud Scheduler, or a scheduled GitHub Action:

```shell
curl -X POST https://<your-app-url>/api/reconcile \
  -H "x-reconcile-secret: $RECONCILE_SECRET"
```

Run it every 15–60 minutes; it's cheap (bounded to the last 30 days) and
fully idempotent.

## Tests

```shell
npm test        # vitest, 34 tests covering the calculation/timezone/i18n/idempotency/proxy-auth logic
npm run lint
```

Covered: single/multiple variants, multiple orders, cancellations, partial
and full refunds, the 30-day boundary, timezone→UTC conversion, products
with no sales, multiple shop locales, es/en pluralization, webhook replay
(no double-counting), unauthenticated/cross-shop/nonexistent-product
requests to the App Proxy endpoint.

## Differences from Shopify's own Analytics

- Analytics' "day" boundary logic and exact inclusion rules for exchanges,
  draft orders, POS, etc. aren't publicly documented field-for-field; this
  app's rules (above) are a close, explicit approximation, not a
  byte-for-byte match.
- This app buckets by shop-local **calendar day** rather than a strict
  rolling 30×24h window — a purchase from 29 days and 23 hours ago and one
  from 30 days and 1 hour ago can fall on the same side of the boundary
  differently than a strict rolling clock would. See "Sales metric
  definition" above.
- Exchanges/returns created through the newer `Return` object are reflected
  here only insofar as they affect `LineItem.currentQuantity` — order
  edits that swap products are treated as this app sees the order at query
  time, not as a full history of what changed.
