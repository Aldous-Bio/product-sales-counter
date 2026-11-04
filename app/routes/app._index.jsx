import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import prisma from "../db.server";
import { runReconciliation } from "../services/backfill.server";
import { MAX_PREVIEW_UNITS, parseMinUnitsToShow } from "../services/productDisplay";
import { authenticate } from "../shopify.server";

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
  if (syncing || shop.backfillStatus === "running") return <s-badge tone="info">Sincronizando</s-badge>;
  if (shop.lastSyncError || shop.backfillStatus === "failed") return <s-badge tone="critical">Con errores</s-badge>;
  if (shop.backfillStatus === "pending") return <s-badge tone="neutral">Pendiente</s-badge>;
  return <s-badge tone="success">Al día</s-badge>;
}

function Metric({ title, children }) {
  return (
    <s-stack gap="small-200">
      <s-heading>{title}</s-heading>
      {children}
    </s-stack>
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
    <s-page>
      <s-button slot="primary-action" variant="primary" onClick={syncNow} loading={syncing}>
        Sincronizar ahora
      </s-button>
      <SaveBar id="settings-save-bar" open={dirty}>
        <button variant="primary" onClick={saveSettings} disabled={saving} loading={saving ? "" : undefined}>
          Guardar
        </button>
        <button onClick={resetSettings} disabled={saving}>
          Descartar
        </button>
      </SaveBar>

      {shop.backfillError ? (
        <s-banner slot="supplemental-start" tone="critical" heading="La carga inicial ha fallado">
          {shop.backfillError}
        </s-banner>
      ) : null}
      {shop.lastSyncError ? (
        <s-banner slot="supplemental-start" tone="critical" heading="La última sincronización ha fallado">
          {shop.lastSyncError}
        </s-banner>
      ) : null}

      <s-section accessibilityLabel="Estado de la sincronización">
        {/* Three columns, stacked when the section is narrow. */}
        <s-query-container>
          <s-grid gridTemplateColumns="@container (inline-size > 500px) 1fr 1fr 1fr, 1fr" gap="base">
            <Metric title="Estado de los datos">
              <s-stack direction="inline">
                <SyncStatusBadge shop={shop} syncing={syncing} />
              </s-stack>
            </Metric>
            <Metric title="Última sincronización">
              <s-paragraph color={lastSyncAt ? "base" : "subdued"}>
                {lastSyncAt ? formatDate(lastSyncAt, shop.ianaTimezone) : "Todavía no se ha ejecutado"}
              </s-paragraph>
            </Metric>
            <Metric title="Zona horaria">
              <s-paragraph>{shop.ianaTimezone}</s-paragraph>
            </Metric>
          </s-grid>
        </s-query-container>
      </s-section>

      <s-section heading="Ajustes">
        <s-stack gap="base">
          <s-select
            label="Periodo de cálculo"
            details="Días hacia atrás que se tienen en cuenta para contar las ventas, tanto al sincronizar como en el número que se muestra en la tienda."
            value={windowDays}
            onChange={(event) => setWindowDays(event.currentTarget.value)}
          >
            {WINDOW_DAYS_OPTIONS.map((days) => (
              <s-option key={days} value={String(days)}>
                {days} días
              </s-option>
            ))}
          </s-select>
          <s-divider />
          <s-number-field
            label="Mínimo de unidades vendidas"
            details="El contador solo se muestra en los productos que hayan vendido al menos estas unidades en el periodo. Con 0 se muestra siempre, también sin ventas."
            min={0}
            max={MAX_PREVIEW_UNITS}
            inputMode="numeric"
            autocomplete="off"
            value={minUnits}
            onInput={(event) => setMinUnits(event.currentTarget.value)}
          />
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Cómo funciona">
        <s-stack gap="small-200">
          <s-paragraph>
            Cuenta las unidades vendidas de cada producto en los últimos {shop.windowDays} días, según la hora de la
            tienda:
          </s-paragraph>
          <s-unordered-list>
            <s-list-item>Solo pedidos pagados, descontando reembolsos y devoluciones</s-list-item>
            <s-list-item>Sin pedidos cancelados ni tarjetas regalo</s-list-item>
            <s-list-item>Se actualiza solo con cada pedido o reembolso</s-list-item>
          </s-unordered-list>
          <s-paragraph>
            En <s-link href="/app/products">Productos</s-link> eliges en qué productos se muestra el contador.
          </s-paragraph>
          <s-paragraph color="subdued">Usa «Sincronizar ahora» si ves alguna cifra desajustada.</s-paragraph>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Cómo añadirlo a la tienda">
        <s-paragraph>
          En el editor de temas, abre la plantilla de producto y añade el bloque de app «Unidades vendidas».
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
