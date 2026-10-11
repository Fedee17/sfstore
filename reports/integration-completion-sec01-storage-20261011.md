# SFSTORE — cierre de integración SEC-01 y paginación Storage

Fecha: 11/10/2026 (America/Buenos_Aires). Rama local: `codex/integration-sec01-pay01-storage-20261011`; worktree `/workspace/sfstore-integration-20261011`.

## Resultado

Se continuó el candidato `9d067e5`, preservando todos sus desarrollos, y se actualizaron referencias de main y retención mediante fetch explícito. Origin/main mantiene `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`. El fixture SEC-01 ahora pasa en PostgreSQL 15 y el gateway Storage pagina completamente las referencias compartidas. Los bloqueos locales de fixture/paginación documentados anteriormente quedaron resueltos; la validación del stack real continúa pendiente.

## Cambios incorporados

- `30f6f6fcb07a0f49390e8f72a1627ff8618f9cb2` incorporado como `b08390f`: auditoría/checkpoint documental de PR y límites de CI.
- `a012bf45cc512869b388b1486f372da21427b9d4` incorporado como `67ddf15`: evidencia del defecto de paginación. Ambos agregan documentación, sin duplicar procesador/retención ya presentes en SEC/PAY. `git cherry HEAD origin/codex/storage-p1-safe-retention` identifica ambos patches como incorporados (`-`).
- `tests/sec01-effective-permissions.test.mjs`: fixture usa NOINHERIT en el rol miembro y GRANT convencional, compatibles con PG15. Comprueba membresía efectiva y ausencia de SELECT heredado antes de exigir el rechazo SEC01_PRIVILEGED_ROLE_MEMBERSHIP. Finalmente revoca membership/grants, elimina el rol sintético y restaura el atributo original. No cambia la migration ni debilita el caso de seguridad.
- `lib/products/product-image-deletion.ts`: findOtherReferences usa keyset por id con orden ascendente, límite de 250 y gt del último id. Termina sólo con página vacía; no confunde un límite del servidor menor que el solicitado con fin de resultados. Mantiene equivalencia de URL/ruta decodificada y exclusión de la propia imagen. Un error de página propaga fallo; un id vacío/repetido/desordenado aborta el escaneo en vez de aceptar resultados parciales o repetir indefinidamente.
- `tests/product-image-reference-pagination.test.mjs`: nueve regresiones sobre el gateway real con cliente PostgREST simulado, sin extraer una implementación paralela. Incluye 1.105 referencias compartidas con caps 1.000/100, una referencia codificada después de 1.100 imágenes ajenas, página final corta, consulta vacía/URL externa, error intermedio, página repetida/desordenada y errores antes/después del borrado de metadata con compensación.

El gateway sólo agrega lecturas paginadas. No se habilitan borrados físicos, worker, cron ni nuevas operaciones de Storage: removeStorageObject conserva STORAGE_CONDITIONAL_DELETE_UNAVAILABLE. El escaneo no es una instantánea transaccional frente a escritores concurrentes; la retención física y el RPC transaccional original siguen siendo las protecciones de seguridad, y el resultado es un indicador administrativo de las referencias observadas.

## SEC-01, PAY-01 y reglas preservadas

Se verificó diff vacío respecto de `9d067e5` en todas las migrations, configuración/manifest de staging, app/checkout, lib/checkout, servicios de checkout autorizados, configuración comercial y endpoints MP. No se cambian RLS, grants, RPC, precios, políticas comerciales ni Auth.

La suite verifica descuento único 25% sobre lista sin descontar envío ni aplicar dos veces transfer_price; totales congelados; reservas 86.400 segundos sin renovación por replay; expiración/acreditación manual idempotentes; compra invitada ligada a identidad verificada; pedidos y cotizaciones privados; tarifas nacionales del servidor y cotización sin pedido/reserva cuando no hay precio aprobado.

Mercado Pago permanece cerrado: contrato transfer/cash y UI pública sin MP; GET/POST de create-preference y webhook retornan 410/AUTOMATIC_PAYMENTS_DISABLED. Los cuatro controles HTTP sobre el build local pasaron. El SDK/tipos/código legacy archivado de historial permanecen sin callers de aplicación; ningún endpoint importa ese SDK ni usa credenciales o llama al proveedor.

## Pruebas ejecutadas

Runtime: Node 24.19.0, PostgreSQL 15.18 efímero con herramientas externas ya existentes y Chromium del entorno. No PG17 ni claves productivas. Bases nuevas de fixtures en loopback, con migrations únicamente locales, cerradas por los tests. Servidor Next sólo en 127.0.0.1:3107, detenido al terminar.

| Validación | Resultado |
| --- | --- |
| Storage: pagination + product-image-delete-safety | 40/40 PASS en pase focalizado; nueve casos nuevos también pasaron en suite completa. |
| SEC-01 PostgreSQL 15 focalizado | 17/17 PASS, incluido el fixture antes incompatible. |
| Suite completa node --test --test-concurrency=2 tests/*.test.mjs | 767 tests: 766 PASS, 0 FAIL, 0 cancelados, 1 SKIP por falta de URL del servidor navegador durante la suite. |
| Escenario omitido: pay01-guest-shipping-browser con build local | 1/1 PASS, cero skips; completa los 767 escenarios distintos. APIs interceptadas sintéticas; no backend Supabase real. |
| Python launcher safety | 4/4 PASS. |
| npm run lint | PASS: cero errores, 10 advertencias existentes de imágenes. |
| npm run build | PASS. |
| tsc --noEmit después del build | PASS. |
| HTTP GET/POST preferencia y webhook MP | 4/4 respuestas 410 con código AUTOMATIC_PAYMENTS_DISABLED. |
| Gitleaks stdin sobre archivos de código/tests modificados | PASS, sin secretos detectados. |
| git diff --check e invariantes de archivos comerciales/migrations | PASS. |

Variables de tests: LD_LIBRARY_PATH=/workspace/sfstore-test-tools/pg15/usr/lib/x86_64-linux-gnu; SFSTORE_TEST_PG_BIN=/workspace/sfstore-test-tools/pg15-test-bin; SFSTORE_TEST_PG_MODULE=<worktree>/node_modules/pg/lib/index.js; SFSTORE_TEST_PLAYWRIGHT_MODULE=/workspace/sfstore-test-tools/playwright-system.cjs. La ejecución navegador añade SFSTORE_TEST_CHECKOUT_URL=http://127.0.0.1:3107. Herramientas externas sólo adaptan sockets locales de PG15 y selección de Chromium; no implementan QA-01 ni modifican package.json/lock.

Logs de esta ejecución: /tmp/sfstore-integration-completion-tests.log, -build.log, -lint.log, -tsc.log, -browser.log, -python.log; los logs focalizados son /tmp/sfstore-integration-storage-fix-tests.log y /tmp/sfstore-integration-sec01-pg15-fix.log.

## Pendientes y límites

- Validar el stack Supabase local real: GoTrue/Auth, PostgREST, Storage API, CAPTCHA Turnstile y cookies efectivas. Las pruebas SQL/mocks y Chromium no certifican esos servicios.
- Mantener checkout cerrado hasta disponer de configuración comercial aprobada: tarifas, transportista, retiro, revisión de configuración y Auth/CAPTCHA efectivos.
- Mantener el borrado físico deshabilitado; el arreglo de paginación no introduce borrado condicional atómico ni autorización de limpieza.
- Para una base existente, verificar ledger/versiones/hashes antes de proponer cualquier aplicación; la duplicación canónica 202609180002 sigue intacta y sólo tiene alias en el paquete local nuevo. No se reparó ni migró una base remota.
- QA-01, Preview y clasificador histórico no se investigaron ni implementaron en este encargo. Dependencias y sus alertas previas tampoco se actualizaron.
- Rama preparada localmente para revisión, sin push. Antes de una eventual publicación, revisar política de despliegues por rama: vercel.json bloquea el nombre original de staging, no necesariamente el candidato.

## Alcance preservado

No se modificó main ni el worktree original work; no hay cambios de Production, push, merge a main, despliegue, migraciones productivas, eliminación de ramas, credenciales reales ni datos de negocio reales. Sólo se agregaron checkpoints faltantes y se corrigieron el fixture y la consulta paginada en el candidato autorizado.
