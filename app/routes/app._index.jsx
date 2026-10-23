import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  Divider,
  InlineStack,
  Layout,
  Link,
  List,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import prisma from "../db.server";
import { runReconciliation } from "../services/backfill.server";
import { MAX_PREVIEW_UNITS, parseMinUnitsToShow } from "../services/productDisplay";
import { authenticate } from "../shopify.server";
import dashboardStyles from "../styles/dashboard.css?url";

export const links = () => [{ rel: "stylesheet", href: dashboardStyles }];

// Each option has a natural-language phrase in app/i18n/messages.js (PERIOD_KEYS).
const WINDOW_DAYS_OPTIONS = [7, 14, 30, 60, 90];

// "Lunes, 28 sept, 15:55" in the shop's timezone.
function formatDate(date, timeZone) {
  const text = new Date(date).toLocaleString("es-ES", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({
    where: { shopDomain: session.shop },
  });
  return json({ shop });
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reconcile") {
    const shop = await prisma.shop.findUniqueOrThrow({
      where: { shopDomain: session.shop },
    });
    try {
      await runReconciliation(
        session.shop,
        { request: (q, o) => admin.graphql(q, o).then((r) => r.json()) },
        shop.ianaTimezone,
      );
    } catch (error) {
      console.error(`[reconcile] manual run failed for ${session.shop}`, error);
      return json({ error: "La sincronización ha fallado" });
    }
    return json({ message: "Sincronización completada" });
  }

  if (intent === "save-settings") {
    const windowDays = WINDOW_DAYS_OPTIONS.includes(Number(formData.get("windowDays")))
      ? Number(formData.get("windowDays"))
      : 30;
    await prisma.shop.update({
      where: { shopDomain: session.shop },
      data: { windowDays, minUnitsToShow: parseMinUnitsToShow(formData.get("minUnitsToShow")) },
    });
    return json({ message: "Ajustes guardados" });
  }

  return json({ error: "Acción no válida" }, { status: 400 });
};

// Shows a toast with the result of each fetcher submission.
function useResultToast(fetcher) {
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);
}

function SyncStatusBadge({ shop, syncing }) {
  if (syncing || shop.backfillStatus === "running") return <Badge tone="info">Sincronizando</Badge>;
  if (shop.lastSyncError || shop.backfillStatus === "failed") return <Badge tone="critical">Con errores</Badge>;
  if (shop.backfillStatus === "pending") return <Badge>Pendiente</Badge>;
  return <Badge tone="success">Al día</Badge>;
}

function Metric({ title, children }) {
  return (
    <Box paddingBlock="200" paddingInline="400">
      <BlockStack gap="200">
        <Text as="h2" variant="headingSm">
          {title}
        </Text>
        {children}
      </BlockStack>
    </Box>
  );
}

export default function Dashboard() {
  const { shop } = useLoaderData();
  const settingsFetcher = useFetcher();
  const syncFetcher = useFetcher();
  useResultToast(settingsFetcher);
  useResultToast(syncFetcher);

  const syncing = syncFetcher.state !== "idle";
  const saving = settingsFetcher.state !== "idle";
  const lastSyncAt = shop.lastReconciledAt ?? shop.backfillCompletedAt;

  const [windowDays, setWindowDays] = useState(String(shop.windowDays));
  const [minUnits, setMinUnits] = useState(String(shop.minUnitsToShow));
  const resetSettings = () => {
    setWindowDays(String(shop.windowDays));
    setMinUnits(String(shop.minUnitsToShow));
  };
  // Back to the stored values after saving (the loader revalidates).
  useEffect(() => {
    setWindowDays(String(shop.windowDays));
    setMinUnits(String(shop.minUnitsToShow));
  }, [shop.windowDays, shop.minUnitsToShow]);

  const dirty = windowDays !== String(shop.windowDays) || parseMinUnitsToShow(minUnits) !== shop.minUnitsToShow;

  const saveSettings = () =>
    settingsFetcher.submit({ intent: "save-settings", windowDays, minUnitsToShow: minUnits }, { method: "post" });
  const syncNow = () => syncFetcher.submit({ intent: "reconcile" }, { method: "post" });

  return (
    <Page>
      <TitleBar>
        <button variant="primary" onClick={syncNow} disabled={syncing} loading={syncing ? "" : undefined}>
          Sincronizar ahora
        </button>
      </TitleBar>
      <SaveBar id="settings-save-bar" open={dirty}>
        <button variant="primary" onClick={saveSettings} disabled={saving} loading={saving ? "" : undefined}>
          Guardar
        </button>
        <button onClick={resetSettings} disabled={saving}>
          Descartar
        </button>
      </SaveBar>

      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <div className="metrics">
                <Metric title="Estado de los datos">
                  <InlineStack>
                    <SyncStatusBadge shop={shop} syncing={syncing} />
                  </InlineStack>
                </Metric>
                <Metric title="Última sincronización">
                  <Text as="p" tone={lastSyncAt ? undefined : "subdued"}>
                    {lastSyncAt ? formatDate(lastSyncAt, shop.ianaTimezone) : "Todavía no se ha ejecutado"}
                  </Text>
                </Metric>
                <Metric title="Zona horaria">
                  <Text as="p">{shop.ianaTimezone}</Text>
                </Metric>
              </div>
            </Card>

            {shop.backfillError ? (
              <Banner tone="critical" title="La carga inicial ha fallado">
                <p>{shop.backfillError}</p>
              </Banner>
            ) : null}
            {shop.lastSyncError ? (
              <Banner tone="critical" title="La última sincronización ha fallado">
                <p>{shop.lastSyncError}</p>
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Ajustes
                </Text>
                <Select
                  label="Periodo de cálculo"
                  helpText="Días hacia atrás que se tienen en cuenta para contar las ventas, tanto al sincronizar como en el número que se muestra en la tienda."
                  options={WINDOW_DAYS_OPTIONS.map((days) => ({ label: `${days} días`, value: String(days) }))}
                  value={windowDays}
                  onChange={setWindowDays}
                />
                <Divider />
                <TextField
                  label="Mínimo de unidades vendidas"
                  helpText="El contador solo se muestra en los productos que hayan vendido al menos estas unidades en el periodo. Con 0 se muestra siempre, también sin ventas."
                  type="number"
                  min={0}
                  max={MAX_PREVIEW_UNITS}
                  autoComplete="off"
                  value={minUnits}
                  onChange={setMinUnits}
                />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Cómo funciona
                </Text>
                <Text as="p">
                  Cuenta las unidades vendidas de cada producto en los últimos {shop.windowDays} días, según la
                  hora de la tienda:
                </Text>
                <List>
                  <List.Item>Solo pedidos pagados, descontando reembolsos y devoluciones</List.Item>
                  <List.Item>Sin pedidos cancelados ni tarjetas regalo</List.Item>
                  <List.Item>Se actualiza solo con cada pedido o reembolso</List.Item>
                </List>
                <Text as="p">
                  En <Link url="/app/products">Productos</Link> eliges en qué productos se muestra el contador.
                </Text>
                <Text as="p" tone="subdued">
                  Usa «Sincronizar ahora» si ves alguna cifra desajustada.
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Cómo añadirlo a la tienda
                </Text>
                <Text as="p">
                  En el editor de temas, abre la plantilla de producto y añade el bloque de app «Unidades
                  vendidas».
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
