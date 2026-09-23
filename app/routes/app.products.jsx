import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Card,
  Checkbox,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import prisma from "../db.server";
import { PRODUCTS_PAGE_QUERY } from "../graphql/products";
import { MAX_PREVIEW_UNITS, isDefaultSetting, parsePreviewUnits } from "../services/productDisplay";
import { normalizeProductId } from "../services/productId";
import { getUnitsSoldByProduct } from "../services/salesQuery.server";
import { authenticate } from "../shopify.server";

// 20 pages x 250 = 5,000 products: far beyond any shop this app targets,
// but bounds the loader if one ever has more.
const MAX_PRODUCT_PAGES = 20;

async function fetchAllProducts(admin) {
  const products = [];
  let cursor = null;
  for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
    const response = await admin.graphql(PRODUCTS_PAGE_QUERY, { variables: { cursor } });
    const { data } = await response.json();
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return products;
}

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });

  const [products, unitsByProduct, settings] = await Promise.all([
    fetchAllProducts(admin),
    getUnitsSoldByProduct(session.shop, shop.ianaTimezone, shop.windowDays),
    prisma.productDisplaySetting.findMany({ where: { shopDomain: session.shop } }),
  ]);
  const settingsByProduct = new Map(settings.map((setting) => [setting.productId, setting]));

  const rows = products
    .map((product) => {
      const setting = settingsByProduct.get(product.id);
      return {
        id: product.id,
        title: product.title,
        status: product.status,
        imageUrl: product.featuredMedia?.preview?.image?.url ?? null,
        imageAlt: product.featuredMedia?.preview?.image?.altText ?? product.title,
        unitsSold: unitsByProduct.get(product.id) ?? 0,
        visible: !setting?.hidden,
        previewUnits: setting?.previewUnits ?? null,
      };
    })
    // Best sellers first: those are the products worth deciding about.
    .sort((a, b) => b.unitsSold - a.unitsSold || a.title.localeCompare(b.title));

  return json({ shop, rows });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "toggle-hide-when-zero") {
    const hideWhenZero = formData.get("hideWhenZero") === "true";
    await prisma.shop.update({ where: { shopDomain: session.shop }, data: { hideWhenZero } });
    return json({ ok: true });
  }

  const productId = normalizeProductId(String(formData.get("productId") ?? ""));
  if (!productId) {
    return json({ error: "invalid productId" }, { status: 400 });
  }

  const key = { shopDomain_productId: { shopDomain: session.shop, productId } };
  const current = await prisma.productDisplaySetting.findUnique({ where: key });
  const next = {
    hidden: current?.hidden ?? false,
    previewUnits: current?.previewUnits ?? null,
  };
  if (intent === "set-visible") next.hidden = formData.get("visible") !== "true";
  if (intent === "set-preview-units") next.previewUnits = parsePreviewUnits(formData.get("previewUnits"));

  // Rows only exist for products that differ from the defaults.
  if (isDefaultSetting(next)) {
    await prisma.productDisplaySetting.deleteMany({ where: { shopDomain: session.shop, productId } });
  } else {
    await prisma.productDisplaySetting.upsert({
      where: key,
      create: { shopDomain: session.shop, productId, ...next },
      update: next,
    });
  }
  return json({ ok: true });
};

const STATUS_BADGES = {
  DRAFT: { tone: undefined, label: "Borrador" },
  ARCHIVED: { tone: undefined, label: "Archivado" },
  UNLISTED: { tone: "info", label: "No listado" },
};

function ProductRow({ row, index }) {
  const fetcher = useFetcher();
  const [previewInput, setPreviewInput] = useState(row.previewUnits?.toString() ?? "");
  useEffect(() => setPreviewInput(row.previewUnits?.toString() ?? ""), [row.previewUnits]);

  // Optimistic: reflect the checkbox immediately while the save is in flight.
  const visible =
    fetcher.formData?.get("intent") === "set-visible" ? fetcher.formData.get("visible") === "true" : row.visible;

  const savePreviewUnits = () => {
    const normalized = parsePreviewUnits(previewInput);
    if (normalized === row.previewUnits) {
      setPreviewInput(row.previewUnits?.toString() ?? "");
      return;
    }
    fetcher.submit(
      { intent: "set-preview-units", productId: row.id, previewUnits: previewInput },
      { method: "post" },
    );
  };

  const statusBadge = STATUS_BADGES[row.status];

  return (
    <IndexTable.Row id={row.id} position={index}>
      <IndexTable.Cell>
        <Checkbox
          label={`Mostrar contador en ${row.title}`}
          labelHidden
          checked={visible}
          onChange={(checked) =>
            fetcher.submit(
              { intent: "set-visible", productId: row.id, visible: String(checked) },
              { method: "post" },
            )
          }
        />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          {row.imageUrl ? (
            <Thumbnail source={row.imageUrl} alt={row.imageAlt} size="small" />
          ) : (
            <Box width="40px" minHeight="40px" background="bg-surface-secondary" borderRadius="200" />
          )}
          <BlockStack gap="050" inlineAlign="start">
            <Text as="span" fontWeight="medium" tone={visible ? undefined : "subdued"}>
              {row.title}
            </Text>
            {statusBadge ? <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge> : null}
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {row.unitsSold.toLocaleString("es-ES")}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Box maxWidth="140px">
          <TextField
            label={`Unidades de prueba para ${row.title}`}
            labelHidden
            type="number"
            min={0}
            max={MAX_PREVIEW_UNITS}
            autoComplete="off"
            placeholder="—"
            disabled={!visible}
            value={previewInput}
            onChange={setPreviewInput}
            onBlur={savePreviewUnits}
            clearButton
            onClearButtonClick={() => {
              setPreviewInput("");
              fetcher.submit(
                { intent: "set-preview-units", productId: row.id, previewUnits: "" },
                { method: "post" },
              );
            }}
          />
        </Box>
      </IndexTable.Cell>
    </IndexTable.Row>
  );
}

export default function Products() {
  const { shop, rows } = useLoaderData();
  const hideWhenZeroFetcher = useFetcher();
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return term ? rows.filter((row) => row.title.toLocaleLowerCase("es").includes(term)) : rows;
  }, [rows, search]);

  const hideWhenZero =
    hideWhenZeroFetcher.formData ? hideWhenZeroFetcher.formData.get("hideWhenZero") === "true" : shop.hideWhenZero;
  const visibleCount = rows.filter((row) => row.visible).length;

  return (
    <Page title="Productos" backAction={{ content: "Inicio", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="p">
                Ventas de los últimos <strong>{shop.windowDays} días</strong> (se cambia en la página de inicio).
                Marca en qué productos se muestra el contador: {visibleCount} de {rows.length} lo muestran.
              </Text>
              <Text as="p" tone="subdued">
                <strong>Unidades de prueba:</strong>{" "}
                {shop.isDevelopmentStore
                  ? "esta es una tienda de desarrollo, así que sustituyen a las ventas reales en todos sus temas."
                  : "sustituyen a las ventas reales solo en el editor de temas y en los temas no publicados (vista previa). En el tema publicado los compradores siempre ven las ventas reales."}{" "}
                Déjalo vacío para usar las ventas reales.
              </Text>
              <Checkbox
                label="Ocultar el contador en los productos con 0 unidades vendidas"
                checked={hideWhenZero}
                onChange={(checked) =>
                  hideWhenZeroFetcher.submit(
                    { intent: "toggle-hide-when-zero", hideWhenZero: String(checked) },
                    { method: "post" },
                  )
                }
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <Box padding="300">
              <TextField
                label="Buscar producto"
                labelHidden
                placeholder="Buscar producto"
                autoComplete="off"
                value={search}
                onChange={setSearch}
                clearButton
                onClearButtonClick={() => setSearch("")}
              />
            </Box>
            <IndexTable
              resourceName={{ singular: "producto", plural: "productos" }}
              itemCount={filteredRows.length}
              selectable={false}
              headings={[
                { title: "Mostrar" },
                { title: "Producto" },
                { title: `Vendidas (${shop.windowDays} días)`, alignment: "end" },
                { title: "Unidades de prueba" },
              ]}
              emptyState={
                <Box padding="400">
                  <Text as="p" tone="subdued" alignment="center">
                    {rows.length === 0 ? "Esta tienda no tiene productos." : "Ningún producto coincide con la búsqueda."}
                  </Text>
                </Box>
              }
            >
              {filteredRows.map((row, index) => (
                <ProductRow key={row.id} row={row} index={index} />
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
