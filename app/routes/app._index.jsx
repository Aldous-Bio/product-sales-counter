import { json } from "@remix-run/node";
import { Form, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { BlockStack, Box, Button, Card, InlineStack, Layout, Page, Select, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { runReconciliation } from "../services/backfill.server";
import { authenticate } from "../shopify.server";

// Each option has a natural-language phrase in app/i18n/messages.js (PERIOD_KEYS).
const WINDOW_DAYS_OPTIONS = [7, 14, 30, 60, 90];

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

  if (intent === "set-window-days") {
    const windowDays = WINDOW_DAYS_OPTIONS.includes(Number(formData.get("windowDays")))
      ? Number(formData.get("windowDays"))
      : 30;
    await prisma.shop.update({ where: { shopDomain: session.shop }, data: { windowDays } });
  }

  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });
  return json({ shop });
};

export default function Dashboard() {
  const { shop } = useLoaderData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const busy = navigation.state !== "idle";

  const backfillStatusEs = {
    pending: "pendiente",
    running: "en curso",
    completed: "completado",
    failed: "fallido",
  }[shop.backfillStatus] ?? shop.backfillStatus;

  return (
    <Page title="Contador de ventas por producto">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Conexión
              </Text>
              <Text as="p">
                Conectado a <strong>{shop.shopDomain}</strong> (zona horaria {shop.ianaTimezone}).
              </Text>
              <Text as="p">
                Estado de la carga inicial: <strong>{backfillStatusEs}</strong>
                {shop.backfillCompletedAt
                  ? ` (completada el ${new Date(shop.backfillCompletedAt).toLocaleString("es-ES")})`
                  : ""}
              </Text>
              {shop.backfillError ? (
                <Text as="p" tone="critical">
                  Error en la carga inicial: {shop.backfillError}
                </Text>
              ) : null}
              <Text as="p">
                Última sincronización:{" "}
                {shop.lastReconciledAt ? new Date(shop.lastReconciledAt).toLocaleString("es-ES") : "nunca"}
              </Text>
              {shop.lastSyncError ? (
                <Text as="p" tone="critical">
                  Error de la última sincronización: {shop.lastSyncError}
                </Text>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Sincronización manual
              </Text>
              <Text as="p">
                Vuelve a sincronizar los últimos {shop.windowDays} días de pedidos de esta tienda,
                corrigiendo cualquier desajuste por webhooks perdidos o retrasados.
              </Text>
              <InlineStack>
                <Form method="post">
                  <input type="hidden" name="intent" value="reconcile" />
                  <Button submit loading={busy} variant="primary">
                    Sincronizar ahora
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
                Periodo de cálculo
              </Text>
              <Text as="p">
                Número de días hacia atrás que se tienen en cuenta para contar las ventas. Se aplica tanto
                a la sincronización manual y automática como al número que se muestra en la tienda.
              </Text>
              <Select
                label="Días a considerar"
                labelHidden
                options={WINDOW_DAYS_OPTIONS.map((days) => ({ label: `${days} días`, value: String(days) }))}
                value={String(shop.windowDays)}
                onChange={(value) => {
                  const formData = new FormData();
                  formData.set("intent", "set-window-days");
                  formData.set("windowDays", value);
                  submit(formData, { method: "post" });
                }}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
