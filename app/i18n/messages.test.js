import { describe, expect, it } from "vitest";
import { formatSoldMessage, formatSoldMessageParts, resolveLocale, SUPPORTED_LOCALES } from "./messages";

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
    expect(formatSoldMessage(1, 30, "es")).toBe("1 vendida en el último mes");
    expect(formatSoldMessage(4964, 30, "es")).toBe("4964 vendidas en el último mes");
    expect(formatSoldMessage(0, 30, "es")).toBe("0 vendidas en el último mes");
  });

  it("pluralizes correctly in English", () => {
    expect(formatSoldMessage(1, 30, "en")).toBe("1 sold in the past month");
    // Intl.NumberFormat applies locale-appropriate grouping (e.g. "4,964"); the
    // brief's plain "4964" examples are just illustrative, not a no-grouping requirement.
    expect(formatSoldMessage(4964, 30, "en")).toBe("4,964 sold in the past month");
  });

  it("uses a region-qualified locale's base language", () => {
    expect(formatSoldMessage(1, 30, "es-ES")).toBe("1 vendida en el último mes");
  });

  it("pluralizes correctly in French, including 0 as singular", () => {
    expect(formatSoldMessage(1, 30, "fr")).toBe("1 vendue ce dernier mois");
    expect(formatSoldMessage(0, 30, "fr")).toBe("0 vendue ce dernier mois");
    expect(formatSoldMessage(23, 30, "fr")).toBe("23 vendues ce dernier mois");
  });

  it("pluralizes correctly in Portuguese, including 0 as singular", () => {
    expect(formatSoldMessage(1, 30, "pt")).toBe("1 vendida no último mês");
    expect(formatSoldMessage(0, 30, "pt")).toBe("0 vendida no último mês");
    expect(formatSoldMessage(23, 30, "pt")).toBe("23 vendidas no último mês");
  });

  it("pluralizes correctly in Italian, with 0 as plural", () => {
    expect(formatSoldMessage(1, 30, "it")).toBe("1 venduta nell'ultimo mese");
    expect(formatSoldMessage(0, 30, "it")).toBe("0 vendute nell'ultimo mese");
    expect(formatSoldMessage(23, 30, "it")).toBe("23 vendute nell'ultimo mese");
  });

  it("phrases each selectable window naturally", () => {
    expect(formatSoldMessage(5, 7, "es")).toBe("5 vendidas en la última semana");
    expect(formatSoldMessage(5, 14, "es")).toBe("5 vendidas en las últimas 2 semanas");
    expect(formatSoldMessage(5, 60, "es")).toBe("5 vendidas en los últimos 2 meses");
    expect(formatSoldMessage(5, 90, "es")).toBe("5 vendidas en el último trimestre");
    expect(formatSoldMessage(5, 7, "en")).toBe("5 sold in the past week");
    expect(formatSoldMessage(5, 90, "en")).toBe("5 sold in the past 3 months");
  });

  it("falls back to a plain day count for windows without a natural phrase", () => {
    expect(formatSoldMessage(5, 45, "es")).toBe("5 vendidas en los últimos 45 días");
    expect(formatSoldMessage(5, 45, "en")).toBe("5 sold in the past 45 days");
    expect(formatSoldMessage(5, 45, "fr")).toBe("5 vendues ces 45 derniers jours");
    expect(formatSoldMessage(5, 45, "pt")).toBe("5 vendidas nos últimos 45 dias");
    expect(formatSoldMessage(5, 45, "it")).toBe("5 vendute negli ultimi 45 giorni");
  });

  it("has a phrase for every selectable window in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const days of [7, 14, 30, 60, 90]) {
        expect(formatSoldMessage(2, days, locale)).not.toMatch(/undefined|\{/);
      }
    }
  });
});

describe("formatSoldMessageParts", () => {
  it("marks only the count as strong", () => {
    expect(formatSoldMessageParts(600, 30, "es")).toEqual([
      { text: "600 vendidas", strong: true },
      { text: " en el último mes", strong: false },
    ]);
  });
});
