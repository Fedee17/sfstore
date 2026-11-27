# Mercado Pago — preparación y activación

Rama `codex/mercadopago-20261126`. Este documento no autoriza push, merge, despliegues, migraciones productivas ni cobros: cada paso requiere la aprobación del propietario.

## Qué hace la integración

| Modalidad | Producto de Mercado Pago | Precio cobrado | Identificador guardado |
| --- | --- | --- | --- |
| 1 pago (dinero en cuenta, débito o crédito) | Checkout Pro (`/checkout/preferences`) | Contado | Pago numérico |
| Crédito en 2 o 3 cuotas | Checkout API con Card Payment Brick (creación manual y procesamiento de una sola orden) | Lista | Orden `ORD…` |

- Importes, cuotas y referencia salen siempre del pedido guardado, nunca del navegador.
- La confirmación la decide la base (`confirm_checkout_mercadopago_payment`): un solo pago aprobado por pedido. No descuenta stock dos veces.
- Para cuotas, PostgreSQL concede un intento de 90 segundos antes de crear la orden en modo manual. Solo la orden vinculada al intento puede procesarse. Si se pierde la respuesta, el reintento consulta esa misma orden y conserva la clave de procesamiento. Solo un resultado terminal sin cobro habilita otra tarjeta en el mismo pedido.
- El importe esperado debe coincidir con el importe informado como efectivamente pagado. Un recargo, un faltante o un importe pagado ausente dejan el pedido en revisión.
- Pedido pagado: SFSTORE rechaza nuevos intentos (409 `CHECKOUT_ALREADY_PAID`) y vence en Mercado Pago los links de Checkout Pro abiertos.
- Pagos cobrados que no confirman el pedido van a **Administrador → Pedidos web → Mercado Pago**:
  - **Requiere devolución:** duplicado, reserva vencida o sin pedido.
  - **Requiere revisión:** importe, moneda, medio o cuotas distintos.
- SFSTORE nunca devuelve dinero: la devolución se hace en Mercado Pago y luego se registra en el panel, que la audita.

## Interruptores (todos apagados por defecto)

1. **Servidor:** `MERCADOPAGO_PAYMENTS_ENABLED=1`, con `MERCADO_PAGO_ACCESS_TOKEN` y `MERCADO_PAGO_WEBHOOK_SECRET` cargados. Si falta alguno, las rutas de pago responden 410. El webhook, con el secreto cargado, verifica igual la firma (401 si es falsa) y responde 503 sin leer ni confirmar nada.
2. **Base:** `checkout_payment_settings.mercadopago_enabled`. Habilita Mercado Pago en un pago.
3. **Base:** `checkout_payment_settings.mercadopago_installments_enabled`. Habilita las cuotas y requiere también el interruptor 2. Activarlo solo cuando la cuenta financie 2 y 3 cuotas sin interés para el comprador.

Para detener nuevas operaciones, poner el interruptor 2 en `false`, sin desplegar nada. Los pedidos ya creados conservan su modalidad. El interruptor también corta la confirmación automática en la base, pero no vence por sí solo los links ya emitidos en Mercado Pago. Si hay preferencias abiertas o pagos en tránsito, identificar esos pedidos, gestionar el vencimiento de los links y conciliar el estado directamente con el proveedor antes de cerrar la reversión. No reactivar el interruptor como sustituto de esa conciliación.

## Variables de entorno (Vercel, Production)

| Variable | Pública | Valor | Uso |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` | Sí | Public key productiva (`APP_USR-…`) | Card Payment Brick |
| `MERCADO_PAGO_ACCESS_TOKEN` | No, solo servidor | Access token productivo | Preferencias, órdenes y consultas |
| `MERCADO_PAGO_WEBHOOK_SECRET` | No, solo servidor | Clave secreta de Webhooks de la aplicación | Firma `x-signature` |
| `MERCADOPAGO_PAYMENTS_ENABLED` | No | Sin cargar hasta activar; luego `1` | Interruptor del servidor |
| `NEXT_PUBLIC_SITE_URL` | Sí | Dominio final con `https`, sin barra final | `back_urls` y `notification_url` |

- No cargar credenciales de prueba en Production.
- No cargar las productivas en Preview ni en local.

## Webhooks (Tus integraciones → aplicación → Webhooks → Modo productivo)

- **URL:** `https://<dominio final>/api/mercadopago/webhook`
- **Eventos:**
  - **Pagos (`payment`):** pagos de Checkout Pro.
  - **Order (Mercado Pago) (`order`):** cuotas por `/v1/orders`.
- **Clave secreta:** copiarla a `MERCADO_PAGO_WEBHOOK_SECRET`.

Respuestas:

| Código | Significado |
| --- | --- |
| 401 | Firma inválida |
| 200 | Procesado |
| 204 | Tópico ignorado |
| 503 | Error temporal; Mercado Pago reintenta y el procesamiento es idempotente |

Con los cobros deshabilitados, las simulaciones oficiales ya validadas responden 503 ante firmas válidas y 401 ante firmas inválidas. El manifiesto conserva la capitalización del ID que envió Mercado Pago. La recepción de la notificación de una compra de prueba sigue pendiente y se verifica en un entorno aislado.

## Migración

`supabase/migrations/202611270002_mercadopago_card_attempts.sql` agrega el registro de intentos para cuotas y sus RPC de uso exclusivo del servidor. Debe estar aplicada antes de habilitar cuotas con esta versión. Antes de activar, validar el flujo manual completo y la oferta sin interés en el entorno de prueba de Mercado Pago.

`supabase/migrations/202611270001_mercadopago_checkout.sql`:

- Crea las tablas `checkout_payment_settings`, `checkout_mercadopago_payments` y `checkout_mercadopago_preferences`.
- Crea las funciones de confirmación, revisión y resolución, y los permisos de `service_role`.
- Permite el medio `mercadopago` con modalidad contado o financiado en el checkout web y crea los interruptores apagados.
- Se aplicó completa sobre bases locales aisladas, igual que su copia en `staging/`.
- En producción se aplica solo dentro del corte autorizado (ver [production-checklist](production-checklist.md)), con respaldo previo y antes del despliegue del código.
- No modifica precios, stock ni pedidos existentes.

## Activación por etapas

### Etapa A · Checkout Pro en un pago

1. Validar primero en un entorno aislado con la Public Key y el Access Token de **Prueba** de «Sf Store», un comprador de prueba si lo requiere la modalidad del panel y tarjetas de prueba. Usar datos sintéticos, un secreto de webhook independiente y Supabase aislado. La versión de este PR bloquea cobros en Vercel Preview.
2. Comprobar que la preferencia admite un único pago y cobra exactamente el total de contado. Verificar una aprobación, un pago pendiente y un rechazo, incluida la consulta del estado al proveedor y la confirmación del pedido sólo al aprobarse. [Pruebas oficiales para Checkout Pro con preferencias](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases).
3. Con autorización productiva, confirmar que esté aplicada `202611270001` y que los tres interruptores estén apagados antes del corte. Activar los interruptores 1 y 2 únicamente; dejar el 3 apagado. Checkout Pro no invoca los RPC de `202611270002`.
4. Confirmar que el estado ofrezca contado y que la API siga denegando las cuotas. Si hay inconvenientes, desactivar el interruptor 2 y gestionar las preferencias y pagos pendientes según la reversión indicada arriba. Cada prueba con dinero real requiere autorización específica.

### Etapa B · Checkout API en cuotas

1. Validar Card Payment Brick y Orders en modo manual con credenciales de prueba, incluyendo la recuperación de una respuesta incierta y la conciliación del importe efectivamente pagado. [Modelo de integración de Orders](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-orders/integration-model).
2. Antes de procesar una orden, acreditar del lado servidor que la oferta corresponde a la tarjeta tokenizada y que la cantidad de cuotas, el interés cero y el total coinciden con el pedido. Las consultas de BIN sólo prueban la oferta para los BIN consultados. La verificación previa vinculada al token sigue pendiente.
3. Aplicar `202611270002` y habilitar el interruptor 3 únicamente después de esas pruebas y con autorización productiva. Si hay un inconveniente, apagar el interruptor 3 y conciliar los intentos en curso; la etapa A conserva su propio interruptor.

## Costos y calculadora

En `lib/products/commercial-pricing.ts`:

- **`SFSTORE_PAYMENT_COSTS.financedBudgetPpm`:** presupuesta 15% (IVA incluido) para fijar el precio de lista en cuotas.
- **Filas `financed`:** guardan el costo real de Mercado Pago (2 cuotas 11,31%, 3 cuotas 14,58%) para los registros y las verificaciones. Si el costo real superara el presupuesto, prevalece el real.
- La calculadora solo sugiere: los precios publicados cambian únicamente al aplicarlos desde el administrador.
