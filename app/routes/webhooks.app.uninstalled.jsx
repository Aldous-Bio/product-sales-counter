import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, session } = await authenticate.webhook(request);

  if (session) {
    await prisma.session.deleteMany({ where: { shop } });
  }
  await prisma.shop.updateMany({ where: { shopDomain: shop }, data: { uninstalledAt: new Date() } });

  return new Response();
};
