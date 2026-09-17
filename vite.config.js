import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const host = process.env.SHOPIFY_APP_URL ? new URL(process.env.SHOPIFY_APP_URL).hostname : undefined;

  const hmrConfig = host ? { protocol: "wss", host, port: 64999, clientPort: 443 } : { port: 64999, clientPort: 64999 };

  return {
    server: {
      // The Shopify CLI dev tunnel gets a new random subdomain every run, so
      // there's no fixed hostname to allowlist. This dev server is only
      // ever reached through that tunnel, not exposed otherwise.
      allowedHosts: true,
      port: Number(process.env.PORT || 3000),
      hmr: hmrConfig,
      fs: { allow: ["app", "node_modules"] },
    },
    plugins: [
      remix({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
          v3_lazyRouteDiscovery: true,
          v3_singleFetch: true,
        },
      }),
    ],
    build: {
      assetsInlineLimit: 0,
    },
    optimizeDeps: {
      include: ["@shopify/app-bridge-react", "@shopify/polaris"],
    },
  };
});
