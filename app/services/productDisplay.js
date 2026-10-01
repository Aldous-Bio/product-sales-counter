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

/**
 * "Mínimo de unidades" field of the admin dashboard: form value ->
 * non-negative integer. Empty or invalid input means no minimum (0).
 * Stored in Shop.minUnitsToShow.
 */
export function parseMinUnitsToShow(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return 0;
  return Math.min(Number(trimmed), MAX_PREVIEW_UNITS);
}

/**
 * Whether the figure the storefront would show (`units`) falls short of the
 * shop's minimum. Applies on top of hideWhenZero and the block's "show zero"
 * setting, which can't override it.
 */
export function isBelowMinimum(units, minUnitsToShow) {
  return units < (minUnitsToShow ?? 0);
}

/** Whether the merchant unticked this product in the admin table. */
export function isProductHidden(setting) {
  return Boolean(setting?.hidden);
}
