import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR webhook: erase any data this app holds about a customer.
 * This app never stores customer-identifying data at all, so there's
 * nothing to redact — just acknowledge.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);
  return new Response();
};
