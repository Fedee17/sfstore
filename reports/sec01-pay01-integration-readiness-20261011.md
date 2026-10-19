# SEC-01/PAY-01 — Preparación de integración

Fecha: 2026-10-11. Candidato local `codex/sec01-pay01-integration-readiness`, `/workspace/sfstore-integration-readiness`, HEAD `69049e2` más snapshot intacto de PAY-01/SEC-01 y reglas aprobadas. Se preservan las ramas y worktrees previos. Los cambios heredados y nuevos permanecen sin confirmar/publicar; una rama que solo apunte a HEAD no contiene este diff hasta crear commits revisados. Sin push, merge, deploy, migraciones productivas o consultas a Production.

## Resultado y límites

**El conjunto funciona sobre el esquema versionado con fixtures preexistentes, después de añadir un grant mínimo faltante.** La preparación permite revisión e integración técnica; **no permite abrir todavía el checkout al público**. Falta el flujo de comprador sin registro y configuración real de entrega, inspección del esquema efectivo y autorizaciones separadas de aplicación/publicación.

Se comprobó descuento único del 25%, precios congelados, reserva de 24 horas, liberación administrativa idempotente, protección de pedidos acreditados, autorización SEC-01 y MP bloqueado. La verificación local no certifica grants/objetos, políticas, historia de migraciones o datos de Production.

## Orden SQL recomendado y dependencias

Prerequisitos: schema y migrations previas realmente presentes hasta `202610060001_atomic_product_save.sql`; no volver a aplicarlas ciegamente. Storage necesita product_storage_tasks/product_save_operations, helpers de guardado/borrado seguro, roles Supabase y storage.objects con RLS; SEC-01 además exige sus 18 tablas base/privadas, roles públicos sin privilegios elevados/memberships propietarios, service_role BYPASSRLS y objetos compatibles. PAY-01 necesita el libro/order workflows/inventory existentes.

| Orden | Archivo | Cambio/dependencia | Efecto al aplicar |
| --- | --- | --- | --- |
| 1 | `202610100001_product_storage_task_results.sql` | Añade product_storage_tasks.result jsonb nullable; necesita tabla de atomic_product_save | Sin DML ni ejecución de tareas |
| 2 | `202610100002_durable_admin_image_delete.sql` | Wrapper invoker metadata+enqueue; requiere delete_product_image_metadata, enqueue y tablas de guardado | Define función service-only; no la invoca, no borra objetos |
| 3 | `202610110001_sec01_effective_permissions.sql` | RLS/ACL y proyección de catálogo, incluye wrapper Storage existente | Niega checkout anon antiguo; sin DML de negocio |
| 4 | `202610110002_pay01_atomic_checkout.sql` | Exige policy SEC-01 en orders; crea configuración/operaciones/lifecycle/guards | Configuración vacía, sin crear pedidos/reservas |
| 5 | `202610110003_pay01_manual_payments.sql` | Requiere 002 y libro record_order_payment; cash, audit/manual payment y guard del libro | Conserva MP histórico representable; sin acreditación ni activación |
| 6 | `202610110004_pay01_approved_commercial_rules.sql` | Requiere 003; reemplaza creación/lifecycle/expiry y amplía constraint de política | 25% único, 24h y protección paid para invocaciones posteriores; no recalcula históricos |
| 7 | `202610110005_pay01_inventory_transition_permissions.sql` | Grant necesario para UPDATE de evidencia en lifecycle | UPDATE(movement_type,reason) solo a service_role; sin DML |

002 define una primera versión de create_checkout_atomic, 003 la adapta y 004 la sustituye por la política final. No publicar ni configurar un estado intermedio. 003 reemplaza constraint de método conservando transfer/mercadopago y añadiendo cash; 004 conserva current_catalog en configuración histórica, pero lo rechaza para nuevas compras. 005 no cambia identidad, RLS, roles ni credenciales.

Storage 002 no referencia result directamente; colocar 001 primero asegura el contrato completo usado por el código integrado y verificación. SEC-01 incluye el wrapper de 002 en su inventario; este orden deja todos los objetos existentes al endurecer permisos. No hay conflicto de nombres/versiones entre las **siete pendientes**. [Manifest de orden/checksums](sec01-pay01-integration-migration-manifest.json).

**Conflicto preexistente del historial:** dos archivos comparten `202609180002` (`suppliers_admin` y `store_sales_checkout`). El runner local aplica nombres completos en orden y no modela el ledger de versiones de Supabase. No renombrar ni reejecutar archivos históricos sin comparar historia/esquema reales; la colisión puede afectar un flujo CLI basado en versión. Esta tarea no usa supabase db push. Aplicación manual por SQL Editor no registra automáticamente una historia compatible con el CLI: definir y verificar el registro antes de un rollout posterior basado en CLI.

Estas migrations no son todas idempotentes ni todas estrictamente aditivas: ADD COLUMN sin IF NOT EXISTS, CREATE TABLE/FUNCTION inicial, reemplazos de funciones/constraints/triggers y cambios de RLS/ACL. Inspeccionar qué está aplicado antes de ejecutar; no intentar solucionar una colisión eliminando tablas/columnas. SQL contiene BEGIN/COMMIT y fallos revierten el archivo; no confundir eso con rollback global de siete archivos aplicados por separado. SEC/PAY usan timeouts 5s/30s; Storage no los declara: planificar ventana y límites revisados sin afirmar ausencia de bloqueos.

## Corrección encontrada con permisos mínimos

Las suites anteriores creaban default grants amplios para el servicio en la DB sintética. Sin ellos, SEC-01 deja inventory_movements con SELECT/INSERT y PAY-01 ejecuta `UPDATE ... SET movement_type='sale',reason=...` durante confirmación. La acreditación falla **42501** y revierte recibo, estado y libro; no pierde stock ni acredita falsamente. Es una dependencia de permisos confirmada localmente, no una vulnerabilidad explotable demostrada en Production.

005 concede únicamente UPDATE de las columnas requeridas al servicio. Prueba: sin UPDATE de tabla ni de quantity, acreditación/repetición funcionan y stock permanece descontado una sola vez. Anon/authenticated siguen sin UPDATE de ninguna columna. No se revocan grants amplios ya existentes: el SQL de inspección los informa para revisión; no se normalizan permisos productivos por inferencia. Mantener el caller administrativo getUser+allowlist, porque BYPASSRLS no acredita por sí mismo identidad humana.

## Precio, reservas y pagos

- Lista 100, transfer_price 75/80/50/120/null: se cobra 75 por unidad para transferencia/efectivo. Nunca 75 * 0.75. La RPC ignora transfer_price para esta regla, no cambia el catálogo, valida productos y calcula con numeric/centavos. No descuenta envío.
- Pedido/ítems/result se congelan al crear. Cambios de catálogo y retries no recalculan importes; una acreditación de un importe diferente se rechaza.
- Ambos métodos reservan 86400 segundos con reloj DB. Replay no renueva plazo. Vencimiento por sí solo no ejecuta nada; acción administrativa libera pending/vencido con locks, SKIP LOCKED y rollback por pedido/reintento. Repetición/concurrencia no restituyen dos veces.
- confirmed no equivale a paid. Acreditación manual completa registra admin/clave/referencia/libro y convierte reserva atómicamente. Paid, pagos aprobados y evidencia manual impiden liberar por vencimiento/cancelación. Pagos tardíos no reviven stock automáticamente.
- MP: GET/POST de preferencia/webhook 410 para cualquier pedido/cuerpo, sin SDK/credenciales/DB/red. UI pública sin MP y retornos legacy redirigen; originales archivados server-only sin callers. Tipos/admin/libro históricos siguen representándolo sin cobrar ni conciliar automáticamente. No se habilitan otras pasarelas ni cron.

## Propuesta para comprar sin registrarse

**Recomendación: Supabase Auth Anonymous Sign-ins con sesión estable gestionada por servidor**, sin pantalla de registro ni contraseña. Crea una identidad técnica interna Auth (no una inscripción visible), con UUID y tokens verificados. Ese usuario tiene rol SQL authenticated, distinto del rol anon sin sesión. SEC-01 mantiene ambos sin escritura/lectura privada/EXECUTE crítico; checkout sigue pasando por servidor service-only, no por inserts desde el navegador.

El adaptador actual usa getUser y buyer_id en ownership/idempotencia, por lo que esta identidad encaja con `buyer_authorization='authenticated'` sin relajar RLS ni habilitar `guest_capability`. Actualmente **no existe** bootstrap de sesión invitada: abrir el formulario sin sesión da 401. No basta insertar esa configuración ni activar Anonymous Sign-ins para tener un flujo público completo. El backend no recibe buyer_id del cliente; se conserva ese contrato.

Implementación futura propuesta, no desarrollada/activada en este encargo:

1. Inicio de sesión invitada explícito en endpoint servidor del mismo origen; obtener/reutilizar getUser válido antes de crear otra identidad. Permitir solo método previsto, Origin/CSRF, validación bot y límites de Auth/servidor revisados. No inventar cantidades o ventanas comerciales de reservas.
2. Cookies de sesión servidor Secure en HTTPS, HttpOnly, SameSite apropiado al flujo y refresh controlado. Escribir cookies realmente en un contexto que lo admita; no silenciar fallos y luego asumir sesión estable. No incluir tokens, PII o claves del servicio en URL, logs o almacenamiento accesible por scripts.
3. Idempotencia vinculada al UUID persistente y clave guardada antes de enviar. No crear una nueva identidad/clave automáticamente tras respuesta incierta o pérdida de sesión. Otro dispositivo/limpieza de cookies no puede recuperar un pedido solo con UUID/email; definir recuperación con verificación de email/OTP o atención administrativa autorizada. Link/email no verificado no demuestra ownership.
4. Recibo filtrado por order_id+buyer_id; público sin sesión o distinto comprador denegado. Identidad invitada y correo comercial declarado no confieren administración. Añadir rechazo explícito de identidad anónima al guard administrativo del futuro flujo, además de mantener getUser+allowlist.
5. Activar Anonymous Sign-ins/bot controls solo con autorización separada del entorno; verificar configuración/rate limits y política de conservación de identidades. No programar limpieza Auth ni nuevas ejecuciones desatendidas por defecto.

Pruebas necesarias para ese futuro cambio: sesión invitada estable tras recarga/refresh, cookie fallida/bot/auth outage fail-closed, doble submit/retry sin nuevo UID, sesión robada/perdida y recibos cruzados, CSRF, incapacidad de usuario invitado para acreditar pago/liberar reservas/admin, SEC-01 directo y efectos sobre cache. No se afirma que esas pruebas de bootstrap estén implementadas hoy.

Alternativa: OTP/magic link al email antes de crear, sin contraseña pero con verificación previa y fricción; requiere definir envío/operación/cuentas. Un token capability propio requeriría nuevo contrato, hash/TTL/revocación/rotación/recuperación: no recomendar relajar seguridad con un UUID de pedido ni habilitar guest_capability sin implementación.

## Configuración de envíos preparada

[Plantilla pendiente](../config/checkout-shipping.pending.json): checkoutEnabled=false, shipping.enabled=false, transportista/tarifas null, cobertura vacía y revisión pendiente; **no se inserta en DB**. Reserva/política ya aprobadas 86400/manual_25_frozen. Ningún dato ficticio representa una tarifa o zona real.

El propietario debe suministrar costo/condiciones de retiro, transportista de los admitidos por constraint existente, tarifa (ARS, no negativa, máximo dos decimales) y allowedDestinations exactos provincia/ciudad/código postal, más revisión aprobada. Campos obligatorios de dirección del comprador permanecen validados. No se presume retiro gratis ni cobertura universal. Cada modalidad/carrier debe tener una única opción no ambigua. Varias tarifas por el mismo carrier/destino y cálculo dinámico requieren otro contrato; hoy tarifa es fija por opción configurada. Efectivo sigue siendo al retirar; envío por transferencia. No hay contratación API de transportistas.

Configuración incorrecta o destino fuera de cobertura falla antes de crear/reservar; las pruebas existentes incluyen ausencia/negatividad de fee, falta de carrier/cobertura y costo exclusivamente del servidor. Completar la plantilla no activa nada: preparar una fila concreta disabled tras definir datos, validarla en staging, y obtener aprobación separada para enabled.

## Evidencia ejecutada

- Nuevo test `tests/sec01-pay01-integration.test.mjs`: **7/7**, sin omisiones. DB PostgreSQL real, sin default grants amplios. PAY-01 antes de SEC-01 falla y revierte DDL; conjunto ordenado preserva filas legacy de pedidos MP, imágenes, precios/stock, clientes, operaciones/tasks y metadata sintética Storage. La columna result nace NULL; no se crea configuración ni se ejecuta worker. Se reproduce el grant faltante/rollback, se corrige y prueba crédito/replay/paid protegido; SQL read-only y plantilla sin activación verificados.
- Suite completa `node --test tests/*.test.mjs`: **728/728**, cero fallos/omisiones. Incluye 62 específicas PAY-01, permisos efectivos SEC-01, Storage y autorización, concurrencia/expiración/reintentos.
- `npm run lint`: **0 errores, 10 advertencias existentes**, sin cambios de reglas.
- `git diff --check` y snapshot de fuente: correctos.
- Build/TypeScript: se conserva el código de aplicación byte por byte respecto del candidato ya validado en el encargo anterior (build y tsc correctos). No se repitieron: este incremento cambia SQL, tests y documentación/configuración pendiente; no declara un nuevo build ejecutado.

Runtime: PostgreSQL 18.4 loopback efímero, Node 24.19, fixtures y Chromium local. `SFSTORE_TEST_PG_BIN=/tmp/sfstore-pg-runtime/node_modules/@embedded-postgres/linux-x64/native/bin`, `SFSTORE_TEST_PG_MODULE=/workspace/sfstore-integration-readiness/node_modules/pg/lib/index.js`, `SFSTORE_TEST_PLAYWRIGHT_MODULE=/tmp/sfstore-p1-playwright.cjs`. Evidencia temporal: `/tmp/sfstore-integration-readiness-specific.log`, `/tmp/sfstore-integration-readiness-full.log`, `/tmp/sfstore-integration-readiness-lint.log`. Ninguna API Storage/MP real ni credential productiva utilizada.

[SQL read-only de integración](sec01-pay01-integration-read-only.sql), probado en fixture: result nullable jsonb, tres tablas RLS, cero EXECUTE público en cinco RPC revisadas, funciones invoker/service-only, columnas UPDATE necesarias concedidas al servicio y cero configuraciones habilitadas incompatibles. Definiciones finales permiten comparar 25%/24h, sin fingir que un check de ACL prueba lógica. También revisar [inspección SEC-01 completa](sec01-permissions-read-only.sql) y [ACL PAY-01](pay01-manual-payments-read-only.sql). Un resultado de metadatos no valida todas las expresiones/objetos no versionados o APIs HTTP. El bucket público sigue permitiendo descargas por URL; SEC-01 restringe operaciones, no convierte imágenes públicas en privadas.

## Riesgos y acciones manuales antes de publicar

1. **Esquema efectivo desconocido:** ejecutar inspecciones read-only en entorno expresamente autorizado; comparar historia, checksums, owners, grants/columnas, policies, funciones, constraints, vistas/RPC ajenas, extensiones y bucket. Revisar existencia previa de result/tablas/functions; no reejecutar a ciegas. Resolver mapeo histórico `202609180002` sin alterar archivos ya aplicados.
2. **Interrupción del checkout antiguo:** SEC-01 deniega sus inserts anon. Definir ventana/mantenimiento o bloqueo explícito antes de esa migration; no aplicar SEC sola con la tienda vendiendo por el caller anterior. No revertir a permisos públicos como remedio.
3. **Locks y estado intermedio:** ensayar el orden completo en staging con esquema/grants comparables, timeouts y recuperación tras fallo parcial. No usar una reversión que borre recibos/reservas/libro; backups y plan de rollback/forward-fix revisados antes de aplicar. Migrations individuales no son un rollback global.
4. **Guest no implementado:** encargar/validar la propuesta antes de abrir al público; el candidato actual necesita sesión Auth ya existente. Una identidad UUID del cliente o guest_capability no resuelven esto.
5. **Entrega sin datos:** completar tarifas/condiciones/cobertura/carrier y revisión. Configurar disabled, validar y habilitar solo tras aprobación. No aceptar cero/null por defecto para reemplazar una decisión pendiente.
6. **Pagos/operación manual:** definir referencias bancarias únicas, responsables de verificación, frecuencia de liberar vencimientos y tratamiento de transferencias tardías. confirmed sin paid sigue pendiente; no acredita por comprobante del comprador. MP histórico puede necesitar tratamiento manual, no reactivar conciliación sin autorización.
7. **Publicación y triggers:** revisar vínculo rama/Vercel y autodeploy antes de push/merge futuros; preparar commits/PR de este diff completo bajo revisión humana. No duplicar PR Storage y baseline integrado como caminos independientes de integración.

## Secuencia recomendada de publicación (no ejecutada)

1. Revisar diff/snapshot y grant 005, resolver esquema/historial, implementar guest si se aprueba y completar entrega. Preparar commits/PR y staging con autorizaciones correspondientes.
2. Ensayar migrations **1–7** y código conjunto en staging, configuración disabled, fixtures, acciones admin/guest y recibos. MP/Storage apply/desatendidos siguen bloqueados.
3. Obtener autorización específica de publicación y de cada efecto productivo; controlar autodeploy, asegurar respaldo y cerrar checkout viejo durante la ventana.
4. Aplicar únicamente migrations faltantes/verificadas en el orden indicado. Verificar metadatos/grants/definiciones. Publicar código compatible como conjunto, checkout todavía deshabilitado.
5. Validar flujos en staging y preparación operativa sin crear órdenes/pagos de prueba reales en Production. Cargar configuración real disabled solo con aprobación de escritura; verificar y obtener aprobación separada de activación. Habilitar cuando guest/entrega/pagos estén revisados; no activar cron ni limpieza Storage.

No se ofrece una fecha de salida ni una certificación productiva. La propuesta reduce la decisión técnica a revisión de este conjunto; los datos comerciales de entrega y la autorización de acceso/publicación siguen siendo del propietario.

## Archivos de este incremento

Nueva migration 005, `tests/sec01-pay01-integration.test.mjs`, `config/checkout-shipping.pending.json`, este informe, `reports/sec01-pay01-integration-read-only.sql`, `reports/sec01-pay01-integration-migration-manifest.json`; referencias actualizadas en `docs/CHECKOUT_PAY01.md`, `docs/SUPABASE_PERMISSIONS_SEC01.md`, `docs/DEVELOPMENT_BACKLOG.md`. Migrations anteriores y código de aplicación permanecen intactos. No se inició otro objetivo.
