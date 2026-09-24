import { describe, expect, it, vi, beforeEach } from "vitest";

const appProxyMock = vi.fn();
const shopFindUniqueMock = vi.fn();
const getUnitsSoldMock = vi.fn();
const settingFindUniqueMock = vi.fn();

vi.mock("../shopify.server", () => ({
  authenticate: { public: { appProxy: appProxyMock } },
}));
vi.mock("../db.server", () => ({
  default: {
    shop: { findUnique: shopFindUniqueMock },
    productDisplaySetting: { findUnique: settingFindUniqueMock },
  },
}));
vi.mock("../services/salesQuery.server", () => ({
  getUnitsSoldInTrailingWindow: getUnitsSoldMock,
}));

const { loader } = await import("./proxy.sold-count");

function makeRequest(query) {
  return new Request(`https://app.example.com/apps/sold-count?${query}`);
}

describe("proxy.sold-count loader", () => {
  beforeEach(() => {
    appProxyMock.mockReset();
    shopFindUniqueMock.mockReset();
    getUnitsSoldMock.mockReset();
    settingFindUniqueMock.mockReset();
    settingFindUniqueMock.mockResolvedValue(null);
  });

  it("rejects a request App Proxy could not authenticate (bad/missing HMAC signature)", async () => {
    appProxyMock.mockResolvedValue({ session: null });

    const response = await loader({ request: makeRequest("product_id=123"), params: {}, context: {} });

    expect(response.status).toBe(401);
  });

  it("returns 404 for a shop that authenticated but was never installed/onboarded in our DB", async () => {
    appProxyMock.mockResolvedValue({ session: { shop: "some-other-shop.myshopify.com" } });
    shopFindUniqueMock.mockResolvedValue(null);

    const response = await loader({ request: makeRequest("product_id=123"), params: {}, context: {} });

    expect(response.status).toBe(404);
  });

  it("rejects a request missing product_id", async () => {
    appProxyMock.mockResolvedValue({ session: { shop: "shop.myshopify.com" } });

    const response = await loader({ request: makeRequest(""), params: {}, context: {} });

    expect(response.status).toBe(400);
  });

  it("rejects a product_id that isn't a valid Shopify product reference", async () => {
    appProxyMock.mockResolvedValue({ session: { shop: "shop.myshopify.com" } });

    const response = await loader({
      request: makeRequest("product_id=not-a-real-product"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(400);
  });

  it("hides a product the merchant unticked, without computing its sales", async () => {
    appProxyMock.mockResolvedValue({ session: { shop: "shop.myshopify.com" } });
    shopFindUniqueMock.mockResolvedValue({ shopDomain: "shop.myshopify.com", ianaTimezone: "UTC", hideWhenZero: false });
    settingFindUniqueMock.mockResolvedValue({ hidden: true });

    const response = await loader({ request: makeRequest("product_id=123"), params: {}, context: {} });
    const body = await response.json();

    expect(settingFindUniqueMock).toHaveBeenCalledWith({
      where: { shopDomain_productId: { shopDomain: "shop.myshopify.com", productId: "gid://shopify/Product/123" } },
    });
    expect(body).toEqual({ productId: "123", hidden: true });
    expect(getUnitsSoldMock).not.toHaveBeenCalled();
  });

  it("returns the localized message scoped to the authenticated shop only", async () => {
    appProxyMock.mockResolvedValue({ session: { shop: "shop.myshopify.com" } });
    shopFindUniqueMock.mockResolvedValue({ shopDomain: "shop.myshopify.com", ianaTimezone: "UTC", hideWhenZero: true });
    getUnitsSoldMock.mockResolvedValue({ unitsSold: 4964, periodDays: 30 });

    const response = await loader({
      request: makeRequest("product_id=123&locale=es-ES"),
      params: {},
      context: {},
    });
    const body = await response.json();

    expect(shopFindUniqueMock).toHaveBeenCalledWith({ where: { shopDomain: "shop.myshopify.com" } });
    expect(body.message).toBe("4964 vendidas en el último mes");
    expect(body.messageParts).toEqual([
      { text: "4964 vendidas", strong: true },
      { text: " en el último mes", strong: false },
    ]);
    expect(body.unitsSold).toBe(4964);
  });
});
