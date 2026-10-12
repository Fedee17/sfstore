# Configuración comercial aprobada — validación local 2026-10-12

Estado: cambios revisados para publicación autorizada en PR #2, exclusivamente en la rama de integración y Supabase sintético local. No se modificó Production/main ni el proyecto original; sin SQL remoto, deploy, merge, scheduler, reset o eliminación de datos. Commit y push normal autorizados por el encargo de revisión/publicación.

## Resultado y archivos

- lib/payment.ts y components/transfer-alias.tsx: destino público aprobado Naranja X / fedearmando.21, botón de copia y alternativa manual cuando el navegador la deniega. No hay credenciales bancarias ni defaults de titular/CUIT o sustitución por variables sintéticas del entorno.
- app/checkout/page.tsx y app/checkout/exito/page.tsx: transferencia única, 25% en productos, total autoritativo del pedido y pago completo con comprobante online/verificación administrativa. Retiro sin costo, espera de confirmación y sin dirección/horarios inventados. El carrito muestra una referencia; nunca autoriza cobrar basándose en precio del navegador.
- app/admin/checkout/actions.ts, app/admin/checkout/page.tsx, components/admin/checkout-manual-forms.tsx y services/checkout-manual-admin.ts: administrador autenticado/allowlisted registra costo verificado y consulta cotizaciones comunicadas. Publicación del costo dentro de la sesión del comprador; el contacto externo es manual, sin mensajes automáticos.
- services/checkout-shipping.ts: lectura del costo/total/transporte/vigencia sólo por la sesión propietaria. No devuelve datos de contacto ni identidad del administrador.
- supabase/migrations/202610120005_checkout_approved_shipping_quotes.sql y staging/migration-manifest.json: migración nueva, aplicada sólo localmente; historial local 29 entradas. Los 27 archivos SQL históricos y las 28 entradas anteriores del manifiesto permanecen intactos.
- Pruebas nuevas pay01-real-local-approved-commercial y pay01-shipping-approval-boundary; regresiones existentes adaptadas al componente, transporte y nuevo ledger.

## Cotizaciones e inventario

Transporte preferido entre las opciones existentes Correo Argentino, Andreani y Via Cargo. Se solicitan provincia, localidad, dirección y código postal. Sin tarifa aprobada para destino/transporte, sólo se registra una solicitud idempotente: sin pedido, reserva o transferencia.

El administrador registra el costo de envío verificado. PostgreSQL calcula los productos desde su precio de lista, redondea el 25% por unidad y publica total más envío; cotización válida por 24 horas desde su aprobación. Este plazo no reserva stock. El comprador consulta el total y pulsa aceptar. Se valida sesión propietaria, request/carrito exactos, clave, vigencia, precios y disponibilidad; una cotización sólo crea un pedido. Cambio de precio, destino/carrito, vencimiento o cotización ya usada se rechazan sin stock parcial. Una cotización vencida permite solicitar otra desde el checkout.

Se elimina el fallback a tarifas planas de envío no verificadas por el RPC de tarifas: el pedido requiere tarifa válida de configuración privada o cotización individual aprobada. Retiro con costo distinto de cero falla cerrado. La migración no configura tarifas ni datos bancarios.

El RPC de aprobación es SECURITY INVOKER y EXECUTE exclusivo de service_role; el servidor verifica getUser y allowlist antes de crear el cliente privilegiado. Mantiene la frontera de confianza existente de las RPC administrativas: no agrega una segunda allowlist SQL ni concede SELECT sobre auth.users. Cotizaciones y auditoría con RLS y sin permisos para anon/authenticated/ejecutor de vencimientos. Auditoría de aprobación y aceptación transaccional.

Las reservas de pedidos aceptados siguen durando 24 horas. Avisos oportunos con comprobantes privados se protegen hasta revisión; sólo la acreditación completa confirma pago. Se conservan cuotas por comprador, frecuencia, idempotencia, locks y liberación exactamente una vez. Mercado Pago permanece deshabilitado.

## Validación final

| Prueba | Resultado |
| --- | --- |
| Configuración aprobada con Supabase real y Edge | 11 aprobadas, 0 fallidas |
| Checkout invitado real | 9 aprobadas, 0 fallidas |
| Pagos, comprobantes y controles comerciales reales | 16 aprobadas, 0 fallidas |
| Ejecutor de reservas real | 17 aprobadas, 0 fallidas |
| Liberador manual y panel reales | 10 aprobadas, 0 fallidas |
| Suite general | 653 aprobadas, 0 fallidas; 7 pruebas y 6 suites optativas omitidas |
| Build y TypeScript --noEmit | Aprobados |
| Lint global | 0 errores, 10 advertencias preexistentes |
| Lint focal | Aprobado sin advertencias |
| Gitleaks | Sin hallazgos sobre los 23 archivos completos, índice e historial de la PR |
| Credenciales locales / whitespace | 0 coincidencias; git diff --check aprobado |

Las cinco suites reales se ejecutaron expresamente por separado. Regresión de navegador con HTTP controlado: 1/1 aprobada; se corrigió una expectativa de texto anterior y se permite seleccionar el navegador instalado mediante variable de prueba. La suite general conserva sus skips optativos, diferenciados de las cinco suites reales ejecutadas expresamente.

Los escenarios nuevos verifican copia efectiva del alias, retiro gratuito, transporte elegido, ausencia de pedido con costo desconocido, aprobación administrativa/reintento, consulta privada, cambios de carrito/precio, rechazo de importes/fees inyectados, pagos parciales y métodos no habilitados; UPDATE SQL denegado al rol authenticated; aceptación/reintentos, vencimiento/renovación y carrera con dos claves distintas: una aceptación exitosa y otra rechazada, una reserva.

Invariantes locales finales: cero restituciones duplicadas, cero devoluciones de stock para pedidos pagados y cero stock negativo. Permisos efectivos de aprobación y acceso a cotizaciones/auditoría denegados a anon, authenticated y sfstore_reservation_executor. CAPTCHA se probó con las credenciales oficiales de prueba del entorno local.

Durante la preparación hubo dos fallos de delimitador al generar SQL, completamente revertidos antes de aplicarlo. La primera ejecución real de la suite nueva tuvo 3 pases y 5 fallos derivados de un chequeo duplicado de auth.users no permitido a service_role. Se corrigió la migración nueva de esta tarea para usar la frontera administrativa existente, sin ampliar permisos de Auth. La ejecución final de publicación ampliada pasa 11/11. No son pendientes del checkout.

## Riesgos y pendientes

- No se transfirió dinero ni se verificó externamente titularidad de la billetera: el destino público es el proporcionado y aprobado por el propietario.
- No hay tarifas de Production aprobadas por esta tarea. El administrador debe verificar costos con el transporte; no se contrata el envío ni se integra una API logística.
- El comprador conserva su sesión y consulta la cotización; la notificación externa y coordinación del retiro/despacho son manuales.
- Rectificar una cotización aprobada, otros transportes, paginación más allá del listado administrativo y retención de solicitudes/auditoría requieren desarrollo adicional. Reaprobar con un importe diferente falla cerrado; no se sobrescribe un total ya comunicado.
- Persisten riesgos previamente documentados de múltiples identidades anónimas, revisión de pagos atrasados y capacidad sostenida. Cron no se activa; monitor continúa desarmado.
- Revisión humana y rollout autorizado de la migración nueva pendientes. La validación local no certifica Production.

Este informe contiene resultados agregados, sin identificadores generados, cookies, tokens, filas, comprobantes ni logs privados.

## Inventario completo de archivos modificados/nuevos

- app/admin/checkout/actions.ts
- app/admin/checkout/page.tsx
- app/checkout/exito/page.tsx
- app/checkout/page.tsx
- components/admin/checkout-manual-forms.tsx
- docs/DEVELOPMENT_BACKLOG.md
- lib/payment.ts
- services/checkout-manual-admin.ts
- services/checkout-shipping.ts
- staging/migration-manifest.json
- tests/pay01-checkout-boundary.test.mjs
- tests/pay01-guest-shipping-boundary.test.mjs
- tests/pay01-guest-shipping-browser.test.mjs
- tests/pay01-real-local-checkout.test.mjs
- tests/pay01-real-local-expiration-executor.test.mjs
- tests/pay01-real-local-reservation-expiry.test.mjs
- tests/pay01-real-local-transfer-rules.test.mjs
- tests/pay01-staging-functional.test.mjs
- components/transfer-alias.tsx
- reports/checkout-approved-commercial-local-20261012.md
- supabase/migrations/202610120005_checkout_approved_shipping_quotes.sql
- tests/pay01-real-local-approved-commercial.test.mjs
- tests/pay01-shipping-approval-boundary.test.mjs
