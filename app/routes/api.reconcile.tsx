import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { runReconciliation } from "../services/backfill.server";
import { unauthenticated } from "../shopify.server";

/**
 * POST /api/reconcile
 * Header: x-reconcile-secret: <RECONCILE_SECRET>
 *
 * Not part of the Shopify OAuth/App Proxy surface — meant to be called by an
 * external scheduler (cron, Cloud Scheduler, GitHub Actions cron, ...) to
 * periodically re-sync every installed shop's trailing 30-day window and
 * correct any drift (missed/late webhooks, edits, etc).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, { status: 405 });
  }

  const secret = process.env.RECONCILE_SECRET;
  const provided = request.headers.get("x-reconcile-secret");
  if (!secret || provided !== secret) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  const shops = await prisma.shop.findMany({ where: { uninstalledAt: null } });
  const results = await Promise.allSettled(
    shops.map(async (shop) => {
      const { admin } = await unauthenticated.admin(shop.shopDomain);
      await runReconciliation(
        shop.shopDomain,
        { request: (q, o) => admin.graphql(q, o).then((r) => r.json()) },
        shop.ianaTimezone,
      );
    }),
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  return json({ shopsProcessed: shops.length, failed });
};
