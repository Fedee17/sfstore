# Supabase Storage para imágenes de productos

Referencia de código: main y rama local de mantenimiento, 2026-10-10. Esta guía no autoriza crear/modificar buckets, policies, datos reales ni aplicar migrations. Validar contratos con fixtures y un entorno de pruebas separado; cambios de Production requieren aprobación explícita.

## Bucket y URLs

El servicio usa `product-images` (`PRODUCT_IMAGES_BUCKET`). La tienda consume URLs públicas guardadas en `product_images`. La configuración efectiva y permisos del bucket real no se verificaron en esta fase; un bucket público no autoriza uploads o borrados anónimos. No ampliar policies para solucionar un error de pruebas.

## Guardado actual

`services/product-save.ts` coordina uploads y RPC create/update atómicas con versión e idempotencia. El formulario administra una galería con `sort_order` e `is_primary`, no solo una imagen principal. Los uploads usan rutas debajo de `products/[productId]/` y validan contenido/MIME/tamaño en reintentos; no asumir el antiguo nombre `main-[timestamp]` como contrato actual.

El procesamiento de archivos acepta JPEG, PNG, WebP y entradas HEIC/HEIF; el formulario normaliza/comprime para upload en WebP o JPEG. Mantener validaciones de `lib/products/product-image-files.ts` y feedback del formulario. Una referencia DB y un objeto Storage son efectos separados; no existe transacción distribuida entre ambos.

## Recuperación y eliminación pendiente

`product_save_operations` y `product_storage_tasks` registran recuperación. El worker y la corrección P1 de retención están en [draft PR #1](https://github.com/Fedee17/sfstore/pull/1), fuera de main: no repetir su implementación. Esa rama retiene objetos existentes y bloquea apply de limpieza; retirar metadata de galería no confirma eliminación del archivo.

No ejecutar scripts heredados de limpieza ni activar un procesador desde esta guía. La migration de `result jsonb`, el RPC de eliminación durable, su integración y el eventual deploy son aprobaciones separadas. Ver [arquitectura](../docs/ARCHITECTURE.md), [reglas](../docs/SECURITY_RULES.md) y STG-01 en [backlog](../docs/DEVELOPMENT_BACKLOG.md).
