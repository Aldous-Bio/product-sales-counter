import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { orderGidFromLegacyId, refetchAndUpsertOrder } from "../services/orderSync.server";
import { describeError } from "../services/backfill.server";

/** refunds/create: re-derive the parent order's rows (see orderSync.server.js). */
export const action = async ({ request }) => {
  const { shop, webhookId, payload } = await authenticate.webhook(request);
  // See webhooks.orders.jsx: lets a failed delivery be matched by webhook id.
  console.log(`[webhooks/refunds] ${shop} webhookId=${webhookId}`);

  const orderLegacyId = payload.order_id;
  if (!orderLegacyId) {
    console.warn(`[webhooks/refunds] for ${shop} missing order_id`);
    return new Response();
  }

  const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
  if (!shopRecord) {
    console.warn(`[webhooks/refunds] received for unknown shop ${shop}`);
    return new Response();
  }

  const orderGid = orderGidFromLegacyId(orderLegacyId);

  // Ack right away and sync in the background — see webhooks.orders.jsx.
  syncOrder(shop, orderGid, shopRecord.ianaTimezone);

  return new Response();
};

async function syncOrder(shop, orderGid, timeZone) {
  try {
    const { admin } = await unauthenticated.admin(shop);
    await refetchAndUpsertOrder(
      shop,
      { request: (q, o) => admin.graphql(q, o).then((r) => r.json()) },
      orderGid,
      timeZone,
    );
  } catch (error) {
    console.error(`[webhooks/refunds] failed for ${shop} order ${orderGid}`, error);
    await prisma.shop
      .update({ where: { shopDomain: shop }, data: { lastSyncError: describeError(error) } })
      .catch((e) => console.error(`[webhooks/refunds] could not record sync error for ${shop}`, e));
  }
}
