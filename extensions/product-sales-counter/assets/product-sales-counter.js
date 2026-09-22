/**
 * Fetches the sold-units text from the app's backend via App Proxy and
 * renders it. Never talks to the Admin API directly — the browser never
 * sees an Admin API token.
 */
(function () {
  "use strict";

  function formatCompactSoldMessage(data) {
    var locale = data.locale || "en";
    var count = new Intl.NumberFormat(locale).format(data.unitsSold);
    var templates = {
      es: "{count} en {days} días",
      en: "{count} in {days} days",
      fr: "{count} en {days} j.",
      pt: "{count} em {days} dias",
      it: "{count} in {days} giorni",
    };

    var template = templates[locale] || templates.en;
    return template
      .replace("{count}", count)
      .replace("{days}", String(data.periodDays));
  }

  function mount(container) {
    var productId = container.getAttribute("data-product-id");
    var locale = container.getAttribute("data-locale") || "en";
    var forceShowZero = container.getAttribute("data-show-zero") === "true";

    if (!productId) return;

    var params = new URLSearchParams({ product_id: productId, locale: locale });

    fetch("/apps/sold-count?" + params.toString(), {
      headers: { Accept: "application/json" },
    })
      .then(function (response) {
        if (!response.ok)
          throw new Error("sold-count request failed: " + response.status);
        return response.json();
      })
      .then(function (data) {
        var shouldHide =
          data.unitsSold === 0 && data.hideWhenZero && !forceShowZero;
        if (shouldHide) {
          container.remove();
          return;
        }

        var text = document.createElement("p");
        text.className =
          "product-sales-counter__text m-0 text-xs text-right text-lg-left text-secondary-grey-darkest font-light";
        text.textContent = formatCompactSoldMessage(data);
        container.replaceChildren(text);
      })
      .catch(function (error) {
        // Fail silently on the storefront — a missing/errored counter
        // should never break the product page for a shopper.
        console.error("[product-sales-counter]", error);
        container.remove();
      });
  }

  function init() {
    document.querySelectorAll("[data-product-sales-counter]").forEach(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
