import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR webhook, sent ~48h after uninstall: erase all data this
 * app holds for the shop.
 */
export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);

  await prisma.orderProductDay.deleteMany({ where: { shopDomain: shop } });
  await prisma.productDisplaySetting.deleteMany({ where: { shopDomain: shop } });
  await prisma.session.deleteMany({ where: { shop } });
  await prisma.shop.deleteMany({ where: { shopDomain: shop } });

  return new Response();
};
