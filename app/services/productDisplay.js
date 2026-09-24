/**
 * Per-product display rules, edited from the admin "Productos" page and
 * applied by the App Proxy endpoint. A product with no
 * ProductDisplaySetting row uses the default: counter shown.
 */

export const MAX_PREVIEW_UNITS = 1_000_000;

/**
 * "Unidades simuladas" column of the admin table: form value -> non-negative
 * integer, or null when the field is emptied. Stored in
 * ProductDisplaySetting.previewUnits; the storefront doesn't read it.
 */
export function parsePreviewUnits(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Math.min(Number(trimmed), MAX_PREVIEW_UNITS);
}

/** Whether the merchant unticked this product in the admin table. */
export function isProductHidden(setting) {
  return Boolean(setting?.hidden);
}
