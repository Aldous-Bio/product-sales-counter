import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import prisma from "../db.server";
import { PRODUCTS_PAGE_QUERY } from "../graphql/products";
import { MAX_PREVIEW_UNITS, parsePreviewUnits } from "../services/productDisplay";
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

  const productId = normalizeProductId(String(formData.get("productId") ?? ""));
  if (!productId) {
    return json({ error: "invalid productId" }, { status: 400 });
  }

  const data = {};
  if (intent === "set-visible") data.hidden = formData.get("visible") !== "true";
  if (intent === "set-preview-units") data.previewUnits = parsePreviewUnits(formData.get("previewUnits"));

  if (Object.keys(data).length > 0) {
    await prisma.productDisplaySetting.upsert({
      where: { shopDomain_productId: { shopDomain: session.shop, productId } },
      create: { shopDomain: session.shop, productId, ...data },
      update: data,
    });
  }
  return json({ ok: true });
};

const STATUS_BADGES = {
  DRAFT: { tone: "neutral", label: "Borrador" },
  ARCHIVED: { tone: "neutral", label: "Archivado" },
  UNLISTED: { tone: "info", label: "No listado" },
};

function ProductRow({ row }) {
  const fetcher = useFetcher();
  const [previewInput, setPreviewInput] = useState(row.previewUnits?.toString() ?? "");
  useEffect(() => setPreviewInput(row.previewUnits?.toString() ?? ""), [row.previewUnits]);

  const savePreviewUnits = (value) => {
    if (parsePreviewUnits(value) === row.previewUnits) {
      setPreviewInput(row.previewUnits?.toString() ?? "");
      return;
    }
    fetcher.submit({ intent: "set-preview-units", productId: row.id, previewUnits: value }, { method: "post" });
  };

  // Optimistic: reflect the checkbox immediately while the save is in flight.
  const visible =
    fetcher.formData?.get("intent") === "set-visible" ? fetcher.formData.get("visible") === "true" : row.visible;

  const statusBadge = STATUS_BADGES[row.status];

  return (
    <s-table-row>
      <s-table-cell>
        <s-checkbox
          accessibilityLabel={`Mostrar contador en ${row.title}`}
          checked={visible}
          onChange={(event) =>
            fetcher.submit(
              { intent: "set-visible", productId: row.id, visible: String(event.currentTarget.checked) },
              { method: "post" },
            )
          }
        />
      </s-table-cell>
      <s-table-cell>
        <s-stack direction="inline" gap="small" alignItems="center">
          {/* Without src it renders the empty-image placeholder. */}
          <s-thumbnail src={row.imageUrl ?? undefined} alt={row.imageAlt} size="small" />
          <s-stack gap="small-500">
            <s-text fontWeight="medium" color={visible ? "base" : "subdued"}>
              {row.title}
            </s-text>
            {statusBadge ? (
              <s-stack direction="inline">
                <s-badge tone={statusBadge.tone}>{statusBadge.label}</s-badge>
              </s-stack>
            ) : null}
          </s-stack>
        </s-stack>
      </s-table-cell>
      <s-table-cell>{row.unitsSold.toLocaleString("es-ES")}</s-table-cell>
      <s-table-cell>
        <s-box inlineSize="120px">
          <s-number-field
            label={`Unidades simuladas para ${row.title}`}
            labelAccessibilityVisibility="exclusive"
            min={0}
            max={MAX_PREVIEW_UNITS}
            inputMode="numeric"
            autocomplete="off"
            placeholder="—"
            value={previewInput}
            onInput={(event) => setPreviewInput(event.currentTarget.value)}
            onBlur={(event) => savePreviewUnits(event.currentTarget.value)}
          />
        </s-box>
      </s-table-cell>
    </s-table-row>
  );
}

export default function Products() {
  const { shop, rows } = useLoaderData();
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return term ? rows.filter((row) => row.title.toLocaleLowerCase("es").includes(term)) : rows;
  }, [rows, search]);

  const visibleCount = rows.filter((row) => row.visible).length;

  return (
    <s-page heading="Productos">
      <s-link slot="breadcrumb-actions" href="/app">
        Inicio
      </s-link>

      <s-section>
        <s-paragraph>
          Ventas de los últimos <s-text type="strong">{shop.windowDays} días</s-text> (se cambia en la página de
          inicio). Puedes marcar en qué productos se muestra el contador: {visibleCount} de {rows.length} lo
          muestran.
        </s-paragraph>
      </s-section>

      <s-section padding="none" accessibilityLabel="Productos">
        <s-table>
          <s-search-field
            slot="filters"
            label="Buscar producto"
            labelAccessibilityVisibility="exclusive"
            placeholder="Buscar producto"
            autocomplete="off"
            value={search}
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
          <s-table-header-row>
            <s-table-header listSlot="inline">Mostrar</s-table-header>
            <s-table-header listSlot="primary">Producto</s-table-header>
            <s-table-header listSlot="labeled" format="numeric">
              Vendidas ({shop.windowDays} días)
            </s-table-header>
            <s-table-header listSlot="labeled">Unidades simuladas</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {filteredRows.map((row) => (
              <ProductRow key={row.id} row={row} />
            ))}
          </s-table-body>
        </s-table>
        {filteredRows.length === 0 ? (
          <s-box padding="base">
            <s-paragraph color="subdued">
              {rows.length === 0 ? "Esta tienda no tiene productos." : "Ningún producto coincide con la búsqueda."}
            </s-paragraph>
          </s-box>
        ) : null}
      </s-section>
    </s-page>
  );
}
