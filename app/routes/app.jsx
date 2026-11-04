import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigate, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";

// Polaris web components: the "2" channel serves the latest stable 2.x.
// https://shopify.dev/docs/api/app-home/latest/web-components/versioning
const APP_BRIDGE_URL = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
const POLARIS_URL = "https://cdn.shopify.com/shopifycloud/polaris-2.js";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

export default function AppLayout() {
  const { apiKey } = useLoaderData();
  const navigate = useNavigate();

  // <s-link href> and <s-app-nav> clicks reach us as `shopify:navigate`;
  // route them through Remix so navigation stays client-side.
  useEffect(() => {
    const handleNavigate = (event) => {
      const href = event.target?.getAttribute("href");
      if (href) navigate(href);
    };
    addEventListener("shopify:navigate", handleNavigate);
    return () => removeEventListener("shopify:navigate", handleNavigate);
  }, [navigate]);

  return (
    <>
      <script src={APP_BRIDGE_URL} data-api-key={apiKey} />
      <script src={POLARIS_URL} />
      <s-app-nav>
        <s-link href="/app" rel="home">
          Product sales counter
        </s-link>
        <s-link href="/app/products">Productos</s-link>
      </s-app-nav>
      <Outlet />
    </>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
