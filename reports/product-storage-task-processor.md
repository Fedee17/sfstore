# Procesamiento de product_storage_tasks

Trabajador manual por lotes (100 tareas), separado del guardado y sin scheduler ni despliegue automático. Mantiene los contratos de create_product_atomic/update_product_atomic y las reglas comerciales.

## Ejecución

Primero aplicar en un entorno local o staging la migración aditiva `202610100001_product_storage_task_results.sql`: agrega únicamente `result jsonb`. El trabajador no ejecuta migraciones. No usar `supabase db push` ni aplicar en Production como parte de esta entrega.

Configurar exclusivamente variables del trabajador, sin cargar `.env.local`:

- `STORAGE_TASKS_ENVIRONMENT`: `local` o `staging`. Production no está habilitado por el CLI.
- `STORAGE_TASKS_DATABASE_URL`: conexión PostgreSQL directa o pooler en modo sesión, al mismo proyecto que Storage. La conexión debe poder ejecutar `SET LOCAL ROLE service_role`; no usar pooler en modo transacción.
- `STORAGE_TASKS_SUPABASE_URL` y `STORAGE_TASKS_SERVICE_ROLE_KEY`: Storage del mismo entorno.
- En staging: `STORAGE_TASKS_STAGING_DB_HOST` y `STORAGE_TASKS_STAGING_STORAGE_HOST` deben coincidir con los destinos. PostgreSQL requiere `sslmode=verify-full`; Storage requiere HTTPS.

`npm run storage-tasks:dry-run` es el modo predeterminado: transacciones READ ONLY, sin modificar tareas, intentos, errores, operaciones ni archivos. Emite JSON con las decisiones. La vista es una simulación; una ejecución posterior vuelve a verificar todo.

`npm run storage-tasks:apply` procesa y emite resultados JSON. Nunca se ejecutó contra datos reales durante esta implementación.

## Garantías y recuperación

La fila de tarea se reclama con FOR UPDATE SKIP LOCKED y un bloqueo advisory por bucket/ruta impide borrar simultáneamente desde tareas de operaciones distintas. La transacción mantiene bloqueos SHARE de product_save_operations y product_images durante la verificación y la llamada a Storage. Impide nuevas referencias y cambios de operaciones mientras elimina, incluso desde escrituras legacy. Puede demorar guardados por el tiempo de una llamada a Storage (timeout de 15 segundos por solicitud); ejecutar lotes pequeños fuera de horas de mayor actividad. La conexión dedicada debe mantenerse viva durante la llamada.

Las operaciones prepared nunca se abortan ni se limpian automáticamente: conservan el reintento del guardado actual. También se protege un archivo utilizado por el manifiesto de otra operación prepared. Resolver/abortar esas operaciones mediante el flujo existente antes de limpiar sus archivos.

Todas las filas product_images protegen el archivo, sin filtrar por producto, estado comercial o imagen principal. Se comparan rutas y rutas codificadas; un fallo de lectura, metadatos inesperados o una URL malformada impide borrar. Solo se usa el bucket product-images y una ruta exacta de una tarea existente. Los metadatos suministrados (hash/etag, tamaño, MIME) deben coincidir. Las escrituras externas que omiten el protocolo de guardado y reemplazan objetos directamente en Storage no participan de los bloqueos PostgreSQL.

No hay lease que expire mientras otro trabajador siga borrando. Si el proceso cae, PostgreSQL revierte y libera los bloqueos; pending y processing vuelven a ser elegibles. Si Storage borró pero se perdió la respuesta, el reintento detecta ausencia y completa idempotentemente. Storage y PostgreSQL no comparten una transacción distribuida: una pérdida de conexión con un DELETE remoto todavía en vuelo requiere conservar el protocolo de rutas/objetos inmutables del guardado actual.

Fallos de Storage se registran como failed con attempts, last_error y result; reintentos automáticos en invocaciones posteriores con espera exponencial de hasta una hora. Referenciados y ausentes terminan como completed con su motivo. Prepared queda sin modificaciones. Fallos de infraestructura de PostgreSQL provocan rollback y error del comando; no se declara éxito sin confirmar commit. Tareas completed nunca se vuelven a ejecutar.

## Validación sintética

Las pruebas usan PostgreSQL efímero en loopback y un Map como Storage. No aceptan conexiones remotas ni borran archivos reales.

```sh
SFSTORE_TEST_PG_BIN=<bin local de PostgreSQL> node --test tests/product-storage-task-processor.test.mjs
SFSTORE_TEST_PG_BIN=<bin local de PostgreSQL> SFSTORE_TEST_PG_MODULE=<pg/lib/index.js> node --test tests/*.test.mjs
npx tsc --noEmit
npm run lint
npm run build
```

Resultados ejecutados en esta entrega:

- Suite completa: 621 pruebas, 620 aprobadas, 0 fallidas y 1 omitida. La omitida es la prueba opcional del formulario React en navegador, sin runtime Playwright configurado. Las pruebas de PostgreSQL sí se ejecutaron, con binarios efímeros de @embedded-postgres/linux-x64 instalados únicamente en /tmp.
- 18 pruebas nuevas aprobadas: 15 de procesamiento y 3 de rechazo de destinos inseguros por el CLI.
- TypeScript (`tsc --noEmit`), ESLint de los tres archivos de código/pruebas agregados y `git diff --check`: aprobados.
- `npm run build`: aprobado.
- `npm run lint`: falla por 9 errores y 11 advertencias preexistentes, fuera de estos cambios. Para dejar el lint global limpio, corregir enlaces HTML internos en app/checkout/{exito,fallo,pendiente}/page.tsx, app/producto/[slug]/page.tsx y components/site-header.tsx, y la asignación de window.location.href señalada por react-hooks/immutability en app/checkout/page.tsx. No bloquea las pruebas ni el build del procesador.
- Ninguna conexión a Supabase real, eliminación de archivos reales, migración remota ni despliegue.

Archivos de la entrega: lib/products/storage-task-processor.ts, scripts/process-product-storage-tasks.ts, tests/product-storage-task-processor.test.mjs, supabase/migrations/202610100001_product_storage_task_results.sql, package.json, package-lock.json y este informe.
