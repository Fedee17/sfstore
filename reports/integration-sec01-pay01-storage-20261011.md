# Integración SFSTORE — 11/10/2026

## Resultado y rama

Candidato local: `codex/integration-sec01-pay01-storage-20261011`, worktree `/workspace/sfstore-integration-20261011`. Integra el código publicado más completo y los informes compatibles de las otras dos ramas, sin conflictos ni cambios de lógica. No está publicado, aprobado para Production ni completamente validado: queda un test incompatible con PostgreSQL 15.

Los informes de recuperación/diagnóstico incorporados describen checkouts y entornos anteriores. Sus afirmaciones de ausencia de SEC-01/PAY-01 o bloqueo de red son históricas; este informe registra el resultado actualizado y no afirma que esos bloqueos continúen vigentes.

## Comparación de ramas

Se ejecutó `git fetch origin`; debido al refspec limitado del entorno, se completó con un fetch explícito de las tres ramas a referencias origin nuevas. Main remoto conserva `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`.

| Rama publicada | HEAD | Contenido y decisión |
| --- | --- | --- |
| codex/sec01-pay01-staging-preparation | f0db07432259a65c22a547ba9784dea9107d4abb | Candidato más completo: SEC-01, PAY-01, Storage, mantenimiento, tests y staging PG15. 122 archivos distintos de main, 10.320 inserciones y 1.289 eliminaciones. Base de integración. |
| work | 25e2a29fbc6708373bc85cf874a19a76ae83772e | Main más dos informes de recuperación/staging. Sin funcionalidad adicional. Commit incorporado por cherry-pick como 872d042. |
| codex/staging-diagnostics-backup-20261011 | c5a3ba99e111e66703809fe29f38651bfadd441d | Main más dos informes de diagnóstico. Sin funcionalidad adicional. Commit incorporado por cherry-pick como d8a8a54. |

El candidato completo ya contiene el procesador Storage `a5fa94e`, la retención segura `be25492`, la combinación local `531d411`, el baseline QA `69049e2` y el respaldo SEC/PAY/staging `f0db074`. Los cherry-picks añaden sólo documentación; no reemplazan archivos de la implementación ni eliminan ramas.

## Funcionalidades recuperadas y verificadas

| Área | Evidencia y límites |
| --- | --- |
| SEC-01 | RLS, grants mínimos, RPC service-only, guard de lectura por comprador y rechazo de administración para Auth anónimo. Pruebas SQL reales en PG15 y pruebas de adaptadores con Auth sintético. Un fixture de membresía privilegiada falla por sintaxis PG16, detallado abajo. |
| PAY-01 | Checkout atómico con precios del servidor, idempotencia, locks/concurrencia y rollback. Transferencia/efectivo y acreditación manual administrativa; pedido confirmado y pago acreditado son estados diferentes. |
| Descuento 25% | Política `manual_25_frozen`: 25% sobre precio de lista por línea, una sola vez, para transferencia y efectivo. No vuelve a descontar transfer_price ni afecta envío. Total congelado conserva su valor ante cambios de catálogo y reintentos. |
| Reserva 24 horas | 86.400 segundos medidos por reloj DB, sin renovación por replay. Expiración manual e idempotente; no hay cron activado. Pagos acreditados nunca restituyen stock por vencimiento. |
| Compra como invitado | Supabase Anonymous Auth con identidad/cookie verificada por servidor, sin registro visible ni email obligatorio, ownership por buyer_id; nombre/teléfono obligatorios. Flag, Anonymous Sign-ins y CAPTCHA efectivos siguen siendo condiciones de activación. |
| Envíos nacionales | Destinos de Argentina, provincia/localidad/CP y tarifas del servidor con quoteKey. Costos congelados sin descuento; tarifa desconocida crea cotización privada e idempotente, sin pedido/reserva/total inventado. No configura tarifas ni contrata transporte automáticamente. |
| Storage | Procesador de tareas pendiente, retención de objetos existentes, cola durable de limpieza administrativa y permisos. Pruebas usan Storage simulado y metadata sintética; no se activó worker ni se borraron objetos reales. |
| Mercado Pago | GET/POST de preferencia y webhook devuelven 410/AUTOMATIC_PAYMENTS_DISABLED, sin SDK, DB ni llamada al proveedor. Contrato de checkout acepta sólo transfer/cash y UI pública no ofrece MP. Código legacy, dependencia y tipos/registros históricos permanecen archivados: sólo tests referencian lib/payments/legacy-mercadopago; no hay callers de aplicación. |
| Staging | Configuración original `staging/supabase/config.toml` con major_version=15, identidad sintética, Auth anónimo/CAPTCHA y puertos locales. Manifest de 23 pasos con hashes verificados. No se inició Supabase completo. |

## Migraciones y faltantes

Presentes y ejecutadas únicamente en bases PostgreSQL efímeras loopback con fixtures: `202610100001_product_storage_task_results`, `202610100002_durable_admin_image_delete`, `202610110001_sec01_effective_permissions`, `202610110002_pay01_atomic_checkout`, `202610110003_pay01_manual_payments`, `202610110004_pay01_approved_commercial_rules`, `202610110005_pay01_inventory_transition_permissions`, `202610110006_pay01_guest_national_shipping`.

No se identificó una migration faltante para esos desarrollos en las ramas comparadas. Hay dos archivos canónicos de versión 202609180002. El manifest resuelve suppliers_admin como 202609180003 únicamente para una base local nueva; las fuentes originales no cambiaron. Se materializaron 23 archivos ignorados nuevos con creación exclusiva y SHA-256 verificado, sin sobrescribir manifest o fuentes. Para una base existente faltan ledger/hash/objetos autorizados: no se puede resolver ni reparar su historial por inferencia.

QA-01 está explícitamente PREPARADA, NO IMPLEMENTADA en el backlog: falta el runner reproducible con preflight y scripts; sí se recuperaron tests y documentación de baseline. No se reconstruyó esa funcionalidad.

Checkout y shipping permanecen cerrados en `config/checkout-shipping.pending.json`: faltan revisión comercial, tarifa/transportista y condiciones de retiro. Invitados requiere habilitación Auth/Turnstile efectiva y claves de staging correspondientes; no se configuraron credenciales. No presentar cobertura nacional implementada como un servicio de envío ya operativo.

## Pruebas y resultados

Runtime: Node 24.19.0; PostgreSQL 15.18 extraído en herramientas externas al repositorio, sin instalar un servicio del sistema; Chromium del entorno vía adaptador Playwright externo. Cada test SQL crea una base nueva con roles/fixtures sintéticos y puerto loopback, aplica migrations locales y la cierra. No se cargaron archivos .env ni credenciales productivas.

| Check | Resultado |
| --- | --- |
| npm ci --ignore-scripts --cache /tmp/sfstore-integration-npm-cache | PASS: 406 paquetes, lock sin cambios. Primer intento falló por caché no escribible en /home; corregido con caché permitida. |
| Suite node --test --test-concurrency=2 tests/*.test.mjs con SFSTORE_TEST_PG_BIN, SFSTORE_TEST_PG_MODULE y SFSTORE_TEST_PLAYWRIGHT_MODULE | 758 tests: 756 PASS, 1 FAIL, 1 SKIP, 0 cancelados. |
| Checkout navegador, ejecutado por separado con SFSTORE_TEST_CHECKOUT_URL loopback | 1/1 PASS, cero skips. Resuelve el escenario omitido en la suite; utiliza API interceptada sintética, no GoTrue/PostgREST real. |
| Formulario React/HEIC/retry/doble-submit con Chromium | 1/1 PASS en ejecución focalizada y también incluido en la suite final. No contar como dos escenarios distintos. |
| Python unittest staging_runtime_safety_test.py | 4/4 PASS. |
| npm run lint | PASS: 0 errores, 10 warnings de imágenes. |
| npm run build | PASS, sin credenciales Supabase. |
| tsc --noEmit, después del build | PASS. |
| HTTP local real: GET/POST create-preference y webhook MP | 4/4 respuestas 410 con código AUTOMATIC_PAYMENTS_DISABLED. |
| Gitleaks git --log-opts=HEAD --redact | PASS: sin leaks detectados, historial integrado previo a este informe (74 commits escaneados por la herramienta). No es una garantía absoluta de ausencia de secretos. |
| git diff --check y fuentes/manifest | PASS; sin cambios funcionales ni hashes alterados. |

Comandos de la suite: LD_LIBRARY_PATH apunta a las bibliotecas extraídas de PG15; SFSTORE_TEST_PG_BIN=/workspace/sfstore-test-tools/pg15-test-bin, SFSTORE_TEST_PG_MODULE=<worktree>/node_modules/pg/lib/index.js y SFSTORE_TEST_PLAYWRIGHT_MODULE=/workspace/sfstore-test-tools/playwright-system.cjs. El wrapper externo pg_ctl añade `-k /tmp` porque /var/run/postgresql no existe; initdb/SQL/tests no fueron modificados. El adaptador Playwright elige /usr/bin/chromium. Estas herramientas no implementan el runner QA-01 pendiente.

Antes de ese ajuste, el primer pase reportó 627 PASS, 1 FAIL, 128 cancelados y 2 skips por arranque de PG y copias SQL ausentes. Se diagnosticaron ambos problemas, se materializaron las copias por manifest y se repitió la suite. Esa ejecución inicial no constituye un fallo funcional de la implementación.

### Fallo pendiente concreto

`tests/sec01-effective-permissions.test.mjs:240`, "membership in a privileged role is rejected even without inherited ACLs": el fixture ejecuta `grant fixture_privileged to anon with inherit false`, sintaxis disponible desde PG16. PG15 devuelve 42601, syntax error at or near inherit, antes de probar la migration. La migration utiliza pg_has_role(..., 'MEMBER') y las otras verificaciones pasan; este caso particular no quedó validado. No se cambió el test, no se omitió para declarar PASS ni se sustituyó PostgreSQL 15 por PG17. Requiere una corrección del fixture compatible con PG15 y nueva validación antes de aprobar integración.

### Límites y acciones pendientes

1. Corregir de forma revisable el fixture SEC-01 compatible con PG15; luego volver a ejecutar ese caso y los checks afectados.
2. Completar QA-01 como un encargo separado; no fue implementado desde cero aquí.
3. Validar stack Supabase real local: Anonymous Auth, persistencia/refresh de cookies, Turnstile, PostgREST y Storage API; mocks/metadata SQL/build no certifican esos servicios.
4. Definir/configurar tarifas, transportista, retiro y revisión comercial antes de habilitar checkout. No activar worker ni cron por consecuencia de integrar código.
5. Para bases existentes revisar historial de migraciones y permisos efectivos autorizados, sin db push/repair/productive migrations.
6. Antes de publicar la nueva rama, comprobar la política de despliegue: vercel.json bloquea la rama original de staging, no este nuevo nombre. No se hizo push ni se invocó Vercel; la publicación no debe implicar un despliegue accidental.
7. Las alertas de dependencias documentadas en el candidato siguen pendientes; no se actualizaron paquetes ni se hizo un nuevo audit en este encargo.

## Preservación

main no fue modificado y el worktree original conserva work en 25e2a29 limpio. Se crearon una rama y un worktree nuevos; se incorporaron commits de documentación sin conflicto. No hubo sobrescrituras de fuentes existentes, reconstrucción de funcionalidades, push, merge a main, despliegues Vercel, acceso/modificación de Production, credenciales reales ni migraciones remotas. La rama queda como candidato de revisión con el bloqueo explícito anterior, no como integración lista para producción.
