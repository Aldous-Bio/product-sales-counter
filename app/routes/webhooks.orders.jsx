import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { refetchAndUpsertOrder } from "../services/orderSync.server";
import { describeError } from "../services/backfill.server";

/**
 * Handles orders/paid, orders/cancelled and orders/updated (all mapped to
 * this one URI in shopify.app.toml). Whatever the topic, we re-fetch the
 * order's current GraphQL state and upsert — see orderSync.server.js for
 * why that's both simpler and safely idempotent across retries/duplicates.
 */
export const action = async ({ request }) => {
  const { shop, topic, webhookId, payload } = await authenticate.webhook(request);
  // Logged so a delivery Shopify reports as failed can be matched by its
  // X-Shopify-Webhook-Id (did it reach us at all, or was the response lost?).
  console.log(`[webhooks/orders] ${topic} ${shop} webhookId=${webhookId}`);

  const orderGid = payload.admin_graphql_api_id;
  if (!orderGid) {
    console.warn(`[webhooks/orders] ${topic} for ${shop} missing admin_graphql_api_id`);
    return new Response();
  }

  const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
  if (!shopRecord) {
    console.warn(`[webhooks/orders] ${topic} received for unknown shop ${shop}`);
    return new Response();
  }

  // Ack right away and sync in the background: Shopify only waits a few
  // seconds for a response, and the Admin API round-trip + upserts can take
  // longer than that under load (many orders at once, GraphQL throttling).
  // Sync failures were already swallowed (always 200), so this doesn't give
  // up any retry Shopify would have made; reconciliation fixes any drift.
  syncOrder(shop, topic, orderGid, shopRecord.ianaTimezone);

  return new Response();
};

async function syncOrder(shop, topic, orderGid, timeZone) {
  try {
    const { admin } = await unauthenticated.admin(shop);
    await refetchAndUpsertOrder(
      shop,
      { request: (q, o) => admin.graphql(q, o).then((r) => r.json()) },
      orderGid,
      timeZone,
    );
  } catch (error) {
    console.error(`[webhooks/orders] ${topic} failed for ${shop} order ${orderGid}`, error);
    await prisma.shop
      .update({ where: { shopDomain: shop }, data: { lastSyncError: describeError(error) } })
      .catch((e) => console.error(`[webhooks/orders] could not record sync error for ${shop}`, e));
  }
}
