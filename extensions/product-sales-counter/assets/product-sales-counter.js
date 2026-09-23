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
    // Theme editor / non-published theme only: lets the backend show the
    // admin's test figure. Never set on the published theme.
    // if (container.getAttribute("data-test-context") === "true") {
      console.log("dsahjdbashjbdjhasd")
      params.set("preview", "1");
    // }

    fetch("/apps/sold-count?" + params.toString(), {
      headers: { Accept: "application/json" },
    })
      .then(function (response) {        
        if (!response.ok)
          throw new Error("sold-count request failed: " + response.status);
        return response.json();
      })
      .then(function (data) {
        // `hidden`: the merchant excluded this product in the app admin,
        // which wins over the block's "show zero" setting.
        var shouldHide =
          data.hidden ||
          (data.unitsSold === 0 && data.hideWhenZero && !forceShowZero);
        console.log("data", shouldHide);
        if (shouldHide) {
          container.remove();
          return;
        }

        var text = document.createElement("p");
        text.className =
          "product-sales-counter__text m-0 text-xs text-right text-lg-left text-secondary-grey-darkest font-light";
        // messageParts lets the backend bold the count without sending
        // HTML; fall back to the plain message if it's missing.
        var parts = data.messageParts || [{ text: data.message, strong: false }];
        parts.forEach(function (part) {
          if (part.strong) {
            var strong = document.createElement("strong");
            strong.textContent = part.text;
            text.appendChild(strong);
          } else {
            text.appendChild(document.createTextNode(part.text));
          }
        });
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
