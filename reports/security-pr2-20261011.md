# SFSTORE — auditoría de seguridad de PR #2

Fecha: 2026-10-11 UTC. PR: https://github.com/Fedee17/sfstore/pull/2. Rama: `codex/integration-sec01-pay01-storage-20261011`.

## Recomendación

El candidato corregido puede avanzar a **validación técnica en staging aislado con datos sintéticos**, después de aplicar sus nueve migraciones pendientes en el orden revisado. No se certifican Auth/PostgREST/Storage API/CAPTCHA reales ni disponibilidad productiva. Mantener la PR en borrador, checkout cerrado, Mercado Pago y borrado físico deshabilitados. No fusionar hasta resolver los requisitos operativos y la automatización de Vercel.

## Alcance y modelo de confianza

Diff inicial fijado: main `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6` → PR `c27a42b2c62affcf67a31f383579151200440948`. Se revisaron las migraciones SEC/PAY/Storage, permisos efectivos y membresías, contratos HTTP, Auth/cookies, recibos/cotizaciones, acciones administrativas, lifecycle SQL y su interacción con RPC heredadas, paginación/retención/limpiadores Storage, staging y cambios de dependencias/configuración relevantes. Se siguieron los callers heredados de inventario y pagos cuando explicaban el efecto del diff. Los documentos históricos y tests de Mercado Pago archivado no prueban que el proveedor esté activo.

Actores: navegador sin sesión, invitado Auth verificado, comprador distinto, administrador allowlisted y servidor privilegiado. Los datos del body/URL no autorizan identidad, precio, total ni pago. `service_role` es una frontera de confianza: RLS no la limita. Las RPC service-only reciben buyer/admin UUID confiables desde callers que verifican getUser y allowlist; no implementan una segunda allowlist SQL. Una clave privilegiada comprometida queda fuera de las garantías de ownership del navegador.

## Hallazgos y correcciones

| ID | Prioridad y condición | Evidencia previa | Corrección |
| --- | --- | --- | --- |
| PR2-01 | P2, error de importe de pago | El recibo formateaba `157.25` como `$ 157`, también en el texto para WhatsApp. La RPC exige acreditar exactamente `157.25`; el importe indicado al cliente podía impedir la acreditación. | Recibo con dos decimales, siempre desde el total del servidor. Prueba de render y texto WhatsApp con centavos y total URL falsificado. |
| PR2-02 | P2, endurecimiento condicionado a grants/canal SQL | Con grants TRUNCATE sintéticos en storage.objects/buckets, anon pudo ejecutar TRUNCATE CASCADE pese al guard RLS del bucket. Se hizo rollback. No se demuestra que esos grants existan remotamente ni una ruta HTTP pública capaz de ejecutar TRUNCATE. | Migration 007 revoca TRUNCATE de PUBLIC/anon/authenticated en ambas tablas. Aborta y revierte todo si una membresía puede recuperar el privilegio, incluso NOINHERIT en PG15. No modifica grupos de terceros ni privilegios de fila de otros buckets. |
| PR2-03 | P2, integridad ante escrituras privilegiadas | Un UPDATE autorizado con service_role podía mover una línea de un pedido legacy a un checkout congelado: el trigger verificaba únicamente OLD.order_id. Quedaban líneas ajenas al total y a la evidencia de reserva. No se encontró un caller público que exponga ese UPDATE. | Migration 007 comprueba OLD y NEW para UPDATE, manteniendo INSERT/DELETE y filas legacy. La prueba reproduce reasignación hacia un checkout acreditado y verifica rechazo/rollback. |
| PR2-04 | P2, creación pública con configuración habilitada y total cero | Un producto de precio cero con retiro gratuito creaba pedido y reserva total cero. La acreditación manual sólo admite importes positivos; ese contrato está expresamente pendiente en BUSINESS_RULES. | Migration 007 agrega un trigger de INSERT que rechaza nuevos checkouts de total no positivo antes de ítems/stock, con rollback del cliente insertado. HTTP mapea CHECKOUT_UNSUPPORTED_TOTAL a 409. Se verifica ausencia de cliente/pedido/operación/movimiento y stock intacto. El trigger no interviene en UPDATE de pedidos anteriores ni introduce una política de pedidos gratuitos. |

Se reprodujeron los fallos antes de corregirlos. No se encontró una lectura cruzada de pedidos/cotizaciones ni acreditación de pagos alcanzable por invitados en los caminos revisados. Esto no equivale a una garantía sobre configuraciones remotas o rutas futuras.

## Verificaciones por frontera

| Área | Resultado y límite |
| --- | --- |
| RLS/grants/RPC | Tablas privadas sin lecturas/escrituras públicas; catálogo limitado por columnas y policies restrictivas. Membresías de roles privilegiados/owners y permisos heredados inesperados abortan SEC-01. RPC críticas service-only, SECURITY INVOKER; nueva función de INSERT también revocada a PUBLIC/anon/authenticated y con search_path fijo. Extensiones/objetos remotos desconocidos requieren inventario del entorno real. |
| Invitados/PII | getUser verifica identidad; recibos filtran order_id y buyer_id, cotizaciones id y buyer_id. Un comprador distinto obtiene null y no se consulta payment_status. No se autoriza por email, UUID del body o importe URL. Cookies invitadas separadas HttpOnly/Secure/SameSite, sesión inválida no cae a otra identidad; respuestas sin tokens/PII y no-store. Renovación y CAPTCHA real pendientes. |
| Acreditación | requireAdminActionSession antes de construir cliente privilegiado; allowlist del servidor y rechazo de is_anonymous. Importe completo, referencia única, expiración y estado verificados SQL. confirmed no equivale a paid; triggers bloquean escrituras legacy de pagos sobre checkout. Server Actions conservan autorización propia y controles de origen del framework. |
| Idempotencia/concurrencia | Hash de request y lock por comprador/operación; locks de pedidos y productos; transacción para cliente/pedido/ítems/stock/evidencia. Pruebas de dobles creaciones, pago concurrente, pago vs vencimiento, stock insuficiente, rollback de ledger/liberación y replay después de cambios de precio. Misma referencia bancaria no acredita otro pedido. |
| Reservas | 86.400 segundos; replay no renueva. La acreditación revalida vencimiento tras espera de locks. Liberación manual idempotente; pedidos pagados/recibos/pagos aprobados protegidos. No cron. Una reserva vencida sigue pendiente hasta liberación manual: operación y responsables pendientes. |
| 25% | Cada unidad se calcula una vez como round(price × 0.75, 2), desde precio lista; no reutiliza transfer_price. Se multiplica por cantidad y congela; envío no se descuenta. Pruebas de ambos métodos, precios diferenciados, centavos y replay. |
| Mercado Pago | GET/POST de preferencia/webhook retornan 410 incondicional, sin leer body, SDK, DB ni credenciales. UI/contrato público transfer/cash. SDK/tipos/archivo legacy permanecen, sin callers de aplicación; no representan habilitación. |
| Storage | Policy restrictiva niega listar/mutar product-images a roles públicos, y 007 cubre TRUNCATE. URL pública de bucket público sigue siendo pública por diseño; nunca subir comprobantes o PII ahí. Cola/metadata atómicas; paginación con más de 1.000 referencias, errores fail-closed/compensación. Worker/limpiadores no hacen DELETE físico; apply de CLI cerrado. Escaneo de referencias no es snapshot transaccional: la retención física sigue siendo esencial. |
| Compatibilidad | Migraciones originales conservadas byte por byte. Nueva 007 sólo DDL/grants/guards, sin UPDATE/DELETE/TRUNCATE de filas ni seed/activación. Fixture con filas legacy prueba snapshots intactos, grants mínimos de service_role y acreditación tras 005. PostgreSQL 15.18, no PG17. No se ejecutaron SQL remotos. |

## Migraciones: nueva dependencia y orden

Nueve archivos nuevos respecto de main, **no** afirmación de estado aplicado en una DB remota:

1. 202610100001_product_storage_task_results.sql
2. 202610100002_durable_admin_image_delete.sql
3. 202610110001_sec01_effective_permissions.sql
4. 202610110002_pay01_atomic_checkout.sql
5. 202610110003_pay01_manual_payments.sql
6. 202610110004_pay01_approved_commercial_rules.sql
7. 202610110005_pay01_inventory_transition_permissions.sql
8. 202610110006_pay01_guest_national_shipping.sql
9. **202610110007_checkout_storage_review_guards.sql**

Checksums en `reports/sec01-pay01-integration-migration-manifest.json`; staging nuevo ahora tiene 24 pasos en `staging/migration-manifest.json`. Las dos versiones canónicas 202609180002 siguen intactas; el alias 202609180003 de suppliers_admin sólo sirve para DB local nueva. La migración 007 exige prerequisitos y corre con transacción/timeouts; si detecta membresías peligrosas, resolverlas mediante revisión/autorización, no relajar el guard. Es de aplicación única a través del ledger, no script para reaplicar manualmente.

Antes de cualquier aplicación futura: comparar ledger/versiones/nombres/SQL/hashes, ACL/owners/Storage reales y objetos desconocidos, preparar respaldo/recuperación y coordinar SQL/callers. SEC-01 sola bloquea checkout anterior; publicar callers sin RPC también interrumpe ventas. No usar el paquete local para reparar una base existente.

## Pruebas y reproducibilidad

Runtime local: Node 24.19.0, PostgreSQL 15.18, bases efímeras sólo en loopback. Variables: SFSTORE_TEST_PG_BIN=/workspace/sfstore-test-tools/pg15-test-bin; SFSTORE_TEST_PG_MODULE=<worktree>/node_modules/pg/lib/index.js; LD_LIBRARY_PATH=/workspace/sfstore-test-tools/pg15/usr/lib/x86_64-linux-gnu; SFSTORE_TEST_PLAYWRIGHT_MODULE=/workspace/sfstore-test-tools/playwright-system.cjs. Ninguna clave productiva o DB real.

Suite final `node --test --test-concurrency=2 tests/*.test.mjs`: **773 casos, 772 PASS, 0 FAIL, 0 cancelados, 1 SKIP** por falta de URL para el escenario navegador. Incluye seis nuevos casos relevantes y extensión del mapping HTTP. Launcher Python 4/4 PASS. Lint global sin errores y diez advertencias existentes; lint focalizado de fuentes cambiadas sin diagnósticos.

El escenario omitido se ejecutó por separado: **1/1 PASS, cero skips**, en 127.0.0.1:3191 sobre el build actualizado, con APIs interceptadas sintéticas y las cuatro respuestas MP 410 verificadas. Completa los 773 escenarios distintos; no es prueba del backend Supabase real. Build y TypeScript posterior PASS. Gitleaks de archivos versionados y nuevos sin hallazgos; el historial inicial ya tenía auditoría sin hallazgos y se verifica adicionalmente el commit de correcciones antes del push. Logs adicionales: `/tmp/sfstore-pr2-security-browser.log`, `-final-build.log`, `-final-tsc.log`, `-final-lint.log`; `/tmp/sfstore-pr2-security-gitleaks-files.json`.

Logs: `/tmp/sfstore-pr2-security-before.log`, `/tmp/sfstore-pr2-sql-before.log`, `/tmp/sfstore-pr2-zero-before.log` (reproducciones); `/tmp/sfstore-pr2-security-final.log` (resultado final). Un pase intermedio se invalidó mientras se completaba la corrección de total cero: una prueba experimental de reaplicación de 007 chocó con su DDL de aplicación única y dejó la transacción abortada. Se retiró esa expectativa impropia; la suite final corre con las fuentes completas y sin fallos. No se cambió ningún assert de idempotencia de pedidos/pagos ni se desactivaron pruebas de seguridad.

## Pendientes antes de exposición pública

- Validar GoTrue/PostgREST/Storage API y CAPTCHA Turnstile efectivos, cookies/rotación y acceso cruzado sobre el stack aislado real. SQL/mocks/Chromium no certifican esos servicios. No se reintentó iniciar Supabase en esta auditoría.
- Definir protección contra abuso de reservas y cotizaciones: CAPTCHA de creación de identidad no limita las operaciones posteriores de una sesión válida. No existen cuotas comerciales aprobadas ni limitador propio por comprador; un usuario puede reservar stock disponible con distintas claves. No se inventaron límites. Evaluar mitigaciones antes de activar ventas públicas.
- Mantener checkout cerrado hasta aprobar tarifas, retiro, transportista y revisión comercial; verificar Anonymous Sign-ins, CAPTCHA y flag invitado en el entorno autorizado. Manejo de pagos tardíos, parciales, reembolsos y pedidos antiguos de total cero requiere decisión explícita; no se implementó por inferencia.
- Revisar alertas de dependencias ya documentadas; esta auditoría no actualiza paquetes ni constituye un nuevo análisis exhaustivo de sus advisories. QA-01 y otros desarrollos diferidos permanecen fuera del encargo.
- Vercel conecta main con Production mediante Git según la lectura autenticada previa. La rama PR tiene deploymentEnabled=false; coordinar/reconfirmar automatización antes de merge con autorización separada. No se cambió la configuración remota.

Auditoría directa y pruebas locales: los helpers/preflight y motor durable de Codex Security no estaban disponibles en esta sesión; no se generó ni se atribuye un scan formal/SARIF. Las garantías se limitan a fuentes y fixtures descritos, no a una inspección de Production. No hubo merge, despliegue, migración remota, borrado de ramas ni activación de pagos.
