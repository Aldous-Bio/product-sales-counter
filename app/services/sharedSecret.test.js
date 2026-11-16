import { describe, expect, it } from "vitest";
import { isValidSharedSecret } from "./sharedSecret.server";

describe("isValidSharedSecret", () => {
  const secret = "a".repeat(64);

  it("accepts the exact secret", () => {
    expect(isValidSharedSecret(secret, secret)).toBe(true);
  });

  it("rejects a wrong secret of the same length", () => {
    expect(isValidSharedSecret("b".repeat(64), secret)).toBe(false);
  });

  it("rejects a prefix or a longer value without throwing", () => {
    expect(isValidSharedSecret(secret.slice(0, 10), secret)).toBe(false);
    expect(isValidSharedSecret(`${secret}x`, secret)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isValidSharedSecret(null, secret)).toBe(false);
    expect(isValidSharedSecret(undefined, secret)).toBe(false);
  });

  it("never matches when the secret is not configured", () => {
    expect(isValidSharedSecret("", "")).toBe(false);
    expect(isValidSharedSecret("", undefined)).toBe(false);
    expect(isValidSharedSecret("anything", undefined)).toBe(false);
  });
});
