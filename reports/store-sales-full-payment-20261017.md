# Ventas físicas — Fase 1 (2026-10-17)

Rama: `codex/store-sales-full-payment-20261017`. Base: `360b6d9ffd789775ee4f0014c6dffc7dcb80a262`.
Alcance: desarrollo local, sin conexión ni modificación de Production, sin commit/push/merge/deploy.

## Contrato comercial

- Nuevas ventas físicas: uno o varios productos y pagos, siempre cobro completo y exacto. No se confirman saldos, cero pagos ni excedentes.
- Todos los medios cash/transfer: 25% desde products.price. Cualquier debit/credit/qr/other: lista para toda la venta. No se toma transfer_price almacenado.
- Redondeo por unidad a dos decimales, como el checkout online; luego se multiplica por cantidad. Ejemplo: lista 100.01, tres unidades -> 225.03 cobrados, subtotal 300.03, descuento 75.00. No redondear una segunda vez el 25% del subtotal global.
- El precio mostrado es una vista previa; PostgreSQL vuelve a leer y bloquea los productos. El unit_price recibido sólo detecta vistas desactualizadas o manipuladas. Cambio de precio: rechazo sin registros, recargar y revisar.
- Una RPC contiene pedido, líneas, pagos, snapshots y descuento de stock. Los fallos revierten todo. Mismos argumentos y clave devuelven la venta congelada; cambios de argumentos o actor generan conflicto.
- Se reutilizan create_store_sale, record_order_payment, complete_store_sale y apply_sale_inventory. Nuevas ventas llaman create_store_sale_atomic; las funciones inferiores no son endpoints públicos y permanecen service-role only.
- Pedidos físicos antiguos pendientes/parciales se conservan y mantienen su circuito anterior de cobro. No se convierten ni completan automáticamente. Las nuevas ventas siempre nacen pagadas.

## SQL candidato (no aplicado a Production)

`supabase/migrations/202610170001_store_sales_full_payment.sql`:

1. Agrega order_items.list_unit_price_snapshot y unit_cost_snapshot NUMERIC(12,2), nullable para filas antiguas y online; no hace backfill.
2. Agrega order_payments.store_payment_method para el detalle de mostrador. El libro compartido conserva method=card para débito/crédito y method=other para QR; el detalle permite distinguirlos sin alterar CHECKs ni RPC de pagos online.
3. Reemplaza sólo create_store_sale_atomic, misma firma y SECURITY INVOKER/search_path fijo. Mantiene EXECUTE exclusivo de service_role. No cambia RLS ni grants CRUD existentes, no toca configuración web, Auth, Storage, Cron o datos comerciales preexistentes.
4. DDL transaccional con lock_timeout 2s y statement_timeout 20s. Ante columnas existentes/diferencias o fallo, rollback; no reintentar automáticamente.

Costo histórico: congela products.cost vigente bajo el mismo bloqueo del producto. NULL significa desconocido; nunca se interpreta como costo cero ni se reconstruyen costos antiguos con valores actuales. El detalle avisa cuando falta. La política es costo vigente al vender, no FIFO ni promedio ponderado. No incluye comisiones ni gastos y no implementa todavía métricas de utilidad.

El manifiesto y las copias generadas de staging se actualizan con el generador existente, sólo para bases locales nuevas. No representan un historial productivo ni autorizan aplicar todas las migraciones. La colisión histórica queda intacta.

## Verificación

- Instalación reproducible: npm ci --ignore-scripts. No cambió package.json/package-lock.json. npm informó 9 avisos de dependencias (1 moderado, 8 altos); no se aplicó audit fix ni se evaluaron como resueltos.
- Integración real: contenedor PostgreSQL 17.6 nuevo, puerto aleatorio ligado sólo a 127.0.0.1, almacenamiento temporal, roles/filas sintéticas. No utiliza URL, variables ni credenciales productivas ni Supabase local existente. El contenedor se detiene y elimina al terminar.
- Casos: pagos simples y combinados, centavos, transferencia almacenada inconsistente, saldos/excedentes/cero/negativos/precisión inválida, precio desactualizado, snapshots y reintentos, faltante de stock, pedidos simultáneos con igual/distinta clave, fallo posterior al pago y rollback, permisos públicos denegados, competencia con reserva online y contrato web intacto.
- UI real: React compilado con Webpack de Next; Edge headless móvil/escritorio. Acciones sustituidas por mocks, servidor loopback, tráfico externo bloqueado. Comprueba cambio de precio por medio, bloqueo por saldo, feedback y misma clave de reintento. No certifica una sesión Auth real.
- Build local aprobado; TypeScript y ESLint se registran con el cierre. ESLint mantiene 9 warnings preexistentes de imágenes, sin errores.
- Pruebas opcionales anteriores que dependen de Supabase/Auth/Storage configurados o binarios locales PG no se cuentan como aprobadas si se omiten. La nueva integración PG sí se ejecuta explícitamente.

## Integración y límites

Se requiere revisión y autorización separada para la migración y despliegue. Aplicar el contrato antes de publicar el nuevo formulario: el código necesita las tres columnas nuevas. Pestañas antiguas pueden recibir rechazo de precio/medio y deben recargarse; no conservarlas como vía alternativa de venta con saldo.
No borrar snapshots ni pagos para revertir. Ante problema, detener el alta de nuevas ventas físicas, preservar las ya cobradas y corregir hacia adelante; el checkout online conserva su operación. No desplegar automáticamente un contrato comercial anterior.
No se ejecutaron ventas reales ni transferencias. No se alteró catálogo, costo o stock existente. No se implementaron estadísticas, compras nuevas, devoluciones ni otras fases.

## Resultados finales

- Suite completa: 781 tests, 770 aprobados, 0 fallidos, 11 omitidos. Incluye 30 casos nuevos de integración real en PostgreSQL 17.6. Las suites opcionales sin SFSTORE_TEST_PG_BIN/URLs/credenciales de Supabase no se ejecutaron; no se certifican por estos números.
- Prueba UI adicional habilitada expresamente: 1 test aprobado, 0 fallos, recorre móvil y escritorio con React real, acciones mock y sin red externa. En la suite completa figuró omitida por ausencia de su variable opcional; se ejecutó separadamente.
- TypeScript después del build: aprobado. Build de producción local: aprobado. ESLint: 0 errores, 9 warnings preexistentes de next/no-img-element.
- Gitleaks 8.30.1 sobre los 15 archivos cambiados: sin hallazgos. git diff --check: aprobado.
- Ningún contenedor con label sfstore.synthetic=store-sales quedó activo. No se tocaron contenedores ni volúmenes preexistentes.

Comandos: `npm ci --ignore-scripts`; `node scripts/prepare-checkout-staging.mjs`; `node --test --test-concurrency=2 --test-reporter=spec tests/*.test.mjs` con SFSTORE_TEST_DOCKER apuntando al ejecutable local; `node --test tests/store-sales-full-payment-browser.test.mjs` con SFSTORE_TEST_PLAYWRIGHT_MODULE apuntando al Playwright disponible; `npm run build`; `npx tsc --noEmit`; `npm run lint`; Gitleaks dir con --redact sobre copia temporal de los archivos cambiados; `git diff --check`.

Archivos funcionales: app/admin/ventas/actions.ts, components/admin/sales/store-sale-form.tsx, lib/store-sales.ts, services/store-sales.ts, app/admin/ventas/[id]/page.tsx. SQL: la nueva migración indicada. Soporte: staging/migration-manifest.json; tests de pagos nuevos unitarios/PostgreSQL/browser y tres expectativas de regresión/staging actualizadas; este informe y docs/DEVELOPMENT_BACKLOG.md.

Riesgos pendientes para integrar: revisión del SQL y aplicación autorizada antes del nuevo código; recarga de formularios antiguos; costos ausentes permanecerán NULL; no se ha certificado un ciclo UI+Auth+PostgREST integrado contra Supabase para esta nueva fase. No hay commit ni publicación.


## Cierre Fase 1B

El pendiente de integración UI + Auth + PostgREST quedó cubierto el 2026-10-17 con 12/12 pruebas reales locales, sin mocks de la aplicación/RPC y sin cambios funcionales adicionales. Ver [aceptación integrada y límites](store-sales-integrated-validation-20261017.md). No se aplicó SQL en Production ni se integró o publicó esta rama.
