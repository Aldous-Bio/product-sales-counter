import { redirect } from "@remix-run/node";

/**
 * Shopify embeds the app at `application_url` (i.e. the bare root "/"),
 * appending `?shop=...&host=...&embedded=1&...`. Without this route, "/"
 * matched nothing and rendered blank — which also meant the merchant never
 * got bounced into the OAuth flow at `/app` (authenticate.admin lives
 * there), so no session was ever stored for the shop.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Direct, non-embedded visit (e.g. someone opening the bare URL outside
  // Shopify admin) — nothing useful to show without a shop context.
  return new Response(null, { status: 404 });
};
