import "@shopify/shopify-app-remix/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { SHOP_QUERY } from "./graphql/orders";
import { runInitialBackfill } from "./services/backfill.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26, // 2026-07, the current stable Admin API version
  scopes: process.env.SCOPES?.split(",") ?? ["read_orders"],
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  // We never import `restResources`, so this app never touches the REST Admin API.
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      const shopResponse = await admin.graphql(SHOP_QUERY);
      const shopData = await shopResponse.json();
      const ianaTimezone = shopData.data?.shop?.ianaTimezone ?? "UTC";

      const shop = await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: { shopDomain: session.shop, ianaTimezone, uninstalledAt: null },
        update: { ianaTimezone, uninstalledAt: null },
      });

      // Webhook subscriptions are declared in shopify.app.toml and managed
      // by Shopify automatically for every shop — no runtime registration
      // needed here.

      if (shop.backfillStatus === "pending" || shop.backfillStatus === "failed") {
        // Fire-and-forget: the merchant sees progress on the dashboard
        // rather than waiting for this to finish before landing in the app.
        runInitialBackfill(
          session.shop,
          { request: (q, o) => admin.graphql(q, o).then((r) => r.json()) },
          ianaTimezone,
        ).catch((error) => console.error(`[backfill] ${session.shop} failed`, error));
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
