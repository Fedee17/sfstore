# SFSTORE — Fase 3: propuesta de integración verificable

## Resultado

**PR #1 y Fase 2 son compatibles en el baseline local probado.** Rama nueva `codex/integration-storage-phase2`, worktree `/workspace/sfstore-integration-phase3`, merge local validado `531d411c72cd22555abab02ba356a50a434abbcd` con padres Fase 2 `33d908a` y PR `be25492`. No hubo conflictos de Git ni resoluciones manuales: se comprobó que todos los blobs de ambas ramas se conservan exactamente en los paths aportados por cada una.

Los tres worktrees anteriores fueron preservados. No se modificó main/origin/main, ni se realizó push, merge a main, deploy, migration real, operación sobre precios/stock/pagos o eliminación de archivos reales. El commit local integra código existente para evaluación; no autoriza publicación ni Production. QA-01 está **PREPARADO, NO IMPLEMENTADO**, pendiente de aceptar este baseline y encargar su ejecución.

## 1. PR #1 revisada

[PR #1](https://github.com/Fedee17/sfstore/pull/1): open, draft, merged=false; head `be2549237667a08f7ab3618b6e41147f1ba8d684`, base `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`. Consulta directa de metadata/diff y revisión del árbol Git exacto, no suposición del contenido. La PR tiene seis commits y 19 archivos modificados. GitHub la informa mergeable; eso no sustituye revisión/validación.

El bot de Vercel muestra una preview Ready de esa PR. No se accedió a la preview ni a configuración activa del hosting; no se afirma un deploy de Production ni se ejecutó uno en esta fase. Es evidencia suficiente para controlar triggers antes de publicar/mergear en el futuro. Adjuntar PR al chat falló por transporte de la app; lectura del contenido fue exitosa.

Cambios reales:

- Worker de tareas: identifica pending/processing y failed con backoff (hasta 1 hora), recupera transacciones interrumpidas, usa transacciones/locks y advisory por ruta para evitar duplicados; registra resultado/error/attempts. Saves prepared se difieren, referencias conservan objetos e inexistentes se completan.
- Dry-run: default, transacción READ ONLY, rollback; inspect/list de Storage sin remove. Un objeto abandonado existente **se retiene**, no se borra: sin identidad devuelve STORAGE_IDENTITY_REQUIRED; con identidad coincidente conserva con STORAGE_CONDITIONAL_DELETE_UNAVAILABLE. Limpieza física no está habilitada.
- CLI apply bloqueada antes de leer credenciales o conectar, incluyendo staging etiquetado por operador. La CLI legacy de cleanup también bloquea apply; gateway compartido removeStorageObject falla cerrado.
- Borrado admin: retira metadata de galería y encola reconcile en una transacción vía RPC nuevo; fallo de cola/URL cambiada revierte orden/principal/metadata. Operation aborted impide reutilizar ese registro como save normal. Repetición no duplica cola; UI informa archivo retenido.
- Lint: ocho enlaces internos `/` pasan a Link con prefetch=false; window.location.href pasa a location.assign. No cambian importe, pago, stock ni lógica comercial de checkout.

### Los 19 archivos de PR

- `app/admin/productos/actions.ts`
- `app/checkout/exito/page.tsx`
- `app/checkout/fallo/page.tsx`
- `app/checkout/page.tsx`
- `app/checkout/pendiente/page.tsx`
- `app/producto/[slug]/page.tsx`
- `components/site-header.tsx`
- `docs/AUTONOMOUS_PROGRESS.md`
- `lib/products/product-image-deletion.ts`
- `lib/products/storage-task-processor.ts`
- `package-lock.json`
- `package.json`
- `reports/product-storage-task-processor.md`
- `scripts/cleanup-product-images.ts`
- `scripts/process-product-storage-tasks.ts`
- `supabase/migrations/202610100001_product_storage_task_results.sql`
- `supabase/migrations/202610100002_durable_admin_image_delete.sql`
- `tests/product-image-delete-safety.test.mjs`
- `tests/product-storage-task-processor.test.mjs`

## 2. Storage, autorización y riesgos

Se revisaron archivos de la PR y contratos existentes afectados, sin reauditar el repositorio completo:

| Control | Evidencia y límite |
| --- | --- |
| Tipos/archivo | Cliente acepta JPEG/PNG/WebP y entradas HEIC/HEIF; HEIC se normaliza. Servidor acepta salida JPEG/PNG/WebP y comprueba firma de primeros bytes contra MIME. No equivale a decoder completo/antimalware. |
| Tamaño | Fuente cliente <=25 MiB; salida servidor <=5 MiB por imagen. Request Server Actions <=8 MB total; varias imágenes pueden superar límite agregado. Valores existentes, no modificados por PR. |
| Subida | Guard admin antes de save; service_role solo servidor; path generado `products/[productId]/[contentHash].[extension]`, MIME explícito, upsert:false, comprobación de hash/tamaño/MIME en retry. No uploads públicos nuevos. |
| Permisos | requireAdminActionSession usa getUser + allowlist; delete verifica producto operativo/imagen perteneciente. RPC nuevo SECURITY INVOKER y execute service_role; PUBLIC/anon/authenticated revocados. ACL real de Production no comprobado. |
| Rutas/referencias | Reject vacío, traversal, slash inicial, backslash y query/hash en ruta; URLs se decodifican. URL esperada de metadata se valida en RPC. Lecturas/cambios preparados se conservan. |
| Error/recovery | Fallos de upload/DB y respuesta perdida conservan protocolo de recuperación. Cola y retiro admin son atómicos; fallo posterior de consulta puede compensar metadata. No hay transacción distribuida PostgreSQL-Storage. |
| Secretos | No nuevos literales de credenciales; service_role no se exporta al cliente. Worker usa variables separadas; no carga .env.local ni cron/endpoint automático. |
| Destructividad | Worker solo tiene inspect; no path-only DELETE. Gateway remove y ambas CLI apply están bloqueados. Tests de objeto reemplazado/referencia concurrente verifican conservación. |

Riesgos residuales: retención consume espacio y tareas pueden quedar fallidas/reintentables indefinidamente; no scheduler habilitado. La biblioteca admite modo de escritura DB cuando se invoca explícitamente, aunque la CLI pública bloquea apply; no habilitar llamadas/job nuevos sin review. Locks de tablas durante inspección pueden bloquear escritores, por lo que activar un futuro modo apply exige revisar contención y timeouts. Host allowlists/configuración staging son del operador, no una prueba independiente de identidad del destino. Apply sigue bloqueado por esa razón y por falta de borrado condicionado.

MD5/etag de contenido no autorizan por sí solos eliminación segura. No se resolvieron políticas reales de bucket, RLS ni los avisos Next/xlsx: requieren trabajos separados. No se encontró un camino destructivo nuevo en el diff inspeccionado; no se realizó un scan exhaustivo ni PoC de Production.

## 3. Dependencias y entorno

PR agrega `pg:^8.23.1` a dependencies y `@types/pg:^8.23.1` a devDependencies. Lock resuelve ambos a 8.23.1, con 15 paquetes nuevos incluyendo la cadena pg. Ninguna versión de un paquete preexistente cambió. pg es driver de la CLI/local tests; worker lib solo importa su tipo. No se agrega conexión PostgreSQL a una página pública.

Next.js sigue 16.2.7 y xlsx 0.18.5. Se reutiliza el [triage previo](dependency-triage-phase2-20261010.md): Next 16.3.8 es candidata de misma major con peers aceptables, pendiente de compatibilidad funcional y autorización; xlsx necesita evaluar distribución corregida >=0.20.2 porque npm latest consultado seguía 0.18.5. Parches de toolchain/source-map/nanoid/browser targeting pueden evaluarse después en una rama basada en el lock combinado. No major updates, overrides ni audit fix --force.

Audit read-only actual sobre combinación y Fase 2 (esta última explícitamente con dev): ambos reportan **15 entradas: 1 crítica, 13 altas, 1 moderada**, mismas dependencias afectadas; ninguna nueva en pg/tipos/cadena. Históricamente fueron 36. Como el lock conserva versiones y baseline actual también devuelve 15, no se atribuye la diferencia a una corrección: cambió la respuesta/cálculo del audit. No significa que los riesgos previos estén remediados ni que pg esté libre de vulnerabilidades desconocidas.

Variables del sitio ya existentes: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY y ADMIN_ALLOWED_EMAILS para auth/upload/admin. **No hay nuevas variables necesarias en Vercel por el RPC de galería**. CLI worker separada:

| Variable | Uso |
| --- | --- |
| STORAGE_TASKS_DATABASE_URL | Conexión PostgreSQL dedicada para dry-run. |
| STORAGE_TASKS_SUPABASE_URL | Storage del entorno de pruebas explícito. |
| STORAGE_TASKS_SERVICE_ROLE_KEY | Clave del entorno no productivo; nunca usar para pruebas reales de Production. |
| STORAGE_TASKS_ENVIRONMENT | local o staging; local exige loopback. |
| STORAGE_TASKS_STAGING_DB_HOST / STORAGE_TASKS_STAGING_STORAGE_HOST | Solo staging; par explícito, HTTPS y sslmode=verify-full. |

No se configuraron secretos ni se conectó esta CLI a proyecto Supabase real. La limpieza está deshabilitada aun si esas variables existen. El driver/entrypoint TS debe verificarse con versión Node de una futura ejecución; aquí se usó Node 24.19.0. No instalar un worker en hosting Node antiguo suponiendo soporte de TS nativo.

## 4. Migrations y acciones manuales

Dos migrations necesarias, ambas DDL aditivo:

1. `supabase/migrations/202610100001_product_storage_task_results.sql`: agrega result jsonb nullable sin default a product_storage_tasks; no rewrite/backfill histórico programado.
2. `supabase/migrations/202610100002_durable_admin_image_delete.sql`: crea función nueva y grants; delega al RPC anterior y enqueue. Su cuerpo solo actúa si luego se invoca. Aplicar DDL no cambia imágenes, ejecuta tareas, borra Storage ni activa worker.

Requieren tablas/funciones/roles de migrations anteriores, incluido guardado atómico de 202610060001 y delete/restore de 202610040001. Se aplicaron únicamente a bases sintéticas en tests. Production y su drift no fueron inspeccionados: no se certifica que ya existan o que puedan repetirse. ADD COLUMN y CREATE FUNCTION no son idempotentes; no reaplicar ciegamente.

Acciones necesarias fuera de esta fase:

1. Revisar/aceptar el baseline local `531d411` y la PR; confirmar política de despliegue automático. Mantener main intacto hasta disponer de autorización de publicación/integración y plan de deploy separado. Si merge a main dispara deploy, no hacerlo antes del gate de DB.
2. Inspección autorizada read-only del esquema/ACL. El [SQL de verificación](integration-storage-phase3-verification.sql) comprueba presencia/tipo, firma, SECURITY INVOKER, search_path y permisos, y devuelve definición instalada para comparar con migration. No muestra filas operativas ni llama al RPC. Todos los flags deben ser true tras aplicar ambos DDL; antes, los de result/wrapper faltantes serán false.
3. Solo con aprobación explícita de escritura, aplicar manualmente en SQL Editor las migrations faltantes exactas, en orden, tras revisar locks y existencia. No supabase db push. Verificar después; controlar también roles adicionales/default privileges de Production.
4. Autorizar integración/publicación y despliegue coordinados. **El nuevo RPC debe existir antes de desplegar su caller:** no hay fallback al delete anterior. Si no se prepara DB, esa acción admin fallará; no puede tratarse como deploy compatible sin migration.
5. Mantener apply/cleanup físico deshabilitado. Activación/borrado de objetos es otro objetivo sensible que requiere destino confiable y condición atómica/garantía de inmutabilidad verificada, no una consecuencia de estas migrations.

Aplicar DDL, aceptar un baseline para QA, merge y deploy son autorizaciones distintas. Esta propuesta no solicita ni presume que alguna ya fue concedida para Production.

## 5. Validaciones del baseline combinado

| Check | Resultado |
| --- | --- |
| npm ci con cache temporal | PASS, 406 paquetes; lock usado sin regeneración. |
| Autorización/login, guardado atómico, formulario/imágenes, borrado y worker | 131/131 focalizadas, 0 fallos/skips. |
| Suite completa PG aislado + Chromium/Playwright | 636/636, 0 fallos/skips. |
| TypeScript después de build | PASS. |
| ESLint global | PASS: 0 errores, 11 warnings previos. |
| Build Next/Turbopack | PASS. |
| Migrations, SQL de verificación y ACL sintéticos | PASS: flags ausentes antes de DDL, todos true después; SELECT ejecutados dentro de transacciones READ ONLY. |
| Conflictos/blobs/whitespace | PASS: sin conflictos; blobs de ambas ramas preservados, diff check limpio. |

Tests incluyen concurrencia de workers/referencias, reemplazo de objeto, identidad ausente, inexistente, fallo de Storage, rollback/cola, reintentos, prepared/replay, RPC service-only y formulario HEIC. No se borraron archivos reales. Fallo inicial del harness temporal SQL por named import CJS de pg se corrigió usando default import en el segundo intento; no fue un fallo del SQL/app ni se cambió código para pasar checks.

Variables de tests: SFSTORE_TEST_PG_BIN apunta al runtime temporal de PostgreSQL, SFSTORE_TEST_PG_MODULE al pg de **este** worktree, SFSTORE_TEST_PLAYWRIGHT_MODULE al wrapper temporal Chromium. QA-01 debe eliminar esa dependencia de paths temporales/otros worktrees como contrato de desarrollador. Los logs temporales son `/tmp/sfstore-phase3-*.log`; evidencia portable en [JSON](integration-baseline-phase3-20261010.json). Verificación SQL adicional usó una base efímera y no datos remotos.

## 6. QA-01 y siguiente lote

Criterios reales de backlog: runner de tests opcionales PG/Chromium, preflight que distinga ausencia/skips/fallos, scripts explícitos sin alterar tests, versiones documentadas, install limpio y códigos de salida correctos; sin depender de otro worktree. Complejidad media, riesgo bajo, AUTÓNOMA. No incluye CI remota (QA-02), despliegues ni upgrades de framework/parser.

Dependencias técnicas: adoptar un único package.json/lock con pg de PR y cambios de Fase 2; definir runtime local de prueba, setup reproducible en cache temporal y comandos/Node soportado. El merge local validado ofrece ese candidato sin conflictos. No depende de aplicar migrations o borrar archivos en Production.

**Estado: técnicamente preparado contra este baseline; pendiente de aceptación y encargo del lote.** Si se elige integrar las ramas por otro camino, repetir la validación del tree resultante antes de QA-01. No implementado ahora. No iniciar QA-01 sobre una copia separada de Fase 2 que vuelva a tocar un lock pendiente de PR #1.

Orden recomendado: aceptar baseline combinado → desarrollar QA-01 en rama hija de ese baseline → revisar/publicar los cambios cuando se autorice → preparar DB manual y coordinar integración/deploy con gates anteriores. Si se decide integrar PR y Fase 2 a main por separado, PR primero y mantenimiento después, revalidando el resultado y manteniendo autodeploy controlado; no aplicar ambos caminos duplicando commits. Next/xlsx y demás mejoras de dependencias van en tareas independientes posteriores, sin mezclarlas con QA-01.

Próximo lote autónomo recomendado: solo QA-01 sobre el baseline aceptado. Ninguna nueva funcionalidad comercial, pago, cambio de precio/stock ni tarea sensible se inicia en esta fase.
