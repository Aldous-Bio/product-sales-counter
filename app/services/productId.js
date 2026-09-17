/** Accepts a bare numeric id, a legacy REST id, or a full GID and normalizes to a GID. */
export function normalizeProductId(rawProductId) {
  const trimmed = rawProductId.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("gid://shopify/Product/")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/Product/${trimmed}`;
  return null;
}
