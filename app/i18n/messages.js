/**
 * Minimal, extensible i18n catalog for the "N sold in the last month"
 * message. Translation happens here, server-side (App Proxy response),
 * never in Liquid — Liquid has no access to sales data anyway.
 *
 * The message has two halves:
 *   - `sold`: the highlighted part ("600 vendidas"), pluralized via
 *     `{ one, other }`.
 *   - `periods`: how the trailing window is phrased. The window sizes the
 *     admin selector offers (see PERIOD_KEYS) get a natural phrase ("en el
 *     último mes"); anything else falls back to `periods.days`.
 *
 * Phrases are trailing ("en el último mes", "in the past month"), never
 * calendar ones ("el mes pasado", "last month"): the window is the last N
 * days, not the previous calendar month.
 *
 * To add a language: add an entry to CATALOG with `sold` and every key of
 * `periods`. Missing locales fall back to `en`.
 */

/** Window size (days) -> key in `periods`. Mirrors WINDOW_DAYS_OPTIONS in app._index.jsx. */
const PERIOD_KEYS = {
  7: "week",
  14: "twoWeeks",
  30: "month",
  60: "twoMonths",
  90: "quarter",
};

// Deliberately terse: the product page context already makes clear these
// are units of this product, so we don't spell out "unit(s)".
const CATALOG = {
  es: {
    sold: { one: "{count} vendida", other: "{count} vendidas" },
    periods: {
      week: "en la última semana",
      twoWeeks: "en las últimas 2 semanas",
      month: "en el último mes",
      twoMonths: "en los últimos 2 meses",
      quarter: "en el último trimestre",
      days: "en los últimos {days} días",
    },
  },
  en: {
    sold: { one: "{count} sold", other: "{count} sold" },
    periods: {
      week: "in the past week",
      twoWeeks: "in the past 2 weeks",
      month: "in the past month",
      twoMonths: "in the past 2 months",
      quarter: "in the past 3 months",
      days: "in the past {days} days",
    },
  },
  pt: {
    // Portuguese pluralizes 0 and 1 as "one", same as French.
    sold: { one: "{count} vendida", other: "{count} vendidas" },
    periods: {
      week: "na última semana",
      twoWeeks: "nas últimas 2 semanas",
      month: "no último mês",
      twoMonths: "nos últimos 2 meses",
      quarter: "no último trimestre",
      days: "nos últimos {days} dias",
    },
  },
  it: {
    sold: { one: "{count} venduta", other: "{count} vendute" },
    periods: {
      week: "nell'ultima settimana",
      twoWeeks: "nelle ultime 2 settimane",
      month: "nell'ultimo mese",
      twoMonths: "negli ultimi 2 mesi",
      quarter: "nell'ultimo trimestre",
      days: "negli ultimi {days} giorni",
    },
  },
  fr: {
    // French pluralizes 0 and 1 as "one" (Intl.PluralRules('fr').select(0) === "one"),
    // which this template already handles correctly.
    sold: { one: "{count} vendue", other: "{count} vendues" },
    periods: {
      week: "cette dernière semaine",
      twoWeeks: "ces 2 dernières semaines",
      month: "ce dernier mois",
      twoMonths: "ces 2 derniers mois",
      quarter: "ce dernier trimestre",
      days: "ces {days} derniers jours",
    },
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
 * Renders the localized sold message as parts, so the storefront can
 * bold the count ("**600 vendidas** en el último mes") without ever
 * injecting HTML. Pluralization is a simple one/other split; a locale
 * needing more plural categories (e.g. pl, ar) can extend `sold` when it's
 * added to CATALOG.
 */
export function formatSoldMessageParts(unitsSold, periodDays, locale) {
  const resolved = resolveLocale(locale);
  const entry = CATALOG[resolved] ?? CATALOG[DEFAULT_LOCALE];
  const category = new Intl.PluralRules(resolved).select(unitsSold);
  const formattedCount = new Intl.NumberFormat(resolved).format(unitsSold);
  const sold = (category === "one" ? entry.sold.one : entry.sold.other).replace(
    "{count}",
    formattedCount,
  );
  const period = entry.periods[PERIOD_KEYS[periodDays] ?? "days"].replace(
    "{days}",
    String(periodDays),
  );
  return [
    { text: sold, strong: true },
    { text: ` ${period}`, strong: false },
  ];
}

/** Plain-text version of formatSoldMessageParts. */
export function formatSoldMessage(unitsSold, periodDays, locale) {
  return formatSoldMessageParts(unitsSold, periodDays, locale)
    .map((part) => part.text)
    .join("");
}
