# Mercado Pago — preparación y activación

Rama `codex/mercadopago-20261126`. Este documento no autoriza push, merge, despliegues, migraciones productivas ni cobros: cada paso requiere la aprobación del propietario.

## Qué hace la integración

| Modalidad | Producto de Mercado Pago | Precio cobrado | Identificador guardado |
| --- | --- | --- | --- |
| 1 pago (dinero en cuenta, débito o crédito) | Checkout Pro (`/checkout/preferences`) | Contado | Pago numérico |
| Crédito en 2 o 3 cuotas | Checkout API con Card Payment Brick (`/v1/orders`, clave de idempotencia) | Lista | Orden `ORD…` |

- Importes, cuotas y referencia salen siempre del pedido guardado, nunca del navegador.
- La confirmación la decide la base (`confirm_checkout_mercadopago_payment`): un solo pago aprobado por pedido. No descuenta stock dos veces.
- Pedido pagado: SFSTORE rechaza nuevos intentos (409 `CHECKOUT_ALREADY_PAID`) y vence en Mercado Pago los links de Checkout Pro abiertos.
- Pagos cobrados que no confirman el pedido van a **Administrador → Pedidos web → Mercado Pago**:
  - **Requiere devolución:** duplicado, reserva vencida o sin pedido.
  - **Requiere revisión:** importe, moneda, medio o cuotas distintos.
- SFSTORE nunca devuelve dinero: la devolución se hace en Mercado Pago y luego se registra en el panel, que la audita.

## Interruptores (todos apagados por defecto)

1. **Servidor:** `MERCADOPAGO_PAYMENTS_ENABLED=1`, con `MERCADO_PAGO_ACCESS_TOKEN` y `MERCADO_PAGO_WEBHOOK_SECRET` cargados. Si falta alguno, las rutas de pago responden 410. El webhook, con el secreto cargado, verifica igual la firma (401 si es falsa) y responde 503 sin leer ni confirmar nada.
2. **Base:** `checkout_payment_settings.mercadopago_enabled`. Habilita Mercado Pago en un pago.
3. **Base:** `checkout_payment_settings.mercadopago_installments_enabled`. Habilita las cuotas y requiere también el interruptor 2. Activarlo solo cuando la cuenta financie 2 y 3 cuotas sin interés para el comprador.

Para apagar todo de inmediato, poner el interruptor 2 en `false`, sin desplegar nada. Los pedidos ya creados conservan su modalidad.

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

**Verificación obligatoria antes de activar:** «Simular notificación» de ambos tópicos no debe responder 401. Un 401 indica que el secreto o el formato de la firma no coinciden. Con el id ficticio de la simulación, lo esperable es 503, porque el pago no existe en Mercado Pago. La prueba definitiva es la notificación del primer pago real (paso 4), que debe confirmar el pedido sin intervención. Para ids `ORD…`, el manifiesto se firma con el id en minúsculas, y eso todavía no se verificó con una notificación real.

## Migración

`supabase/migrations/202611270001_mercadopago_checkout.sql`:

- Crea las tablas `checkout_payment_settings`, `checkout_mercadopago_payments` y `checkout_mercadopago_preferences`.
- Crea las funciones de confirmación, revisión y resolución, y los permisos de `service_role`.
- Permite el medio `mercadopago` con modalidad contado o financiado en el checkout web y crea los interruptores apagados.
- Se aplicó completa sobre bases locales aisladas, igual que su copia en `staging/`.
- En producción se aplica solo dentro del corte autorizado (ver [production-checklist](production-checklist.md)), con respaldo previo y antes del despliegue del código.
- No modifica precios, stock ni pedidos existentes.

## Orden de activación

1. Configuración comercial de la cuenta: acreditación a 35 días, 2 y 3 cuotas sin interés para el comprador, costos reales confirmados en la calculadora.
2. Migración productiva y despliegue del código con los tres interruptores apagados.
3. Variables productivas y webhooks; pasar la simulación de notificaciones.
4. Interruptores 1 y 2: un pago real de bajo importe con Checkout Pro. Verificar el pedido confirmado, el link vencido y la devolución manual desde Mercado Pago.
5. Interruptor 3: una compra real en 2 cuotas. Verificar que el comprador pague el precio de lista sin interés adicional.

## Costos y calculadora

En `lib/products/commercial-pricing.ts`:

- **`SFSTORE_PAYMENT_COSTS.financedBudgetPpm`:** presupuesta 15% (IVA incluido) para fijar el precio de lista en cuotas.
- **Filas `financed`:** guardan el costo real de Mercado Pago (2 cuotas 11,31%, 3 cuotas 14,58%) para los registros y las verificaciones. Si el costo real superara el presupuesto, prevalece el real.
- La calculadora solo sugiere: los precios publicados cambian únicamente al aplicarlos desde el administrador.
