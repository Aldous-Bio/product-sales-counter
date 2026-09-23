import { json } from "@remix-run/node";
import prisma from "../db.server";
import { formatSoldMessage, formatSoldMessageParts, resolveLocale } from "../i18n/messages";
import { authenticate } from "../shopify.server";
import { resolveProductDisplay } from "../services/productDisplay";
import { normalizeProductId } from "../services/productId";
import { getUnitsSoldInTrailingWindow } from "../services/salesQuery.server";

/**
 * GET /apps/sold-count?product_id=...&locale=...
 *
 * Requested by the theme app extension's frontend JS via Shopify's App
 * Proxy. `authenticate.public.appProxy` verifies the request's HMAC
 * signature and resolves which installed shop it's for — this route never
 * trusts the `shop` query param on its own, and never runs for a shop that
 * isn't installed. No Admin API tokens are ever sent to the browser.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawProductId = url.searchParams.get("product_id");
  const locale = resolveLocale(url.searchParams.get("locale"));

  if (!rawProductId) {
    return json({ error: "missing product_id" }, { status: 400 });
  }

  const productId = normalizeProductId(rawProductId);
  if (!productId) {
    return json({ error: "invalid product_id" }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) {
    return json({ error: "shop not found" }, { status: 404 });
  }

  const setting = await prisma.productDisplaySetting.findUnique({
    where: { shopDomain_productId: { shopDomain: session.shop, productId } },
  });
  const display = resolveProductDisplay(setting, url.searchParams, shop);

  // Products the merchant unticked never show the counter, whatever the
  // block's "show zero" setting — so there's no need to compute the number.
  if (display.hidden) {
    return json({ productId: rawProductId, hidden: true });
  }

  // A test figure only comes back where no real shopper can see it (theme
  // editor, unpublished themes, development stores — see productDisplay.js).
  const preview = display.previewUnits !== null;
  const { unitsSold, periodDays } = preview
    ? { unitsSold: display.previewUnits, periodDays: shop.windowDays }
    : await getUnitsSoldInTrailingWindow(session.shop, productId, shop.ianaTimezone, shop.windowDays);

  return json({
    productId: rawProductId,
    unitsSold,
    periodDays,
    preview,
    locale,
    hideWhenZero: shop.hideWhenZero,
    message: formatSoldMessage(unitsSold, periodDays, locale),
    messageParts: formatSoldMessageParts(unitsSold, periodDays, locale),
  });
};
