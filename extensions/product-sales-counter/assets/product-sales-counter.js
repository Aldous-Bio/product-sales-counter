/**
 * Fetches the sold-units text from the app's backend via App Proxy and
 * renders it. Never talks to the Admin API directly — the browser never
 * sees an Admin API token.
 */
(function () {
  "use strict";

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
        if (!response.ok) throw new Error("sold-count request failed: " + response.status);
        return response.json();
      })
      .then(function (data) {
        var shouldHide = data.unitsSold === 0 && data.hideWhenZero && !forceShowZero;
        if (shouldHide) {
          container.remove();
          return;
        }

        var text = document.createElement("p");
        text.className = "product-sales-counter__text";
        text.textContent = data.message;
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
