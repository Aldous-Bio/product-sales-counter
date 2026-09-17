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
                Vuelve a sincronizar los últimos 30 días de pedidos de esta tienda, corrigiendo cualquier
                desajuste por webhooks perdidos o retrasados.
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
                Visualización en la tienda
              </Text>
              <Form method="post">
                <input type="hidden" name="intent" value="toggle-hide-when-zero" />
                <input type="hidden" name="hideWhenZero" value={(!shop.hideWhenZero).toString()} />
                <Checkbox
                  label="Ocultar el bloque cuando un producto tenga 0 unidades vendidas en los últimos 30 días"
                  checked={shop.hideWhenZero}
                  onChange={() => {
                    /* se aplica al enviar el formulario de abajo */
                  }}
                />
                <Button submit>{shop.hideWhenZero ? "Mostrar 0 en su lugar" : "Ocultar cuando sea 0"}</Button>
              </Form>
              <Text as="p" tone="subdued">
                Añade el bloque "Unidades vendidas" a tu ficha de producto desde el editor de temas: Tienda
                online → Temas → Personalizar → abre una página de producto → Añadir bloque → Apps → Product
                sales counter.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
