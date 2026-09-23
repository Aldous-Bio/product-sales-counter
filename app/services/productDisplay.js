/**
 * Per-product display rules, edited from the admin "Productos" page and
 * applied by the App Proxy endpoint.
 *
 * - `hidden`: the counter never shows for that product.
 * - `previewUnits` ("test units"): a merchant-chosen figure to preview how
 *   the block looks on their own theme without waiting for real orders.
 *   It is ONLY applied where no real shopper can see it:
 *     - the theme editor, or a theme that isn't the published one
 *       (unpublished / development / demo): the block then sends
 *       `preview=1`, see blocks/product-sales-counter.liquid;
 *     - a partner development store (`Shop.isDevelopmentStore`), which
 *       can't take real orders, on any theme.
 *   On a real store's published theme shoppers always see real sales.
 */

export const MAX_PREVIEW_UNITS = 1_000_000;

/** Form value -> non-negative integer, or null to switch the test figure off. */
export function parsePreviewUnits(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Math.min(Number(trimmed), MAX_PREVIEW_UNITS);
}

/**
 * What the storefront should do for one product, given its (possibly
 * missing) ProductDisplaySetting row and the App Proxy request's params.
 */
export function resolveProductDisplay(setting, searchParams, shop) {
  const hidden = Boolean(setting?.hidden);
  const testContext = searchParams.get("preview") === "1" || shop?.isDevelopmentStore === true;
  const preview = !hidden && testContext && Number.isInteger(setting?.previewUnits);
  return { hidden, previewUnits: preview ? setting.previewUnits : null };
}

/** A row that matches the defaults carries no information and can be deleted. */
export function isDefaultSetting({ hidden, previewUnits }) {
  return !hidden && previewUnits === null;
}
