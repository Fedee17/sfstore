# Arquitectura actual

Referencia: main `7a8a105`, 2026-10-10. Leer [auditoría](PROJECT_AUDIT_2026-10-10.md) para distinguir pruebas locales de operación real.

## Stack y organización

Next.js 16.2.7 App Router, React 19.2.4, TypeScript, Tailwind CSS 4 y ESLint 9. Supabase JS + SSR, Mercado Pago SDK, Zustand, `xlsx`, normalización HEIC y compresión de imágenes. Node usado para validar: 24.19.0; esto no prueba la versión configurada en hosting.

| Directorio | Responsabilidad |
| --- | --- |
| `app/` | Páginas, layouts, Server Actions, APIs, metadata, robots y sitemap. |
| `components/` | UI pública y formularios administrativos/clientes. |
| `services/` | Consultas y escrituras Supabase; coordinación de RPC y servicios externos. |
| `lib/` | Políticas, cálculo, normalización, autorización, motor de recomendaciones e importación. |
| `store/` | Carrito local persistido. |
| `data/` | Catálogo de respaldo y artefactos históricos de importaciones/atributos. No usar como fixtures mutables de Production. |
| `supabase/` | Esquema inicial, seed, migrations y guía Storage. El esquema inicial no representa por sí solo la DB evolucionada. |
| `scripts/` | Auditorías, exports e importaciones; varios escriben datos. Inspeccionar antes de ejecutar. |
| `tests/` | Node test runner: unidades, contratos por código fuente, PostgreSQL aislado y formulario React en navegador. |
| `docs/`, `reports/` | Documentación y evidencia histórica; no prueban estado actual del entorno real. |

## Rutas

Públicas: `/`, `/perfumes`, `/mates`, `/producto/[slug]`, `/carrito`, `/checkout`, `/checkout/exito`, `/checkout/pendiente`, `/checkout/fallo`; metadata `/robots.txt` y `/sitemap.xml`.

Admin: `/admin`, `/admin/login`, `/admin/consulta`, `/admin/configuracion`, `/admin/analytics`, `/admin/inventario`; productos (listado, nuevo, `[id]/editar`, importar), proveedores (listado, nuevo, `[id]`, `[id]/editar`), compras (listado, nueva, `[id]`, `[id]/editar`), pedidos (listado, nuevo, `[id]`, `[id]/editar`) y ventas (listado, nueva, `[id]`). No hay editor de ventas en la lista de rutas.

APIs POST: `/api/mercadopago/create-preference`, `/api/mercadopago/webhook`, `/api/integrations/google-sheets/product-sync`. El webhook rechaza GET con 405. No inferir autorización de estas APIs a partir del login admin.

## Límites de confianza

`lib/supabase/client.ts` usa URL y anon key públicas para catálogo y checkout. `lib/supabase/auth-server.ts` usa SSR/cookies y `auth.getUser()`. `lib/admin-session.ts` comprueba además `ADMIN_ALLOWED_EMAILS`; vacío deniega. `ADMIN_EMAIL` no es fallback en la implementación actual.

`lib/supabase/server.ts` crea cliente service_role para trabajo servidor. Ese rol exige que la página/acción/API valide su propio acceso. `app/admin/layout.tsx` es passthrough; los guards están en páginas/acciones, no en una frontera central del layout. Servicios administrativos no sustituyen esa autorización.

El esquema inicial contiene categorías, productos, imágenes, atributos, clientes, pedidos/items, settings, movimientos y analytics_events. Migrations agregan proveedores/compras, libro de pagos, canales, operaciones de inventario, importaciones históricas y guardado de productos/tareas Storage. RPC críticas se restringen a service_role; varias tablas nuevas habilitan RLS. No hay definición completa de políticas para las tablas públicas originales en `schema.sql`, ni evidencia de los grants efectivos actuales de Production.

## Flujos comprobados por código

- Lectura pública: Supabase → mapeo/visibilidad → UI; error/vacío → catálogo de respaldo. Perfumes tiene sección propia; otras categorías activas se agrupan en Mates.
- Producto admin: guard → validación/plan de imágenes → preparar operación → upload → RPC create/update atómica con versión → recuperación o encolado. PostgreSQL y Storage son dominios separados; no hay transacción distribuida.
- Consulta perfumes: guard → catálogo real admin → preferencias normalizadas → ranking/grupos → razones en UI. No hay llamada a LLM.
- Compras/ventas/pedidos admin: guard → servicios → RPC para operaciones atómicas relevantes (confirmación, venta, guardado/entrega, inventario) → libro de movimientos/pagos. No homogeneizar contratos diferentes mediante un refactor general.
- Checkout web: browser/carrito → inserts anon separados de cliente, pedido e items → API preferencia MP. La API toma precios de esos items guardados, cuya creación no es autoritativa desde servidor.
- Webhook: notificación → consulta Payment a MP → registro de pago/referencia → actualización pedido → inventario. Hay pasos separados; fallo de stock puede responder `ok` con resultado de fallo. El ledger tiene idempotencia, pero no prueba atomicidad del flujo completo.
- Sheets: Bearer secreto con comparación timing-safe, JSON limitado a 256 KiB y 1–30 filas → importador. Es un escritor externo de datos reales y requiere controles operativos.

## Despliegue y deuda de documentación

`next.config.ts` configura redirects Yara, orígenes de desarrollo y Server Actions hasta 8 MB. No se observó workflow CI versionado en `.github`; no se verificó conexión activa de Vercel. `README.md` es boilerplate. `supabase/storage.md` describe un flujo antiguo de imagen principal, mientras el guardado actual soporta un plan de galería: consultar código/tests antes de cambiarlo. Documentos anteriores se conservan como antecedentes.
