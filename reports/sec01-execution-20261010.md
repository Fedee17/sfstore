# SEC-01 — Ejecución aislada

Fecha de informe: 2026-10-10 (America/Buenos_Aires). Rama `codex/sec-01-supabase-permissions`, base `69049e2` (`codex/integration-storage-phase2`, integración `531d411`). Worktree `/workspace/sfstore-sec01`. No se incorporó ni modificó trabajo UX-01 o de automatización.

## Hallazgos y correcciones

| Hallazgo | Evidencia / condición | Corrección o límite |
| --- | --- | --- |
| Tablas originales sin RLS versionado completo | `supabase/schema.sql`; con ACL amplia se pudieron leer email de cliente y costo de producto en fixture real PostgreSQL. No prueba exposición actual de Production. | RLS/ACL de tabla y columna, catálogo visible y datos privados deny-all. |
| Filtros de UI no limitan API DB directa | `services/products.ts` filtra activo/no histórico/categoría y Yara solo en aplicación. | Predicados equivalentes en policies restrictivas; costos/campos internos no seleccionables. |
| Policies permisivas, ACL por columna o privilegios heredados pueden eludir un REVOKE simple | Simulados en fixtures, incluidos permisos de columna PUBLIC y membership sin INHERIT en rol BYPASSRLS. | Revocar ACL por columna, límites restrictivos, pre/postcondiciones que abortan ante herencia/ownership peligrosos. |
| RPC/helper con default EXECUTE PUBLIC o drift | RPC críticas existentes ya restringidas; algunos trigger helpers no revocaban el default. No se afirma que todo helper trigger permita mutación directa. | Inventario de funciones versionadas service-only; prueba de todos los EXECUTE efectivos, incluidos helpers/extensiones diferenciadas. |
| Lectura de recibo con cliente privilegiado sin autorización | `getCheckoutSuccessOrder` aceptaba UUID, consultaba `orders` y era llamado desde página pública. No había check de sesión/ownership. | Extraer a módulo server-only y autorizar con getUser+allowlist existente antes de crear cliente service_role; publicación pendiente de revisión. |
| Frontera de módulo privilegiado no explícita | `services/orders.ts` importaba cliente admin a un módulo consumido por checkout cliente. Next no publica la variable privada por defecto; no se demostró fuga de clave. | Separar lectura servidor y marcar `lib/supabase/server.ts` server-only; build verifica compatibilidad. |
| Storage policy efectiva desconocida | Fuente no versiona configuración real; se simuló una policy amplia para usuarios. | Guard restrictivo del bucket de imágenes, sin tocar otros buckets o descargas públicas. |
| Endpoints de pagos pueden evadir RLS con service_role | APIs de preferencia/webhook usan rol privilegiado; ownership/firma/conciliación son PAY-01/PAY-02. | No se declara resuelto por esta migration ni se cambian pagos; permanece gate de lanzamiento. |

Matriz y gates completos: [SEC-01](../docs/SUPABASE_PERMISSIONS_SEC01.md). SQL de inspección/verificación: [read-only](sec01-permissions-read-only.sql).

## Pruebas

Se creó PostgreSQL 18 efímero, con puerto aleatorio exclusivamente 127.0.0.1, roles sintéticos y schema/migrations reales del repo. Los únicos datos son fixtures locales; Storage es metadata SQL sintética y mocks, sin API ni archivos reales. Los clusters se detienen/eliminan al terminar. Ninguna connection string remota es aceptada por los tests nuevos.

Se comprueban: catálogo permitido/filtrado y joins, columnas internas denegadas, SELECT/INSERT/UPDATE/DELETE/TRUNCATE privados denegados, mutaciones de catálogo denegadas, todas las RPC de aplicación service-only, usuario allowlisted sin privilegios DB directos, acceso admin/RPC de guardado permitido, bucket protegido sin alterar otro bucket, grants reintroducidos, repetición sin cambio de datos/objetos, rollback ante esquema incompleto/ACL heredada/Storage sin RLS/membership privilegiada, y SQL read-only con cero violaciones. Lectura de recibo prueba el guard real getUser/allowlist, sesión inexistente, email no permitido, allowlist vacía, error Auth y admin válido. Tests anteriores de Storage conservados; fixture extendido con schema `storage.objects` para validar la nueva migration.

Resultados finales, códigos de salida 0:

- SEC-01 específico: **23/23** tests, cero fallos, cancelaciones u omisiones; PostgreSQL real efímero y mocks de autorización.
- Suite completa del baseline integrado con cambios SEC-01: **659/659**, tres suites, cero fallos/skips (baseline 636 + 23 nuevos). Incluye las suites PG de guardado/Storage, formulario React en Chromium, permisos y autorización existentes. Duración observada 47,67 s; no se atribuye una estimación de consumo Codex.
- SQL read-only ejecutado solo en el cluster efímero: `violations = 0`, `details = []`; snapshot de datos igual antes/después.
- Build Next.js 16.2.7 correcto; `tsc --noEmit` posterior correcto.
- ESLint global: **0 errores, 11 advertencias preexistentes**, sin reglas deshabilitadas.
- `git diff --check`: correcto.

Logs locales: `/tmp/sfstore-sec01-specific-final.log`, `/tmp/sfstore-sec01-full-final.log`, `/tmp/sfstore-sec01-build.log`, `/tmp/sfstore-sec01-tsc.log`, `/tmp/sfstore-sec01-lint.log`. No se publican logs de aplicación ni secretos.

Comandos (baseline integrado anterior a QA-01, con contrato de runtimes opcionales existente):

```sh
npm ci --cache /tmp/sfstore-npm-cache --no-audit --no-fund
SFSTORE_TEST_PG_BIN=/tmp/sfstore-pg-runtime/node_modules/@embedded-postgres/linux-x64/native/bin SFSTORE_TEST_PG_MODULE=/workspace/sfstore-sec01/node_modules/pg/lib/index.js node --test tests/sec01-effective-permissions.test.mjs tests/sec01-order-read.test.mjs
SFSTORE_TEST_PG_BIN=/tmp/sfstore-pg-runtime/node_modules/@embedded-postgres/linux-x64/native/bin SFSTORE_TEST_PG_MODULE=/workspace/sfstore-sec01/node_modules/pg/lib/index.js SFSTORE_TEST_PLAYWRIGHT_MODULE=/tmp/sfstore-p1-playwright.cjs node --test tests/*.test.mjs
npm run lint
npm run build
npx tsc --noEmit
git diff --check
```

El wrapper Chromium usa `/usr/bin/chromium` y Playwright instalado en `/tmp`, sin env/credenciales de aplicación. Este baseline no incluye `tests/runtime`/runner QA-01; intentar `npm ci --prefix tests/runtime` confirmó la ausencia del lockfile. Se utilizó el contrato documentado del baseline, sin instalar infraestructura de automatización ni cambiar package/lockfiles.

Durante las pruebas se corrigieron errores de fixtures (la clave de operaciones es `operation_key`, payload RPC requiere todos sus campos) y una colisión entre variable PL/pgSQL y alias SQL. No se desactivaron tests ni se cambiaron criterios de acceso para lograr pases.

## Archivos

- `supabase/migrations/202610110001_sec01_effective_permissions.sql`: candidato transaccional de permisos/RLS.
- `lib/supabase/server.ts`: frontera server-only.
- `services/orders.ts`: creación pública conservada, sin import de cliente admin.
- `services/checkout-order-read.ts`: lookup privado autorizado servidor.
- `app/checkout/exito/page.tsx`: import de lookup servidor.
- `tests/sec01-effective-permissions.test.mjs`: roles/ACL/policies/rollback en DB real aislada.
- `tests/sec01-order-read.test.mjs`: autorización y frontera de módulo.
- `tests/fixtures/storage-permissions.sql`: metadata sintética Storage.
- `tests/product-storage-task-processor.test.mjs`: cargar ese fixture antes de migrations.
- `docs/DEVELOPMENT_BACKLOG.md`, `docs/SECURITY_RULES.md`: estado y límites.
- `docs/SUPABASE_PERMISSIONS_SEC01.md`: matriz y decisiones.
- `reports/sec01-permissions-read-only.sql` y este informe: evidencia revisable.

Cambios locales sin publicación. No se hizo commit, push, merge, deploy, conexión/escritura Production, cambio de credenciales ni de datos reales. Worktrees existentes preservados, incluidos cambios UX-01 y reports ajenos sin confirmar.

## Integración y aprobación

Requiere **una nueva migration**, preparada/probada solo en DB efímera, además de las prerequisites del baseline. Es una modificación de seguridad de ACL/RLS, no una migration aditiva de columna. No debe aplicarse a Production ni integrarse/desplegarse con el checkout público actual: los tres inserts anónimos fallarán por diseño. Un rollback de aplicación por sí solo tampoco restaura permisos; no se propone revertir automáticamente a grants inseguros.

Pendiente: revisar matriz y diff; acreditar schema/grants reales mediante SQL read-only autorizado; resolver contrato PAY-01 y ownership de comprador; definir controles PAY-02; aprobar por separado cualquier futura integration/migration/deploy. La página de éxito no leerá DB para compradores sin autorización definida, y sus query params no certifican una transacción. No se inventan nuevas autorizaciones comerciales.
