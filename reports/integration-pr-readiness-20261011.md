# SFSTORE — respaldo y revisión previa a PR

Fecha: 2026-10-11 UTC. Rama: `codex/integration-sec01-pay01-storage-20261011`. Base remota verificada: `origin/main` en `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`.

## Integridad y revisión

El checkout estaba limpio en `bfcabcc92ac84c06730d51076f664fce32cf499d`. Ese commit corrige el puerto documentado de la prueba local; su antecesor `cf35045` contiene la paginación Storage y el fixture SEC-01 compatible con PostgreSQL 15. Los checkpoints originales `30f6f6f` y `a012bf4` están incorporados por cherry-pick. No se reconstruyeron funcionalidades ni se duplicó el procesador heredado.

SEC-01 conserva RLS, columnas públicas mínimas, RPC service-only y autorización de lecturas privadas. PAY-01 conserva checkout atómico con precios del servidor, descuento único del 25% excluyendo envío, reservas de 24 horas, idempotencia, acreditación/expiración manual y compra invitada con identidad verificada. Cotizaciones nacionales sin tarifa aprobada no crean pedido ni reserva. Storage conserva cola transaccional y retención física; la lectura de referencias pagina por id, rechaza páginas inválidas y propaga errores. No constituye una instantánea frente a escritores concurrentes. `removeStorageObject` continúa bloqueado.

Mercado Pago: GET/POST de preferencia y webhook devuelven incondicionalmente 410/AUTOMATIC_PAYMENTS_DISABLED. No importan SDK, credenciales ni callers legacy. El contrato público admite transferencia/efectivo; el código legacy archivado no habilita pagos automáticos.

Gitleaks sin hallazgos en el historial alcanzable de HEAD y en los cambios pendientes respecto de main. Se revisaron los archivos versionados de configuración: el único ejemplo env contiene claves de reemplazo y loopback. La detección automatizada no certifica secretos fuera del repositorio.

## Evidencia de pruebas disponible

Ver [informe de cierre](integration-completion-sec01-storage-20261011.md): suite Node 767 casos, 766 PASS y un SKIP de navegador ejecutado luego por separado (1/1 PASS); SEC-01 PG15 17/17; Storage 40/40 incluyendo 1.105 referencias compartidas; launcher Python 4/4; build/TypeScript PASS; lint sin errores y diez advertencias existentes; cuatro respuestas HTTP MP verificadas. Son fixtures SQL/mocks y navegador con APIs interceptadas, no certificación del stack Supabase real. La preparación de publicación sólo añade configuración de despliegue por rama y documentación; no altera código funcional ni SQL.

## Migraciones nuevas respecto de main: orden propuesto

La existencia de archivos nuevos no demuestra qué está aplicado en una base remota. Antes de cualquier ejecución autorizada hay que comparar ledger, versiones, nombres, statements/hashes y objetos efectivos mediante lectura autorizada; no se consultó ni modificó la DB productiva.

1. `202610100001_product_storage_task_results.sql`: resultados de tareas Storage.
2. `202610100002_durable_admin_image_delete.sql`: borrado de metadata y encolado transaccional; conservar retención física.
3. `202610110001_sec01_effective_permissions.sql`: permisos efectivos mínimos; revisar membresías privilegiadas, owners y ACL reales. Aplicada sola bloquea el checkout anterior.
4. `202610110002_pay01_atomic_checkout.sql`: checkout privado atómico, depende de SEC-01.
5. `202610110003_pay01_manual_payments.sql`: acreditación y liberación manual.
6. `202610110004_pay01_approved_commercial_rules.sql`: 25%, 24 horas y totales congelados.
7. `202610110005_pay01_inventory_transition_permissions.sql`: permisos de columnas necesarios para transición reserva/venta.
8. `202610110006_pay01_guest_national_shipping.sql`: invitados y cotizaciones nacionales privadas.

Requieren las migraciones previas del baseline. `staging/migration-manifest.json` registra los 23 pasos para una DB local nueva. La colisión canónica de las dos versiones `202609180002` permanece intacta: el alias `202609180003` de suppliers_admin es exclusivamente local. No usar el manifest para reparar/reaplicar una base existente ni ejecutar un db push ciego. Preparar un plan coordinado SQL/callers, respaldo y recuperación antes de autorizar rollout.

## Vercel: evidencia y protección del respaldo

Consultas autenticadas de lectura confirmaron proyecto SFSTORE conectado a `Fedee17/sfstore`. El Preview `dpl_3UrmiTpZ2qMLMsEkxUMpve9VG68T` tiene source=git, rama work y SHA 25e2a29. El despliegue productivo vigente listado `dpl_9puT5pakKP7Bv8rJ2UzPgMWPktkp` corresponde a main y SHA 7a8a105. Por la integración Git y la ausencia de bloqueo para main, debe tratarse la fusión como disparador de despliegue automático de Production. Los resultados normalizados no exponen todos los ajustes de auto-deploy; reconfirmar en el panel antes de fusionar.

`vercel.json` añade deploymentEnabled=false sólo para esta rama de integración, conservando el bloqueo de la rama original y la política de main. Impide que el respaldo dispare un Preview por Git. No se cambiaron ajustes remotos de Vercel/Production ni se desplegó manualmente. La PR debe permanecer en borrador hasta resolver los gates; no fusionar como mecanismo de prueba.

## Requisitos antes de integrar/habilitar checkout

- Revisión humana de ACL/RLS, RPC privilegiadas, ownership de recibos/cotizaciones y flujo de acreditación manual; comprobar dependencias y alertas documentadas sin suponer que quedaron resueltas.
- Validar GoTrue/Auth, PostgREST y Storage API reales en staging aislado con PostgreSQL 15; probar CAPTCHA Turnstile, renovación/recuperación de cookies, usuarios invitados y rechazo de acceso cruzado. QA-01 no se implementó en este alcance.
- Aprobar tarifas nacionales, transportista, costo/condiciones de retiro y revisión comercial. `config/checkout-shipping.pending.json` contiene nulls: no es configuración para insertar. Checkout continúa cerrado y ninguna migration lo activa.
- Configurar Anonymous Sign-ins, CAPTCHA efectivo del proveedor, dominio/site key y `CHECKOUT_GUEST_ENABLED` únicamente en el entorno autorizado después de validar. Mantener la clave service_role en servidor; no publicar ni reutilizar credenciales productivas en pruebas.
- Definir operación manual de reservas vencidas y pagos tardíos, responsables de acreditación y recuperación. Mantener sin cron, cobros automáticos, Mercado Pago y borrado físico.
- Revisar ledger y autorizar por separado aplicación SQL y despliegue. Coordinar/pausear el despliegue automático de main mediante acción autorizada antes de merge: publicar callers sin esquema y aplicar SEC-01 sobre el checkout antiguo pueden interrumpir ventas. Esta preparación no cambia esa configuración.

Publicación autorizada mediante push normal exclusivamente de la rama; PR hacia main en borrador, sin merge. No se ejecutaron migraciones en esta tarea ni se modificaron Production, main o ramas existentes.
