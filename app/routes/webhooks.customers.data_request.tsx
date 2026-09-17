import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR webhook: a customer asked the merchant for the data an app
 * holds about them. This app never stores customer data (only
 * shopDomain + productId + aggregated quantities), so there's nothing to
 * return — just acknowledge.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);
  return new Response();
};
