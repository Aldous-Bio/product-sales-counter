# AGENTS.md

Guía para cualquier agente de IA (o humano) que vaya a trabajar en este repo.

## Qué es esto

Una app de Shopify que muestra "N unidades vendidas en los últimos 30 días"
en la página de producto de la tienda. Multi-tenant: una sola instancia de
backend sirve a todas las tiendas que instalen la app, sin IDs de tienda ni
de producto hardcodeados en ningún sitio.

Dos piezas separadas, no las mezcles:

1. **Backend Remix** (`app/`, `prisma/`) — el único sitio con acceso a la
   Admin GraphQL API. Lee pedidos/reembolsos, calcula ventas netas, las
   guarda en Postgres, expone un endpoint vía App Proxy.
2. **Theme App Extension** (`extensions/product-sales-counter/`) — solo
   pinta el bloque en la ficha de producto y le pide el número ya calculado
   al backend. **Nunca** debe consultar la Admin API ni tocar sales data
   directamente — Liquid no puede, y el JS del frontend tampoco debe
   intentarlo (nada de tokens de Admin API en el navegador).

## Lenguaje: JavaScript, no TypeScript

Todo el repo está en JS (`.js`/`.jsx`), sin TypeScript. Es una decisión
explícita para mantener consistencia con el resto de apps de la
organización — no reintroduzcas `.ts`/`.tsx`, `tsconfig.json`, ni
dependencias de `@types/*` o `typescript` sin que te lo pidan
explícitamente.

## Antes de tocar código

1. Lee `README.md` primero — tiene la arquitectura, el modelo de datos, la
   definición exacta de la métrica de ventas, y las diferencias con
   Analytics.
2. Antes de usar cualquier campo o query de la Admin GraphQL API, comprueba
   que existe de verdad en la versión estable actual (ahora mismo
   `2026-07`, ver `[webhooks] api_version` en `shopify.app.toml`). No te
   inventes nombres de campos — búscalos en shopify.dev.
3. Este proyecto usa `read_orders` y `read_products` (este último porque
   `LineItem.product` lo exige, aunque no tocamos datos de producto por
   ningún otro motivo). Si necesitas un scope nuevo, justifícalo
   explícitamente antes de añadirlo — la app no debe pedir permisos que no
   usa.

## Reglas de la lógica de negocio (no las rompas sin darte cuenta)

- La métrica de ventas está definida con detalle en `README.md` →
  "Sales metric definition". Resumen: ventana de 30 días de calendario en
  la zona horaria de la tienda (no UTC), pedidos `PAID` /
  `PARTIALLY_REFUNDED` / `REFUNDED`, excluye cancelados/tarjetas
  regalo/line items sin producto, usa `LineItem.currentQuantity` (ya viene
  neto de reembolsos por la propia API, no lo recalcules a mano).
- La idempotencia se apoya en `OrderProductDay` con clave única
  `(shopDomain, orderId, productId)`: cada escritura (webhook, backfill,
  reconciliación) **reescribe** la fila entera con el estado actual de la
  orden vía GraphQL, nunca suma/incrementa. Si tocas `orderSync.server.js`
  o `backfill.server.js`, mantén ese patrón — es lo que garantiza que un
  webhook duplicado no infle el contador.
- No se guarda ningún dato personal de clientes. Si añades un campo nuevo a
  `OrderProductDay` o `Shop`, comprueba que sigue siendo así.
- Los mensajes al comprador se traducen en el backend
  (`app/i18n/messages.js`), nunca en Liquid. Si añades un idioma, añade una
  entrada `{ one, other }` al catálogo — no hardcodees el texto en el
  bloque de tema.

## Base de datos

Postgres (no SQLite — se cambió deliberadamente, ver historial). El schema
vive en `prisma/schema.prisma`. No hay migraciones formales: el flujo es
`prisma generate && prisma db push` (script `npm run setup`, que también se
ejecuta automáticamente en `npm start` antes de levantar el servidor). Si
en algún momento se necesita historial de migraciones de verdad
(`prisma migrate dev`/`deploy`), coméntalo explícitamente antes de
cambiarlo, porque afecta al flujo de despliegue en Coolify.

## Tests

`npm test` (Vitest). Antes de dar por terminado cualquier cambio en
`app/services/*.server.js`, `app/i18n/messages.js` o
`app/routes/proxy.sold-count.jsx`:

- Corre `npm test` y `npm run lint` — ambos deben quedar en verde.
- Si tocas la lógica de cálculo de ventas, añade o actualiza tests: el
  archivo `app/services/salesAggregator.test.js` es la referencia de qué
  escenarios hay que cubrir (variantes múltiples, cancelaciones,
  reembolsos parciales/totales, línea de producto ausente, tarjetas
  regalo, idempotencia).
- Los tests son deliberadamente puros donde es posible (sin mockear
  Prisma) — si necesitas tocar una ruta que sí requiere mocks (ver
  `app/routes/proxy.sold-count.test.js`), sigue ese mismo patrón de
  `vi.mock`.

## Despliegue

Se despliega en Coolify (no Vercel/Fly/Render — ver `README.md` para
detalles de variables de entorno). El comando `start` ya encadena
`npm run setup` antes de arrancar el servidor. `shopify.app.toml` necesita
`application_url` y `[app_proxy].url` apuntando a la URL real de Coolify —
si cambias esa URL, hay que correr `shopify app deploy` para que Shopify lo
sepa (una variable de entorno no le dice nada a Shopify por sí sola).

## Qué NO hacer

- No añadas TypeScript.
- No hagas que el bloque de tema consulte la Admin API o Analytics
  directamente.
- No cambies el modelo de idempotencia de `OrderProductDay` a uno aditivo
  (incrementos) sin discutirlo — es la garantía anti-duplicados de todo el
  sistema.
- No añadas scopes de OAuth "por si acaso".
- No optimices prematuramente el backfill/reconciliación con Bulk
  Operations salvo que el volumen de pedidos de una tienda real lo
  justifique — la paginación simple actual (`app/graphql/orders.js`) es
  intencionadamente simple.
