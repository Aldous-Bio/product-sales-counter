import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { orderGidFromLegacyId, refetchAndUpsertOrder } from "../services/orderSync.server";

/** refunds/create: re-derive the parent order's rows (see orderSync.server.ts). */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const orderLegacyId = (payload as { order_id?: number | string }).order_id;
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

  try {
    const { admin } = await unauthenticated.admin(shop);
    await refetchAndUpsertOrder(shop, { request: (q, o) => admin.graphql(q, o).then((r) => r.json()) }, orderGid, shopRecord.ianaTimezone);
  } catch (error) {
    console.error(`[webhooks/refunds] failed for ${shop} order ${orderGid}`, error);
    await prisma.shop.update({
      where: { shopDomain: shop },
      data: { lastSyncError: error instanceof Error ? error.message : String(error) },
    });
  }

  return new Response();
};
