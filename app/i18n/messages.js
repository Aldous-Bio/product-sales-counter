/**
 * Minimal, extensible i18n catalog for the "N units sold in the last 30
 * days" message. Translation happens here, server-side (App Proxy
 * response), never in Liquid — Liquid has no access to sales data anyway.
 *
 * To add a language: add an entry to CATALOG below with a `one` and
 * `other` form. Missing locales fall back to `en`.
 */

const CATALOG = {
  es: {
    one: "{count} unidad vendida en los últimos {days} días",
    other: "{count} unidades vendidas en los últimos {days} días",
  },
  en: {
    one: "{count} unit sold in the last {days} days",
    other: "{count} units sold in the last {days} days",
  },
  fr: {
    // French pluralizes 0 and 1 as "one" (Intl.PluralRules('fr').select(0) === "one"),
    // which this template already handles correctly.
    one: "{count} unité vendue au cours des {days} derniers jours",
    other: "{count} unités vendues au cours des {days} derniers jours",
  },
  pt: {
    // Portuguese pluralizes 0 and 1 as "one", same as French.
    one: "{count} unidade vendida nos últimos {days} dias",
    other: "{count} unidades vendidas nos últimos {days} dias",
  },
  it: {
    one: "{count} unità venduta negli ultimi {days} giorni",
    other: "{count} unità vendute negli ultimi {days} giorni",
  },
};

export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = Object.keys(CATALOG);

/** "es-ES", "es-MX", "fr-CA" -> base language "es"/"fr", with a safe fallback. */
export function resolveLocale(requested) {
  if (!requested) return DEFAULT_LOCALE;
  const base = requested.toLowerCase().split(/[-_]/)[0];
  return CATALOG[base] ? base : DEFAULT_LOCALE;
}

/**
 * Renders the localized, pluralized, number-formatted sold message.
 * Pluralization here is a simple one/other split, which covers es and en;
 * a locale needing more plural categories (e.g. pl, ar) can use
 * `Intl.PluralRules` instead when it's added to CATALOG.
 */
export function formatSoldMessage(unitsSold, periodDays, locale) {
  const resolved = resolveLocale(locale);
  const entry = CATALOG[resolved] ?? CATALOG[DEFAULT_LOCALE];
  const pluralRules = new Intl.PluralRules(resolved);
  const category = pluralRules.select(unitsSold);
  const template = category === "one" ? entry.one : entry.other;
  const formattedCount = new Intl.NumberFormat(resolved).format(unitsSold);
  return template.replace("{count}", formattedCount).replace("{days}", String(periodDays));
}
