# Dry-run de migración histórica de SFSTORE

> Ejecución de solo lectura. El script no contiene operaciones INSERT, UPDATE, DELETE ni RPC sobre Supabase.

## Fuente

- Archivo: `C:\dev\sfstore\data\SFSTORE_control_emprendimiento_.xlsx`
- Tamaño: 146.826.044 bytes.
- SHA-256: `26c184c27fb8d86835fa1ca47df49c6e3e6dbc0f0a68fa46925fdd065191fcc2`.
- Ventas evaluadas: 131.
- Compras evaluadas: 180.

## Resultado exacto

| Tipo | INSERT | OMIT | REVIEW | INVALID |
|---|---:|---:|---:|---:|
| Ventas | 89 | 0 | 40 | 2 |
| Compras | 166 | 0 | 16 | 0 |

## Estado de preparación

| Estado | Filas |
|---|---:|
| HISTORICAL_PRODUCT_READY | 38 |
| INVALID | 2 |
| POSSIBLE_DUPLICATE | 8 |
| READY | 255 |
| SOURCE_DATE_REQUIRED | 6 |
| TOTAL_REVIEW | 4 |

`HISTORICAL_PRODUCT_READY` conserva la decisión REVIEW: indica que la identidad histórica ya fue resuelta y podrá pasar a INSERT cuando exista el producto archivado.

- Productos distintos en filas INSERT: 148.
- Total de ventas INSERT: $2815384.50.
- Total de compras INSERT: $5562857.70.
- Orders/order_items esperados: 89/89; no se agrupan filas porque el Excel no tiene ID ni hora de venta.
- Purchases/purchase_items esperados: 164/166; cada fila fuente genera una compra, salvo splits humanos que generan varios ítems reconciliados.
- Pagos históricos esperados: 89.
- Mappings pendientes: 0.
- Duplicados potenciales dentro del Excel: 5 grupos de ventas y 0 grupos de compras.
- Candidatos contra operaciones actuales: 0 ventas y 0 compras.

## Splits humanos reconciliados

### Control de compras fila 58: Canasta matera

- Fuente: 2 unidades x $8999.00 = $17998.00.
- Línea 1: 1 x Canasta simil cuero (4d304204-8569-464a-b856-29a84bdee6c8) = $8999.00.
- Línea 2: 1 x Canasta matera 100% cuero (3e33942f-1d42-4b03-b30d-97da131b2cba) = $8999.00.
- Reconciliación: 2 unidades; $17998.00.

### Control de compras fila 142: Porta mate cuero

- Fuente: 3 unidades x $7150.00 = $21450.00.
- Línea 1: 2 x Porta mate cuero Marrón Oscuro (165c4d74-286a-4882-9370-e47001f85e95) = $14300.00.
- Línea 2: 1 x Porta mate cuero Marrón (a2843178-0691-4a35-bb30-b475b3e941ff) = $7150.00.
- Reconciliación: 3 unidades; $21450.00.

## Snapshot de Production consultado

- Productos: 165.
- Proveedores: 1.
- Compras / ítems: 2 / 3.
- Órdenes / ítems / pagos: 3 / 6 / 2.
- Operaciones ejecutadas contra Supabase: exclusivamente SELECT.

## Duplicados actuales en products

### Lattafa Yara rosa

| ID | Nombre | Slug | Status | Stock | Price | Transfer | Cost | Categoría | Atributos | Imágenes | Principal | Creado | Órdenes | Compras |
|---|---|---|---|---:|---:|---:|---:|---|---:|---:|---|---|---:|---:|
| 05b34469-3eb8-4148-8e97-9a19f1c2df6e | Lattafa Yara Rosa | perfume-yara-rosa | active | 1 | 71763.00 | 55257.00 | 32504.00 | Perfumes | 12 | 1 | https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/05b34469-3eb8-4148-8e97-9a19f1c2df6e/1781366716520-img-4921-optimizada.webp | 2026-06-03T03:11:16.595882+00:00 | 0 | 0 |
| f1cb2323-0e7f-49d6-a26f-110595c90e55 | Lattafa Yara Rosa | lattafa-yara-rosa | active | 0 | 87077.92 | 67050.00 | 44700.00 | Perfumes | 12 | 1 | https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/f1cb2323-0e7f-49d6-a26f-110595c90e55/1780979018845-img-4921-optimizada.webp | 2026-06-03T03:11:16.595882+00:00 | 0 | 0 |

El registro 05b34469-3eb8-4148-8e97-9a19f1c2df6e parece el mejor candidato canónico por actividad/referencias/completitud, pero no debe fusionarse sin revisión humana.

- 05b34469-3eb8-4148-8e97-9a19f1c2df6e: commercial_category=arabe; gender=femenino; intensity=media; occasion=diario; olfactory_family=dulce; occasion=salida; olfactory_family=floral; occasion=cita; olfactory_family=frutal; olfactory_family=gourmand; Marca=Lattafa; Tipo=Perfume. Imágenes: https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/05b34469-3eb8-4148-8e97-9a19f1c2df6e/1781366716520-img-4921-optimizada.webp.
- f1cb2323-0e7f-49d6-a26f-110595c90e55: commercial_category=arabe; gender=femenino; intensity=media; occasion=diario; olfactory_family=dulce; occasion=salida; olfactory_family=floral; occasion=cita; olfactory_family=frutal; olfactory_family=gourmand; Marca=Lattafa; Tipo=Perfumes. Imágenes: https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/f1cb2323-0e7f-49d6-a26f-110595c90e55/1780979018845-img-4921-optimizada.webp.

### Lattafa Yara Rosa

| ID | Nombre | Slug | Status | Stock | Price | Transfer | Cost | Categoría | Atributos | Imágenes | Principal | Creado | Órdenes | Compras |
|---|---|---|---|---:|---:|---:|---:|---|---:|---:|---|---|---:|---:|
| 05b34469-3eb8-4148-8e97-9a19f1c2df6e | Lattafa Yara Rosa | perfume-yara-rosa | active | 1 | 71763.00 | 55257.00 | 32504.00 | Perfumes | 12 | 1 | https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/05b34469-3eb8-4148-8e97-9a19f1c2df6e/1781366716520-img-4921-optimizada.webp | 2026-06-03T03:11:16.595882+00:00 | 0 | 0 |
| f1cb2323-0e7f-49d6-a26f-110595c90e55 | Lattafa Yara Rosa | lattafa-yara-rosa | active | 0 | 87077.92 | 67050.00 | 44700.00 | Perfumes | 12 | 1 | https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/f1cb2323-0e7f-49d6-a26f-110595c90e55/1780979018845-img-4921-optimizada.webp | 2026-06-03T03:11:16.595882+00:00 | 0 | 0 |

El registro 05b34469-3eb8-4148-8e97-9a19f1c2df6e parece el mejor candidato canónico por actividad/referencias/completitud, pero no debe fusionarse sin revisión humana.

- 05b34469-3eb8-4148-8e97-9a19f1c2df6e: commercial_category=arabe; gender=femenino; intensity=media; occasion=diario; olfactory_family=dulce; occasion=salida; olfactory_family=floral; occasion=cita; olfactory_family=frutal; olfactory_family=gourmand; Marca=Lattafa; Tipo=Perfume. Imágenes: https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/05b34469-3eb8-4148-8e97-9a19f1c2df6e/1781366716520-img-4921-optimizada.webp.
- f1cb2323-0e7f-49d6-a26f-110595c90e55: commercial_category=arabe; gender=femenino; intensity=media; occasion=diario; olfactory_family=dulce; occasion=salida; olfactory_family=floral; occasion=cita; olfactory_family=frutal; olfactory_family=gourmand; Marca=Lattafa; Tipo=Perfumes. Imágenes: https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/f1cb2323-0e7f-49d6-a26f-110595c90e55/1780979018845-img-4921-optimizada.webp.

### Lattafa Yara Tous

| ID | Nombre | Slug | Status | Stock | Price | Transfer | Cost | Categoría | Atributos | Imágenes | Principal | Creado | Órdenes | Compras |
|---|---|---|---|---:|---:|---:|---:|---|---:|---:|---|---|---:|---:|
| e53066cc-9c35-47e2-8d27-0fe5fb425ce8 | Lattafa Yara Tous | perfume-lattafa-yara-tous | active | 2 | 66349.00 | 51088.00 | 31930.00 | Perfumes | 12 | 2 | https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/e53066cc-9c35-47e2-8d27-0fe5fb425ce8/1781366636539-img-4923-optimizada.webp | 2026-06-03T03:11:16.595882+00:00 | 0 | 0 |
| ef80b721-2c20-466d-8584-a9ab852dd6ca | Lattafa Yara Tous | lattafa-yara-tous | active | 0 | 88207.79 | 67920.00 | 42450.00 | Perfumes | 11 | 0 |  | 2026-06-14T23:05:20.653413+00:00 | 0 | 0 |

El registro e53066cc-9c35-47e2-8d27-0fe5fb425ce8 parece el mejor candidato canónico por actividad/referencias/completitud, pero no debe fusionarse sin revisión humana.

- e53066cc-9c35-47e2-8d27-0fe5fb425ce8: commercial_category=arabe; gender=femenino; intensity=media; occasion=diario; olfactory_family=frutal; occasion=salida; olfactory_family=dulce; occasion=cita; olfactory_family=floral; olfactory_family=gourmand; Marca=SFSTORE; Tipo=Perfume. Imágenes: https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/e53066cc-9c35-47e2-8d27-0fe5fb425ce8/1781366634997-img-4923-optimizada.webp; https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/e53066cc-9c35-47e2-8d27-0fe5fb425ce8/1781366636539-img-4923-optimizada.webp.
- ef80b721-2c20-466d-8584-a9ab852dd6ca: commercial_category=arabe; gender=femenino; intensity=media; occasion=diario; olfactory_family=frutal; occasion=salida; olfactory_family=dulce; occasion=cita; olfactory_family=floral; olfactory_family=gourmand; Tipo=Perfumes. Imágenes: sin imágenes.

## Mappings no resueltos

Los 0 casos pendientes están en `reports/historical-product-mapping-review.csv`. Las sugerencias fuzzy y por tokens son informativas; el Excel transaccional no contiene SKU.

## Ventas problemáticas

Filas de revisión: 51. Incluyen producto sin mapping, ambigüedad, total inconsistente, cero, deuda y duplicados potenciales. El detalle está en `reports/historical-sales-review.csv`.

Los medios observados se pueden mapear conservadoramente: `Efectivo -> cash`, `Transferencia -> transfer`, `Crédito/Débito -> card`. Se conserva siempre el texto original. Una fila con `DEBE` queda en REVIEW y no genera pago.

## Compras problemáticas

Filas de revisión: 37. Las seis filas sin fecha permanecen en REVIEW. El detalle está en `reports/historical-purchases-review.csv`.

Las líneas de compra no contienen proveedor. Las listas auxiliares no pueden asignarse a una operación concreta; el modelo histórico debe permitir `supplier_id = NULL` solo cuando `historical_import=true`.

## Diseño futuro de base de datos

### historical_import_records

Campos propuestos: `id uuid PK`, `import_batch_id uuid`, `source_file text`, `source_file_sha256 text`, `source_sheet text`, `source_row integer`, `fingerprint text`, `record_type text`, `target_table text`, `target_id uuid`, `result text`, `notes text`, `created_at timestamptz`. Restricción única: `(source_file_sha256, source_sheet, source_row, fingerprint)`. RLS habilitado y acceso solo service role.

### purchases

Agregar `historical_import boolean not null default false`, `affects_inventory boolean not null default true`, `import_source text`, `historical_occurred_on date`, `historical_import_record_id uuid unique`. Ampliar status con `historical`. Permitir `supplier_id` y `supplier_name_snapshot` nulos exclusivamente cuando `historical_import=true`. Las compras históricas serán inmutables, no tendrán `confirmed_at` operativo y no usarán `confirm_purchase`.

### orders

Agregar `channel='historical'`, `status='historical'`, `historical_import boolean not null default false`, `affects_inventory boolean not null default true`, `import_source text`, `historical_occurred_on date` y `historical_import_record_id uuid unique`. No usar `complete_store_sale`, `apply_sale_inventory` ni `deliver_order`.

### Defensas

RPCs futuras `import_historical_purchase` e `import_historical_sale`, transaccionales y service-role only. Triggers deben impedir `inventory_movements` y cambios de stock/costo para `affects_inventory=false`. Los registros históricos deben ser inmutables después de insertados.

## Pagos históricos

Crear `order_payments` solo cuando el medio esté presente, sea mapeable y no exista deuda informada. Mantener el texto fuente en metadata/notas. Para filas sin evidencia suficiente, no inventar pago y usar `payment_status='unknown'`, valor que requerirá ampliación explícita del constraint. No usar `other` como relleno.

## Fechas

La fecha fuente se conserva en `historical_occurred_on date`. Si se necesita `created_at timestamptz` histórico, derivarlo a las 12:00:00 de `America/Argentina/Buenos_Aires`; el campo `date` sigue siendo la fuente autoritativa para evitar cambios de día por UTC.

## Invariantes obligatorias para una ejecución futura

Antes y después del lote deben ser idénticos:

- hash ordenado de `products(id, stock)` y suma global de stock;
- hash ordenado de `products(id, cost, cost_source_purchase_item_id)`;
- cantidad y hash ordenado completo de `inventory_movements`;
- ninguna llamada a `confirm_purchase`, `complete_store_sale`, `apply_sale_inventory` o `deliver_order`;
- cantidad de mappings aprobados igual a la cantidad de nombres no deterministas que se pretende insertar.

## Condiciones antes de implementar

1. No quedan mappings de identidad pendientes; conservar las decisiones humanas versionadas.
2. Resolver las filas de ventas/compras en REVIEW e INVALID.
3. Aprobar el modelo `historical`, la nulabilidad acotada de proveedor y `payment_status='unknown'`.
4. Crear y revisar una migration versionada; no aplicar SQL improvisado.
5. Repetir este dry-run contra el snapshot inmediato de Production antes de cualquier escritura.
