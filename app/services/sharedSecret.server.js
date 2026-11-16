import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of a caller-supplied secret (e.g. the
 * x-reconcile-secret header) against the configured one. Both values are
 * hashed first so timingSafeEqual always compares equal-length buffers and
 * the comparison time leaks neither the content nor the length of the
 * expected secret. An unset/empty expected secret never matches.
 */
export function isValidSharedSecret(provided, expected) {
  if (!expected || typeof provided !== "string") return false;
  const digest = (value) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(expected));
}
