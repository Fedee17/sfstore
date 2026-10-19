# Variantes — Fase 2: integración comercial local (2026-10-18)

## Resultado y alcance

Implementación en `codex/product-variants-admin-20261018`, conservando la Fase 1, sobre base publicada `e1fa0de237c3dec1e246a71f4a72793e2f5848ed`. APTO para revisión y preparación de publicación, condicionado a revisar/aplicar los dos deltas y desplegar el código de forma coordinada, con autorización posterior. No se modificó Production, no se crearon commits ni se hizo push, merge o despliegue.

Las familias son publicaciones sin stock; cada operación sigue usando `products.id`. No hay un segundo contador, reservas manuales ni reinterpretación del historial.

## Implementación

- Catálogo y sitemap agrupan una sola publicación por familia. Búsqueda incluye opciones de variantes. La ficha requiere seleccionar un SKU, actualiza imágenes, precio de lista, transferencia al 25% y disponibilidad. Los productos simples conservan su recorrido. El precio «Desde» corresponde al SKU disponible más barato; no invita a comprar una opción agotada al precio mínimo de otra.
- Carrito persiste ID y etiqueta del SKU, conserva filas independientes y migra el formato anterior sin inventar variantes. No acepta una familia como producto. Checkout recibe sólo el ID y cantidad del contrato existente y valida precio/disponibilidad en el servidor.
- Compras y ventas reutilizan selectores/formularios/RPC. Las etiquetas distinguen familia, opciones y SKU. Compras admiten variantes en borrador para poder recibirlas antes de publicarlas; no habilitan productos simples en borrador nuevos. Mostrador admite SKU ocultos en web y excluye bloqueados. El cobro completo y la regla global efectivo/transferencia al 25% permanecen intactos.
- Las líneas nuevas guardan snapshots de familia/opciones/SKU. La constancia del comprador muestra las líneas sólo después de verificar al propietario del pedido. Los comprobantes bancarios y sus controles privados no fueron modificados.
- Analytics agrupa por familia documentada y desglosa variantes. Las líneas antiguas sin snapshot permanecen separadas como «Sin familia documentada», aunque el producto actual se haya asociado después. No se infieren costos ni se duplican cabeceras por pagos/líneas.
- Excel y Google Sheets envían a revisión las filas que coinciden con SKU de variante o con una publicación de familia. No sobrescriben precios heredados, stock ni opciones mediante formatos genéricos que no expresan esa intención. Los productos simples conservan el importador; el UPDATE exige que sigan sin familia y confirma una fila afectada, evitando carreras de asociación. La edición masiva de variantes desde esos formatos queda fuera de esta fase.

## SQL preparado, no aplicado a Production

1. `supabase/migrations/202610180001_product_families_variants.sql`: Fase 1 preservada byte por byte. SHA-256 `9c4fb12a61338303e39c6e43d1966c89c2d1c2ac4ca96f10266ce9f6f73832ca`.
2. `supabase/migrations/202610180002_variant_commercial_integration.sql`: SHA-256 `bfa31ef392a2fc1ea16b7caaafee0ae27935433880f2ac055b318ddc494bef04`.

El segundo delta añade etiqueta comercial y snapshots, triggers de nuevas líneas, guardas de colisión de identidad/slug y la vista pública explícita `public_catalog_skus`. Sus funciones son SECURITY INVOKER con search_path fijo. La vista tiene semántica de propietario y security_barrier: lee definiciones privadas de opciones, pero sólo expone una proyección fija de SKU activos, visibles, no históricos, no bloqueados y de categoría activa. No expone costos ni otorga nuevas escrituras públicas. Debe revisarse esta proyección como frontera de publicación, no asumir que usa las políticas del llamador.

Existe un backfill exclusivamente de `commercial_label` para productos ya asociados; puede avanzar su updated_at. No modifica precios, costos, stock ni líneas históricas. Las RPC operativas de compra, venta, checkout, acreditación y liberación conservan cuerpos y ACL. Las reservas previas se verificaron antes/después de aplicar 002 en el ensayo descartable.

## Validación ejecutada

| Validación | Resultado |
| --- | --- |
| Suite completa `SFSTORE_TEST_DOCKER=... node --test --test-reporter=tap tests/*.test.mjs` | 877 pruebas: 864 PASS, 0 FAIL, 13 SKIP opt-in |
| PostgreSQL 17.6 comercial específico | 9/9 PASS, incluido último SKU concurrente mostrador/online |
| PostgreSQL Fase 1 | 21/21 PASS |
| Modelo público/carrito/Analytics específico | 4/4 PASS |
| Next compilado + navegador + Auth local + PostgREST + PG17.6 aislado | 11 escenarios PASS (12 entradas con el contenedor de prueba), sin omisiones |
| Build de producción | PASS |
| TypeScript `npx tsc --noEmit` | PASS |
| ESLint | 0 errores; 9 advertencias no bloqueantes de imágenes `<img>` |

La integración real navegó catálogo → elección de dos SKU → carrito → checkout → creación → constancia. El reintento HTTP devolvió el mismo pedido sin segundo descuento de stock. También creó/recibió una compra con dos variantes y una venta física con pago combinado. Se verificaron fotos, precios y selección en 1366×900 y 390×844; evidencias privadas en `staging/runtime/variants-integration/`.

La sesión de comprador de este ensayo es una sesión sintética verificada por OTP de Auth local, equivalente a comprador que regresa; CAPTCHA quedó habilitado. No certifica una nueva resolución de Turnstile real, ni volvió a subir un comprobante binario o realizar una acreditación bancaria. Los tests existentes cubren sus contratos sin cambios. Los usuarios sintéticos temporales de Auth se retiraron; PG/PostgREST y redes del ensayo fueron descartados. No se alteró la base de checkout local existente.

Las pruebas SQL cubren pagos combinados, costo exacto, bloqueo/visibilidad por canal, simple sin familia, reservas preexistentes, confirmación/cancelación idempotentes, rollback de precios, colisiones y permisos de la vista. El piloto es sintético; no se agrupó ni repartió stock del producto real Termo Stanley.

## Archivos y contratos

- Catálogo: `services/products.ts`, `lib/products/public-families.ts`, `types/product.ts`, `lib/catalog/search.ts`, `app/sitemap.ts`.
- UI pública: `components/product-family-detail.tsx`, `components/product-grid.tsx`, `components/add-to-cart-button.tsx`, `app/producto/[slug]/page.tsx`, `store/cart-store.ts`.
- Operación y constancia: `services/purchases.ts`, `services/store-sales.ts`, `services/checkout-server.ts`, `services/checkout-buyer-receipt.ts`, `app/checkout/exito/page.tsx`.
- Reportes: `lib/commercial-reporting/{contracts,reader,analytics}.ts`, `app/admin/analytics/page.tsx`.
- Integraciones: `services/product-import.ts`; administración Fase 1 preservada y revalidación de búsqueda/sitemap en `services/product-families.ts`.
- SQL/manifest: delta 002 y `staging/migration-manifest.json`; se conserva delta 001 y sus pantallas/servicios de Fase 1.
- Tests nuevos/extensiones: `tests/product-variants*.test.mjs` y expectativas de lectores públicos, constancia, staging y selectores de compras. No se modificaron dependencias.

## Preparación de publicación y límites

1. Revisar el diff acumulado Fase 1+2 y autorizar por separado SQL/código. Confirmar esquema real, rol ejecutor, respaldo y ausencia de colisiones de slug/ID. No usar un replay automático del historial de migraciones.
2. Aplicar 001 y luego 002 antes del código consumidor, en ventana autorizada. Ambos deltas son transaccionales con timeouts; ante fallo comprobar rollback y detenerse. No distribuir stock de productos existentes automáticamente.
3. Mantener nuevos SKU en borrador hasta preparar opciones, fotos, precios y recepción. Publicación comercial requiere conciliación explícita del piloto real.
4. Desplegar candidato revisado, renovar pestañas administrativas y comprobar catálogo/selección/carrito antiguo y nuevo, recepción y venta sin alterar datos reales para pruebas. Ante fallo mantener SKU nuevos ocultos y detener su publicación; no retirar columnas/snapshots para revertir a ciegas.

El lector público pagina por clave hasta página vacía (200 solicitados, máximo 500 páginas); falla explícitamente ante error o exceso, sin devolver un catálogo parcial. No se certificó rendimiento con cien mil SKU o carga masiva concurrente. El bloqueo asesor breve de configuración de Fase 1 permanece; stock no toma ese bloqueo global. Los errores de contención se deben informar y reintentar conscientemente, no publicar un éxito parcial.

Los 13 skips de la suite general corresponden a arneses que exigen configuración explícita; el arnés específico de variantes sí se ejecutó por separado. La disponibilidad y privacidad de servicios gestionados en Production requieren su revisión de lanzamiento posterior. No se afirma que la funcionalidad esté publicada.
