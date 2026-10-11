# PAY-01 — Contrato local de checkout

Candidato de compra invitada y envíos nacionales en `codex/pay01-guest-national-shipping`, preservando `codex/pay-01-atomic-checkout`, base integrada `69049e2` más snapshot local de SEC-01. No publicado ni habilitado; Production no fue consultada. Clasificación RESTRINGIDA conservada. La implementación técnica es revisable; las decisiones comerciales pendientes impiden habilitarla.

## Frontera y transacción

El navegador envía exclusivamente clave de operación, datos del comprador, entrega, método y pares producto/cantidad a `POST /api/checkout`. La interfaz muestra precios de lista de referencia; descuento y total final se calculan exclusivamente en servidor al crear el pedido. El handler exige Origin del mismo sitio, JSON, cuerpo máximo de 32 KiB, campos permitidos y cantidades enteras positivas. Verifica la sesión mediante Supabase `auth.getUser()`; nunca acepta identidad del comprador en el body. No crea un cliente privilegiado si falla la autorización.

`services/checkout-server.ts` invoca `create_checkout_atomic` con identidad verificada, clave UUID y solicitud. La RPC service-only consulta configuración aprobada explícita; no recibe configuración, precios, gastos ni totales del cliente. Bloquea productos ordenados por UUID y categorías, valida la visibilidad de SEC-01, stock y cantidades, calcula importes con `numeric(12,2)` y crea cliente, pedido web, ítems con FK real, movimientos de reserva y resultado idempotente dentro de una única transacción. Cualquier error revierte todo.

La política aprobada `manual_25_frozen` calcula **25%** para transferencia y efectivo en todos los productos válidos: precio unitario = `round(products.price * 0.75, 2)`, subtotal lista = suma de `price * quantity`, descuento = diferencia con suma de unidades finales, total = unidades finales + tarifa configurada. El redondeo es por unidad a centavos antes de multiplicar; productos con valores muy pequeños pueden no mostrar un porcentaje exacto por redondeo monetario. No se descuenta el envío. `transfer_price` queda fuera de este cálculo para evitar doble descuento: lista 100 y diferenciado 75 generan 75, no 56.25; si el diferenciado era 80, 50 o 120, la regla aprobada sigue generando 75.

Los ítems, importes del pedido y resultado se congelan al crear. Reintentos o acreditación posterior no leen nuevos precios del catálogo. Los guards existentes impiden alterarlos; no hay repricing de históricos ni cambios sobre el catálogo. Una configuración antigua `current_catalog`, o duración distinta de 86400, se rechaza para pedidos nuevos con `CHECKOUT_POLICY_NOT_CONFIGURED`; un reintento válido de un pedido existente conserva su resultado original antes de evaluar configuración nueva.

El lock transaccional por comprador/clave evita doble ejecución. Solicitudes equivalentes con distinto orden de ítems se normalizan; reutilizar la clave con otra solicitud devuelve conflicto. La identidad del comprador define el namespace: otro comprador no puede recuperar un pedido ajeno. El navegador persiste la clave en sessionStorage antes del envío; perder la respuesta o recargar reutiliza la operación sin duplicar stock/clientes/pedidos. La UI también tiene un bloqueo síncrono para doble envío. Cambiar la solicitud crea otra operación; no hay retry automático con una clave nueva tras un resultado incierto.

## Reserva y estados

La implementación disponible reserva descontando unidades del contador vigente `products.stock` y registra `reservation`; así las ventas administrativas existentes ven disponibilidad reducida y utilizan los mismos locks. La duración aprobada es 24 horas (86400 segundos) para ambos métodos, calculada con reloj DB; la estrategia se conserva y el checkout sigue sin habilitarse.

| Estado checkout | Pedido existente | Inventario |
| --- | --- | --- |
| pending | pending, pago pendiente | Unidades reservadas; movimiento reservation |
| confirmed | confirmed; sin declarar pago aprobado | Convierte evidencia reservation a sale, sin volver a descontar |
| cancelled | cancelled | Restituye una sola vez y registra release |
| expired | cancelled; expiry explícito en checkout_operations | Restituye una sola vez y registra release |

`transition_checkout_atomic` es una primitiva exclusiva de servicio. No existe endpoint público de confirmación/cancelación ni job programado. Repetir una transición terminal idéntica es idempotente; cambiar de terminal se deniega. Expirar antes de tiempo y confirmar después del vencimiento se deniegan. La confirmación comprueba nuevamente el reloj de DB después de esperar locks. Expirar/cancelar y liberar inventario es atómico. Los lectores nunca ejecutan estas mutaciones. Bajo lock, una transición a expired/cancelled también verifica ausencia de pago/evidencia manual; un pedido pagado nunca libera stock por vencimiento.

**Vencer el plazo no ejecuta automáticamente la liberación.** Está preparado `expire_checkout_reservations(p_limit)`, invocado manualmente por un administrador autorizado. Selecciona candidatos pending/vencidos sin payment_status paid, pagos aprobados ni recibo manual, bloquea pedidos con SKIP LOCKED y utiliza el lifecycle existente; confirma estado/plazo otra vez, devuelve cantidad liberada y fallos sin diagnósticos/PII. Fallar una liberación revierte ese pedido y permite reintento; otras liberaciones pueden completarse. Dos ejecuciones concurrentes no restituyen unidades dos veces. No se añadió cron ni caller desatendido. El botón limita cada operación a 100 por recursos; no es un plazo ni política comercial.

Los triggers impiden modificar importes, pagos o ítems de estos pedidos por los antiguos servicios y bloquean movimientos de venta para reservas no confirmadas. `apply_sale_inventory` existente reconoce la evidencia de venta de una reserva confirmada y no descuenta otra vez. Esos guards solo afectan nuevos pedidos registrados en checkout_operations; no convierten históricos ni los canales store/order.

Confirmar una reserva **no es verificar un pago**. La adaptación manual añade `confirm_checkout_manual_payment`: el servicio exige `requireAdminActionSession` (getUser + allowlist), obtiene admin_id de la sesión y requiere reconocimiento expreso de haber recibido el dinero. La RPC verifica importe completo positivo exacto, método elegido, referencia bancaria para transferencia, estado/vencimiento y ausencia de cobro previo; registra un recibo auditado, confirma la reserva y llama al libro existente `record_order_payment` en una única transacción. Solo entonces `payment_status` pasa a `paid`. Fallar al insertar el pago revierte recibo, estado y conversión de inventario. Repetir la misma clave/admin/importe/referencia retorna el resultado; otro cobro sobre el pedido o misma referencia bancaria en otro pedido se rechaza.

`/admin/checkout` permite acreditar pagos manuales y ejecutar explícitamente la liberación de vencimientos. Página, lecturas y mutaciones tienen autorización propia. Roles anon/authenticated no ejecutan estas RPC ni leen/escriben recibos. El libro de los nuevos pedidos rechaza inserts sin recibo manual y ediciones posteriores; los otros canales conservan su workflow. La cuenta bancaria se verifica humanamente, no por una pasarela. Cobros parciales, total cero y reembolsos requieren otro contrato aprobado; esta operación solo acredita el importe completo.

El recibo propio consulta el estado de pago del servidor después de comprobar ownership: muestra acreditación manual únicamente con payment_status paid. Una reserva confirmed con pago pendiente sigue diciendo pendiente; parámetros de URL no acreditan nada.

## Configuración obligatoria y límites

La migration crea checkout_configuration vacía; no hace inserts ni habilita nada. Una configuración revisada debe especificar UUID, enabled, segundos de reserva positivos, price_policy, buyer_authorization, delivery_options y approved_revision. Solo puede haber una habilitada.

- Duración: aprobada en 24 horas para ambos métodos; la configuración debe declarar reservation_seconds=86400. El servidor no acepta otro plazo para pedidos nuevos. No se reescriben plazos existentes ni se instala cron.
- Precios: price_policy=manual_25_frozen, 25% una sola vez sobre lista vigente y precio final congelado al crear. cash_price_policy legacy se conserva para compatibilidad histórica, pero ya no selecciona el precio del nuevo checkout.
- Comprador: sesión anónima Supabase Auth verificada por getUser, sin registro/contraseña. El rol SQL de esa sesión es authenticated; guest_capability sigue rechazado. Activación de Auth/CAPTCHA y flag invitado siguen pendientes.
- Entrega: retiro y cobertura nacional Argentina. destinationRates configura tarifas explícitas por provincia, opcionalmente localidad/código postal, sin importar costos ni transportistas. No hay tarifa por defecto. Sin tarifa válida se puede solicitar cotización privada, sin pedido ni stock reservado. Opciones antiguas allowedDestinations siguen compatibles para destinos argentinos válidos.
- Protección frente a abuso: límites técnicos de tamaño/ítems están implementados; reglas de cantidad de reservas por comprador y antifraude no se inventaron y requieren revisión previa a habilitar público; el acceso invitado aprobado está implementado pero no activado.

Solo transferencia y efectivo al retirar pueden crear pedidos. Para efectivo se aplica el mismo 25% y shipping sigue rechazado por la condición de efectivo al retirar; cash_price_policy no requiere selección. La configuración permanece vacía.

Mercado Pago fue retirado de carrito, checkout, recibo y ficha pública. Sus endpoints GET/POST devuelven 410 incondicionalmente, para pedidos nuevos y anteriores, sin leer cuerpo, credenciales, DB ni importar/invocar SDK. Las páginas legacy de retorno redirigen al carrito. El código previo queda archivado en lib/payments/legacy-mercadopago, server-only y sin imports desde rutas activas; no hay bandera/env que lo reactive. Se conservan métodos del libro histórico/admin sin exponer cobros automáticos. PAY-02 queda diferida hasta autorización comercial expresa; no hubo llamadas ni sandbox/cobros.

## Recibos y permisos SEC-01

El recibo consulta checkout_operations exclusivamente tras getUser y filtra por order_id **y** buyer_id. No expone PII. El servidor usa el resultado persistido, comprueba estado/vencimiento/pago y no muestra instrucciones de transferencia de una reserva cancelada/vencida, de efectivo ni ya acreditada. Se conserva el lector administrativo allowlisted para pedidos anteriores. Importes/números enviados por URL dejan de usarse como recibo.

| Actor | Catálogo público | Tablas privadas/base de pedidos | Configuración/operaciones checkout | RPC nuevas | HTTP checkout/recibo |
| --- | --- | --- | --- | --- | --- |
| anon | Columnas/filas SEC-01 | Sin lecturas ni escrituras | Sin acceso | EXECUTE denegado | Sin sesión: denegado |
| authenticated directo | Columnas/filas SEC-01 | Sin lecturas ni escrituras | Sin acceso | EXECUTE denegado | Sesión verificada + configuración aprobada; recibo propio |
| admin allowlisted | Igual permiso SQL del rol | Servicio tras guard existente | Sin acceso directo público | Sin acceso directo público | Recibos anteriores mediante guard admin; acreditación y liberación manual tras guard de acción |
| service_role | Frontera servidor confiable | Grants SEC-01 conservados | SELECT/INSERT/UPDATE, RLS | EXECUTE explícito | Nunca expuesto al navegador; callers autorizan |

## Migration e integración

Pendientes `202610110002_pay01_atomic_checkout.sql`, `202610110003_pay01_manual_payments.sql` y `202610110004_pay01_approved_commercial_rules.sql`, después de `202610110001_sec01_effective_permissions.sql` y sus prerequisites del baseline (incluidas las dos migrations Storage pendientes). La candidata falla si falta la política privada SEC-01. No actualiza datos históricos, activa checkout, llama Storage, instala cron o cambia credenciales/roles. En conjunto agregan tres tablas, índices, ocho funciones y cuatro triggers, además de admitir cash en la constraint del método de pedido sin eliminar valores históricos; validar esquema efectivo y grants antes de cualquier aplicación autorizada.

[Verificación read-only](../reports/pay01-permissions-read-only.sql): tablas con RLS, cero permisos públicos/EXECUTE indebidos, cinco funciones service-only, tres triggers habilitados y ninguna configuración/operación sembrada. Está probada en DB efímera, no ejecutada en Production.

Integrar SQL y caller como un conjunto revisado; aplicar SEC-01 aisladamente al checkout anterior lo bloquea. Aprobar primero reglas comerciales y estrategia operativa de expiración/autorización; revisar técnicamente la acreditación manual. Mercado Pago no es una dependencia de este checkout. La rama no demuestra que Production tenga ese esquema ni que esté lista para vender.

## Operación y configuración pendientes

Duración y precio ya aprobados: **24 horas**, **25%**, precio final congelado. No requieren nueva decisión. Una configuración futura revisada debe declarar `reservation_seconds=86400`, `price_policy='manual_25_frozen'`, `buyer_authorization='authenticated'` para el adaptador disponible, una revisión aprobada y delivery_options válidas. No se creó ni activó ninguna configuración. No se propone SQL con tarifas o cobertura ficticias para ejecutarlo en Production.

- Retiro: definir costo/condiciones explícitos, sin asumir gratuidad.
- Envío: configurar carrier real admitido y destinationRates con costos válidos para la cobertura nacional aprobada. La UI ofrece únicamente tarifas retornadas por servidor; sin costo válido permite cotización sin pedido/reserva. No se contrata transporte por APIs.
- Comprador: configurar Anonymous Sign-ins y CAPTCHA en un entorno aislado, validar cookies/recuperación y revisar antes de habilitar; guest_capability sigue rechazado.
- Reservas: definir frecuencia operativa manual, prórrogas si se necesitan y tratamiento de pagos tardíos. No hay proceso recurrente autorizado.
- Cobros parciales, total cero, reembolsos y referencia bancaria compartida entre pedidos requieren contrato adicional; no se inventaron conductas.

Un pago recibido después de vencer/cancelar no revive automáticamente el pedido ni consume stock liberado. No se presume aceptación, devolución ni nueva reserva. Los pedidos acreditados manualmente permanecen protegidos aunque su plazo original ya haya transcurrido.

[SQL read-only](../reports/pay01-manual-payments-read-only.sql): tres tablas RLS, cero ACL/EXECUTE públicos indebidos, ocho funciones invoker/service-only, cero configuración/operaciones/recibos sembrados. [Adaptación manual anterior](../reports/pay01-manual-payments-20261011.md) y [reglas aprobadas](../reports/pay01-approved-rules-20261011.md).

## Preparación de integración SEC-01/PAY-01

La revisión en `codex/sec01-pay01-integration-readiness` conserva el candidato anterior y añade `202610110005_pay01_inventory_transition_permissions.sql`: UPDATE **solo de movement_type y reason** para service_role permite convertir evidencia de reserva a venta sin depender de grants heredados amplios. No modifica filas ni concede acceso público. Debe aplicarse después de `202610110004` y antes de habilitar acciones de pago. La prueba aislada sin default grants demuestra fallo/rollback antes y acreditación idempotente después.

[Informe de integración](../reports/sec01-pay01-integration-readiness-20261011.md), [orden/checksums](../reports/sec01-pay01-integration-migration-manifest.json), [verificación read-only](../reports/sec01-pay01-integration-read-only.sql) y [configuración de entrega pendiente](../config/checkout-shipping.pending.json). La plantilla contiene nulls y no es una fila para insertar en DB.

Compra sin registro implementada localmente mediante sesión anónima Supabase Auth verificada. No se habilitó Anonymous Sign-ins en Production. Ver contrato vigente y evidencia en [informe invitado/envíos](../reports/pay01-guest-national-shipping-20261011.md).

## Compra invitada y envíos nacionales — contrato vigente

POST /api/checkout/session crea o reutiliza identidad verificada con cookies HttpOnly/Secure/SameSite, sin exponer tokens. Web Locks serializa el bootstrap entre pestañas; navegadores sin soporte fallan con mensaje. proxy.ts renueva cookies antes de recibos. Una cookie inválida o una operación pendiente sin sesión no generan otra identidad silenciosamente. La sesión compartida existente sigue compatible. Nombre y teléfono son obligatorios; email opcional. Perder la sesión no permite recuperar el pedido con UUID/email; hace falta asistencia administrativa.

POST /api/checkout/shipping consulta tarifas y POST /api/checkout/quotation registra una solicitud idempotente privada. GET de cotización y recibos filtran por identidad verificada. Solicitudes administrativas muestran contacto, destino y productos; no hay conversión automática ni contratación de transporte. El navegador conserva solo hash SHA-256 y UUID de operación, sin datos personales en ese registro.

Migration 202610110006 aplica después de 005; agrega tabla privada checkout_shipping_quote_requests, get_checkout_shipping_quote y request_checkout_shipping_quote (service-only), y adapta create_checkout_atomic. No habilita Auth, checkout, cron ni APIs de cobro. Las ocho migraciones requieren revisión y validación del esquema antes de aplicación autorizada.

Formato de opción de envío: method=shipping, country=AR, enabled=true, carrier real aprobado, destinationRates=[{province: provincia oficial, city?: localidad, postalCode?: código, fee: importe aprobado, enabled:true, validUntil?: fecha válida}]. No se proveen valores comerciales. Una fila sin city/postalCode representa una tarifa explícita provincial. Todas las coincidencias se ofrecen para selección; no hay precedencia inventada. quoteKey identifica revisión y tarifa: cambios rechazan pedidos nuevos con clave antigua; pedidos ya creados conservan total. No se descuenta el envío. Efectivo continúa exclusivamente para retiro.

Habilitación pendiente: Supabase Anonymous Sign-ins, CAPTCHA Turnstile efectivamente habilitado en Supabase (el servidor exige token en Production, pero su validación depende del proveedor), dominio/site key público NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY y flag CHECKOUT_GUEST_ENABLED=true. Sin flag no se crean invitados nuevos. Verificar en staging primero; no se modificaron credenciales ni configuración remota. Tarifa, transportista, retiro y revisión aprobada siguen sin configurar; checkout permanece cerrado.

## Preparación de staging aislado

[Procedimiento](../staging/README.md) y [manifest local](../staging/migration-manifest.json): historial único de 23 pasos exclusivamente para Supabase local nuevo, Auth invitado/CAPTCHA configurados y seed comercial sintético protegido. Las dos migrations originales 202609180002 permanecen intactas; suppliers_admin usa alias 202609180003 solo en las copias de staging. No repara historia de una base existente. Aplicar el paquete únicamente local y desde vacío; no usar Production ni backup real. Prueba del stack real Auth/PostgREST/Turnstile pendiente de CLI operativo y claves de staging. [Informe](../reports/sec01-pay01-staging-preparation-20261011.md).
