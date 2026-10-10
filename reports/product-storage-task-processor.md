# Procesamiento y retención de product_storage_tasks

Actualizado: 2026-10-10. Este estado reemplaza las instrucciones previas de apply.

## Estado seguro

El procesador existente se conserva: selección por lotes, dry-run READ ONLY, protección de referencias (incluidas rutas codificadas), operaciones prepared, bloqueos por tarea/ruta, recuperación y espera exponencial. La diferencia es que **no elimina ningún objeto existente**. La interfaz TaskStorage ya no expone remove.

- Referenciado: preserved_referenced, sin borrar.
- Ausente: already_absent, idempotente.
- Existente sin etag/content_hash no vacío: STORAGE_IDENTITY_REQUIRED; una ruta/tamaño/MIME no identifican el objeto.
- Existente con identidad y metadatos coincidentes: retained_requires_conditional_delete y STORAGE_CONDITIONAL_DELETE_UNAVAILABLE. En las pruebas que registran resultados, permanece failed/reintentable, nunca completed como si se hubiese eliminado.
- Error de inspección/metadatos: failed con el error y reintento progresivo.
- Prepared: deferred_prepared, sin modificar el intento de guardado.

No se infiere la identidad actual de un objeto para autorizar una tarea legacy. La inspección y bucket.remove(path) no son una operación condicional atómica. Los bloqueos PostgreSQL no protegen contra reemplazos de Storage por escritores externos.

## CLI

`npm run storage-tasks:dry-run` continúa disponible con variables exclusivas STORAGE_TASKS_*. No cargar .env.local. Su salida informa retención, no promete borrados.

`npm run storage-tasks:apply` falla con STORAGE_TASKS_APPLY_DISABLED **antes de leer credenciales o abrir conexiones**, en cualquier entorno. La allowlist de staging controlada por el operador no demuestra exclusión de Production. No hay flag alternativo para habilitar escrituras.

El script legacy cleanup-product-images también rechaza --apply antes de conectar. Su función de simulación conserva validación de snapshots y detección de POST-CLEANUP previo; no puede realizar una limpieza nueva. El gateway compartido rechaza removeStorageObject sin llamar a Storage.

## Eliminación administrativa durable

La acción conserva autenticación administrativa, protección de identidades históricas, normalización de galería, elección de principal y revalidación de rutas. Quita la imagen del producto, informa que el archivo se conserva y no lo elimina de Storage.

Nueva migración: supabase/migrations/202610100002_durable_admin_image_delete.sql. Crea únicamente el RPC service-role delete_product_image_metadata_and_queue. Al ser invocado, ejecuta el RPC de metadatos existente y encola reconcile en una sola transacción. Si cambia la URL esperada o falla el encolado, revierte la eliminación y toda normalización. URLs externas no generan tareas de Storage.

Para mantener el FK existente, registra una operación update_product ya cercada como aborted, con recovery_metadata.source=admin_image_delete y la imagen eliminada. No puede reanudarse como guardado; no cambia los contratos de create_product_atomic/update_product_atomic. Las imágenes legacy solo permiten registrar intención path-only: el procesador las retiene hasta contar con identidad verificable y un mecanismo de borrado seguro.

## Publicación y migraciones

No se ejecutó nada contra Supabase real, no se borraron archivos reales, no hubo merge ni despliegue. La migración nueva se probó exclusivamente en PostgreSQL efímero local. Aplicarla requiere autorización separada y ejecución manual en SQL Editor, antes de desplegar el nuevo llamador administrativo. Sin ese RPC, la acción falla sin cambiar metadatos: no tiene fallback al borrado antiguo. Nunca usar supabase db push.

La migración anterior 202610100001_product_storage_task_results.sql sigue siendo necesaria para registrar result. Ninguna de las dos habilita automáticamente al procesador.

Para habilitar borrados reales en el futuro faltan dos garantías: un destino no-Production identificado por configuración confiable independiente, y borrado atómico condicionado a la identidad/version del objeto o una inmutabilidad completa demostrada para todos los escritores. Una nueva comprobación inspect no cierra la carrera. No presentar este parche como habilitación de Production.

## Validación reproducible

```sh
npm ci
SFSTORE_TEST_PG_BIN=<PostgreSQL local bin> SFSTORE_TEST_PG_MODULE=<pg/lib/index.js> SFSTORE_TEST_PLAYWRIGHT_MODULE=<Playwright con Chromium local> node --test tests/*.test.mjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Se usan clusters efímeros en loopback, objetos Map y formularios con servicios simulados. Los runtimes de PostgreSQL y Playwright se instalaron en /tmp; no son dependencias nuevas del producto. Resultado final registrado en docs/AUTONOMOUS_PROGRESS.md.
