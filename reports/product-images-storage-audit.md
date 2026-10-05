# Auditoria de imagenes de producto y Storage

Generado: 2026-10-04T19:13:23.534Z

> Auditoria read-only. No se eliminaron filas ni objetos y no se modifico Production.

## Resumen

- Filas product_images: 84
- Objetos Storage: 85
- Bytes en Storage: 4.913.604 bytes
- Productos con imagenes: 55
- Grupos DB con contenido duplicado: 4
- Grupos con el mismo contenido entre productos distintos: 1
- Filas DB duplicadas adicionales: 27
- Grupos Storage con contenido duplicado: 4
- Objetos Storage duplicados adicionales: 29
- Filas DB sin objeto: 0
- Objetos Storage sin fila DB: 1
- Productos con multiples primary: 0
- Productos sin primary: 0
- Productos con sort_order inconsistente: 2
- URLs externas/no administradas: 0
- Items REVIEW en el plan: 2

## Casos conocidos

### Al Haramain dubai night

- Product ID: `66c152aa-98db-4827-b4c7-fdc2721da2a6`
- Filas DB: 26
- Objetos Storage: 27
- Hashes de contenido distintos: 1
- Objetos huerfanos: 1
- Propuesta: KEEP 1, DELETE_BOTH 25, DELETE_STORAGE 1, REVIEW 0.
- Conservar: fila `e1f8f6e1-fc81-4147-8034-c2e6c9742a38`, objeto `products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227676837-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp`.
- Huerfano Storage: `products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227660446-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp`.

### Rasasi Hawas For Him

- Product ID: `880dfa55-41c2-4275-91e7-ca7def54ec14`
- Filas DB: 2
- Objetos Storage: 2
- Hashes de contenido distintos: 1
- Objetos huerfanos: 0
- Propuesta: KEEP 1, DELETE_BOTH 1, DELETE_STORAGE 0, REVIEW 0.
- Conservar: fila `53912094-c090-46b7-ad2d-46ac81bde040`, objeto `products/880dfa55-41c2-4275-91e7-ca7def54ec14/1780978864680-img-4898-optimizada.webp`.

### Lattafa Yara Tous

- Product ID: `e53066cc-9c35-47e2-8d27-0fe5fb425ce8`
- Filas DB: 2
- Objetos Storage: 2
- Hashes de contenido distintos: 1
- Objetos huerfanos: 0
- Propuesta: KEEP 1, DELETE_BOTH 1, DELETE_STORAGE 0, REVIEW 0.
- Conservar: fila `fcfb0556-e18c-460c-81e3-94f95bb3572f`, objeto `products/e53066cc-9c35-47e2-8d27-0fe5fb425ce8/1781366636539-img-4923-optimizada.webp`.

## Huerfanos

- No se detectaron filas DB cuyo objeto administrado falte.
- Storage sin fila DB: `products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227660446-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp`, eTag `a8c1635ac5153f08c7286c9fea8a3ca4`, 50.728 bytes.

## Primary y orden

- No se detectaron productos con cero o multiples imagenes principales.
- Rasasi Hawas For Him: orden actual [0, 0], esperado [0, 1].
- Lattafa Yara Tous: orden actual [0, 0], esperado [0, 1].

## Criterio de conservacion

1. Mantener una fila valida asociada al producto correcto.
2. Priorizar la fila primary cuando existe exactamente una.
3. En ausencia de primary, priorizar la fila valida mas antigua.
4. Borrar una fila/objeto duplicado solo cuando eTag, size y MIME coinciden y queda un reemplazo valido.
5. Marcar REVIEW si la asociacion, el objeto o la continuidad de la galeria no son inequívocos.

## Riesgo del delete actual

- deleteProductImage elimina primero la fila de product_images y despues intenta borrar Storage.
- Si Storage falla, la accion solo registra un warning: queda un objeto huerfano.
- Si falla la reasignacion de primary despues del delete, la fila y posiblemente el objeto ya fueron eliminados; el producto puede quedar sin primary.
- No existe una transaccion comun entre Postgres y Storage.
- El delete no comprueba si otra fila referencia la misma URL antes de borrar el objeto.
- Si el delete DB falla, Storage no se toca, que es el lado seguro del orden actual.
- setPrimaryProductImage usa dos updates separados; un fallo entre ambos puede dejar cero primary.
- moveProductImage usa compensaciones best-effort, no una transaccion atomica.

## Cobertura actual

Cubierto:
- seleccion multiple, previews, HEIC/HEIF, validacion de firma y limites;
- upload sin borrar imagenes existentes;
- limpieza compensatoria del lote nuevo;
- pending, feedback de error y bloqueo de doble submit;
- deduplicacion de retry por MD5/eTag, size, MIME, URL e ID deterministico;
- presencia de acciones primary, reorder y delete.

Gaps:
- no hay prueba integrada DB+Storage para delete exitoso;
- no hay prueba de Storage failure despues de DELETE DB;
- no hay prueba de fallo al reasignar primary;
- no hay prueba de URL compartida por multiples filas;
- no hay prueba de rollback fallido del reordenamiento;
- no hay automatizacion probada para reconciliar huerfanos legacy.

## Items REVIEW

- Lattafa Yara Rosa: DB_ROW_AND_STORAGE_OBJECT `8a698d0f-96a5-4af8-bb05-4de4168bf431` - Identical content is attached to multiple product IDs: f1cb2323-0e7f-49d6-a26f-110595c90e55, 05b34469-3eb8-4148-8e97-9a19f1c2df6e. Product identity must be resolved first.
- Lattafa Yara Rosa: DB_ROW_AND_STORAGE_OBJECT `216c5fa1-8fa8-49ec-bfbc-7091a9139045` - Identical content is attached to multiple product IDs: f1cb2323-0e7f-49d6-a26f-110595c90e55, 05b34469-3eb8-4148-8e97-9a19f1c2df6e. Product identity must be resolved first.

## Archivos

- reports/product-images-storage-audit.csv
- reports/product-images-storage-snapshot.json
- reports/product-images-cleanup-plan.csv
