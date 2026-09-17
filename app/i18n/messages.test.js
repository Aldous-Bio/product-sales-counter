import { describe, expect, it } from "vitest";
import { formatSoldMessage, resolveLocale } from "./messages";

describe("resolveLocale", () => {
  it("falls back to a supported base language from a region-qualified locale", () => {
    expect(resolveLocale("es-MX")).toBe("es");
    expect(resolveLocale("en-GB")).toBe("en");
    expect(resolveLocale("fr-CA")).toBe("fr");
  });

  it("falls back to the default locale for an unsupported/missing language", () => {
    expect(resolveLocale("de-DE")).toBe("en"); // German isn't in the catalog yet
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });
});

describe("formatSoldMessage", () => {
  it("pluralizes correctly in Spanish", () => {
    expect(formatSoldMessage(1, 30, "es")).toBe("1 vendida en los últimos 30 días");
    expect(formatSoldMessage(4964, 30, "es")).toBe("4964 vendidas en los últimos 30 días");
    expect(formatSoldMessage(0, 30, "es")).toBe("0 vendidas en los últimos 30 días");
  });

  it("pluralizes correctly in English", () => {
    expect(formatSoldMessage(1, 30, "en")).toBe("1 sold in the last 30 days");
    // Intl.NumberFormat applies locale-appropriate grouping (e.g. "4,964"); the
    // brief's plain "4964" examples are just illustrative, not a no-grouping requirement.
    expect(formatSoldMessage(4964, 30, "en")).toBe("4,964 sold in the last 30 days");
  });

  it("uses a region-qualified locale's base language", () => {
    expect(formatSoldMessage(1, 30, "es-ES")).toBe("1 vendida en los últimos 30 días");
  });

  it("pluralizes correctly in French, including 0 as singular", () => {
    expect(formatSoldMessage(1, 30, "fr")).toBe("1 vendue ces 30 derniers jours");
    expect(formatSoldMessage(0, 30, "fr")).toBe("0 vendue ces 30 derniers jours");
    expect(formatSoldMessage(23, 30, "fr")).toBe("23 vendues ces 30 derniers jours");
  });

  it("pluralizes correctly in Portuguese, including 0 as singular", () => {
    expect(formatSoldMessage(1, 30, "pt")).toBe("1 vendida nos últimos 30 dias");
    expect(formatSoldMessage(0, 30, "pt")).toBe("0 vendida nos últimos 30 dias");
    expect(formatSoldMessage(23, 30, "pt")).toBe("23 vendidas nos últimos 30 dias");
  });

  it("pluralizes correctly in Italian, with 0 as plural", () => {
    expect(formatSoldMessage(1, 30, "it")).toBe("1 venduta negli ultimi 30 giorni");
    expect(formatSoldMessage(0, 30, "it")).toBe("0 vendute negli ultimi 30 giorni");
    expect(formatSoldMessage(23, 30, "it")).toBe("23 vendute negli ultimi 30 giorni");
  });
});
