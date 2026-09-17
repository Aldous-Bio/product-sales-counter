import { describe, expect, it } from "vitest";
import { formatSoldMessage, resolveLocale } from "./messages";

describe("resolveLocale", () => {
  it("falls back to a supported base language from a region-qualified locale", () => {
    expect(resolveLocale("es-MX")).toBe("es");
    expect(resolveLocale("en-GB")).toBe("en");
  });

  it("falls back to the default locale for an unsupported/missing language", () => {
    expect(resolveLocale("fr-FR")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });
});

describe("formatSoldMessage", () => {
  it("pluralizes correctly in Spanish", () => {
    expect(formatSoldMessage(1, 30, "es")).toBe("1 unidad vendida en los últimos 30 días");
    expect(formatSoldMessage(4964, 30, "es")).toBe("4964 unidades vendidas en los últimos 30 días");
    expect(formatSoldMessage(0, 30, "es")).toBe("0 unidades vendidas en los últimos 30 días");
  });

  it("pluralizes correctly in English", () => {
    expect(formatSoldMessage(1, 30, "en")).toBe("1 unit sold in the last 30 days");
    // Intl.NumberFormat applies locale-appropriate grouping (e.g. "4,964"); the
    // brief's plain "4964" examples are just illustrative, not a no-grouping requirement.
    expect(formatSoldMessage(4964, 30, "en")).toBe("4,964 units sold in the last 30 days");
  });

  it("uses a region-qualified locale's base language", () => {
    expect(formatSoldMessage(1, 30, "es-ES")).toBe("1 unidad vendida en los últimos 30 días");
  });
});
