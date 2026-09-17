import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { refetchAndUpsertOrder } from "../services/orderSync.server";

/**
 * Handles orders/paid, orders/cancelled and orders/updated (all mapped to
 * this one URI in shopify.app.toml). Whatever the topic, we re-fetch the
 * order's current GraphQL state and upsert — see orderSync.server.ts for
 * why that's both simpler and safely idempotent across retries/duplicates.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const orderGid = (payload as { admin_graphql_api_id?: string }).admin_graphql_api_id;
  if (!orderGid) {
    console.warn(`[webhooks/orders] ${topic} for ${shop} missing admin_graphql_api_id`);
    return new Response();
  }

  const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
  if (!shopRecord) {
    console.warn(`[webhooks/orders] ${topic} received for unknown shop ${shop}`);
    return new Response();
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    await refetchAndUpsertOrder(shop, { request: (q, o) => admin.graphql(q, o).then((r) => r.json()) }, orderGid, shopRecord.ianaTimezone);
  } catch (error) {
    console.error(`[webhooks/orders] ${topic} failed for ${shop} order ${orderGid}`, error);
    await prisma.shop.update({
      where: { shopDomain: shop },
      data: { lastSyncError: error instanceof Error ? error.message : String(error) },
    });
  }

  return new Response();
};
