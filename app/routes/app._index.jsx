import { json } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { BlockStack, Button, Card, Checkbox, InlineStack, Layout, Page, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { runReconciliation } from "../services/backfill.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });
  return json({ shop });
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reconcile") {
    const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });
    try {
      await runReconciliation(
        session.shop,
        { request: (q, o) => admin.graphql(q, o).then((r) => r.json()) },
        shop.ianaTimezone,
      );
    } catch (error) {
      console.error(`[reconcile] manual run failed for ${session.shop}`, error);
    }
  }

  if (intent === "toggle-hide-when-zero") {
    const hideWhenZero = formData.get("hideWhenZero") === "true";
    await prisma.shop.update({ where: { shopDomain: session.shop }, data: { hideWhenZero } });
  }

  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });
  return json({ shop });
};

export default function Dashboard() {
  const { shop } = useLoaderData();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <Page title="Product sales counter">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Connection
              </Text>
              <Text as="p">
                Connected to <strong>{shop.shopDomain}</strong> (timezone {shop.ianaTimezone}).
              </Text>
              <Text as="p">
                Backfill status: <strong>{shop.backfillStatus}</strong>
                {shop.backfillCompletedAt ? ` (completed ${new Date(shop.backfillCompletedAt).toLocaleString()})` : ""}
              </Text>
              {shop.backfillError ? (
                <Text as="p" tone="critical">
                  Backfill error: {shop.backfillError}
                </Text>
              ) : null}
              <Text as="p">
                Last reconciled:{" "}
                {shop.lastReconciledAt ? new Date(shop.lastReconciledAt).toLocaleString() : "never"}
              </Text>
              {shop.lastSyncError ? (
                <Text as="p" tone="critical">
                  Last sync error: {shop.lastSyncError}
                </Text>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Manual reconciliation
              </Text>
              <Text as="p">
                Re-syncs the last 30 days of orders for this shop, correcting any drift from missed or delayed
                webhooks.
              </Text>
              <InlineStack>
                <Form method="post">
                  <input type="hidden" name="intent" value="reconcile" />
                  <Button submit loading={busy} variant="primary">
                    Run reconciliation now
                  </Button>
                </Form>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Storefront display
              </Text>
              <Form method="post">
                <input type="hidden" name="intent" value="toggle-hide-when-zero" />
                <input type="hidden" name="hideWhenZero" value={(!shop.hideWhenZero).toString()} />
                <Checkbox
                  label="Hide the block when a product has 0 units sold in the last 30 days"
                  checked={shop.hideWhenZero}
                  onChange={() => {
                    /* triggers on submit via a real form below */
                  }}
                />
                <Button submit>{shop.hideWhenZero ? "Show 0 instead" : "Hide when zero"}</Button>
              </Form>
              <Text as="p" tone="subdued">
                Add the "Units sold" block to your product page from the theme editor: Online Store → Themes →
                Customize → open a product page → Add block → Apps → Product sales counter.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
