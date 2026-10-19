# Reglas comerciales existentes

Este documento distingue el comportamiento histórico de main `7a8a105` de las decisiones aprobadas para el candidato local PAY-01. Estas últimas no están desplegadas ni habilitadas.

## Catálogo y productos

- Estados de producto: draft, active, archived. Catálogo real público exige producto activo, categoría activa e identidad no histórica (`lib/catalog/public-product-visibility.ts`, `services/products.ts`).
- Perfumes se muestran aparte; otras categorías se agrupan bajo Mates. No crear nuevas secciones por inferencia del giro del negocio.
- Precios y stock no negativos en esquema/validaciones relevantes. No ajustar valores reales por tareas de documentación, limpieza o normalización.
- El catálogo histórico distingue precio de lista (`price`) de precio diferenciado (`transfer_price`). PAY-01 aplica la decisión aprobada de 25% una sola vez sobre `price` para transferencia y efectivo; no vuelve a descontar `transfer_price` ni modifica filas del catálogo. Mercado Pago permanece inactivo.
- Etiqueta de ahorro requiere precio de transferencia menor y ahorro redondeado de al menos 5% (`lib/pricing.ts`).
- Carrito limita cantidad usando stock capturado localmente. Este límite no reserva stock ni demuestra disponibilidad al pagar.
- Identidades históricas y consolidación Yara tienen exclusiones específicas; conservar trazabilidad y referencias. Ver [modelo de catálogo](catalog-data-model.md).
- Decants son productos independientes con precio/stock/SKU propios; no existe vínculo automático perfume-decant.

## Recomendaciones

Motor de coincidencias por género, familias olfativas, intensidad, ocasiones, presupuesto y stock. Umbrales actuales: principal >=70%, secundaria >=40% y <70%; menor a 40% queda oculto. Agotados requieren umbral principal; decants se agrupan por separado; `inStockOnly` excluye agotados. Coincidencia es una puntuación determinista de atributos, no garantía comercial ni personalización por IA. Conservar ranking y reglas de `lib/catalog/perfume-recommendation.ts`; calidad depende de los atributos disponibles.

## Operaciones administrativas

Compras tienen borrador/confirmación y movimientos trazables; ventas de mostrador admiten precios acordados y RPC atómicas. Pedidos de clientes (`channel=order`) tienen estados y transiciones propias: entregados/cancelados son de solo lectura; total no puede quedar por debajo de lo pagado; entrega exige estar listo, pagado e inventario suficiente. Los canales web, store y order no comparten automáticamente todas sus reglas.

Pagos aprobados se computan mediante libro de pagos. No cambiar históricos, inventario o saldos para hacer coincidir una pantalla. Confirmación, entrega, pagos e importaciones deben conservar idempotencia y trazabilidad (`supabase/migrations`, `services/order-payments.ts`, `services/inventory.ts`).

## Checkout con pagos manuales — candidato PAY-01

El propietario autorizó inicialmente solo transferencia bancaria y efectivo al retirar en el local. Efectivo no admite envío. Mercado Pago y otras pasarelas automáticas permanecen deshabilitados en interfaces públicas y endpoints; su reactivación requiere autorización comercial explícita. La existencia de tipos/datos históricos MP no habilita cobros.

En `codex/pay-01-atomic-checkout`, el pedido se crea pendiente de confirmación y pago pendiente mediante una transacción del servidor. Precio, tarifa configurada y total se calculan allí a partir de productos/cantidades y catálogo vigente. El carrito muestra una estimación, no un importe autoritativo; no puede escribir precios ni marcar pagos.

`confirmed` describe la confirmación del pedido/reserva; `payment_status='paid'` describe importe acreditado según el libro de pagos. Un administrador con sesión verificada y allowlist acredita manualmente el importe completo recibido, referencia de transferencia y reconocimiento expreso. Se registran administrador, operación y resultado; acreditación, confirmación y conversión de reserva son atómicas e idempotentes. La tienda verifica el movimiento bancario o recibe el efectivo; no hay verificación bancaria automática ni basta un comprobante del comprador. No se confunde el estado de pedido con dinero recibido.

Decisiones aprobadas para `codex/pay-01-approved-commercial-rules`: reservas de **24 horas** para ambos métodos; **25% de descuento** en todos los productos de un pedido válido. El servidor usa `round(price * 0.75, 2)` por unidad y después multiplica por cantidad; el subtotal es lista, descuento es la diferencia y total agrega exclusivamente la tarifa configurada. `transfer_price` no participa del nuevo cálculo, aun si contiene un descuento distinto. El descuento no se aplica al envío. El precio final queda congelado al crear pedido/ítems y en el resultado idempotente; cambios posteriores del catálogo no lo recalculan. La interfaz muestra lista como referencia, no calcula un total descontado autoritativo.

Retiro y envío están admitidos. Efectivo conserva la condición de pago **al retirar en local**; no se introduce efectivo contra entrega. Envío por transferencia exige cobertura/destino, transportista y costo válidos configurados por el local; sin ellos no crea pedido, reserva stock ni contrata transporte. La cobertura aprobada es toda Argentina; no se inventaron tarifas, transportistas ni retiro gratuito. La configuración sigue vacía y el checkout productivo cerrado.

La reserva vence a las 24 horas, pero no activa un proceso recurrente. Un administrador autorizado puede liberar pendientes vencidos de forma atómica e idempotente. Los pedidos pagados, los pagos aprobados y la evidencia manual de acreditación impiden liberar por vencimiento o cancelación. No se cambian vencimientos de pedidos existentes. Prórrogas, frecuencia operativa manual y tratamiento de pagos tardíos siguen pendientes de política; no se implementaron por inferencia.

El candidato acredita pagos completos positivos; cobros parciales, pedidos de total cero, reembolsos y pagos llegados tras liberar stock requieren un contrato adicional aprobado. No se cambiaron los libros parciales/históricos de otros canales ni se convierten reservas canceladas/vencidas en pagadas.

## Imágenes y Storage

Quitar una imagen de una galería y borrar un objeto físico son efectos distintos. En main existe protección previa por referencias; la corrección P1 de retención está pendiente en PR #1. No ejecutar limpiadores heredados ni habilitar apply del procesador. La futura política de retención y eliminación requiere decisión explícita y mecanismo que evite borrar objetos reemplazados/referenciados concurrentemente.

## Datos comerciales a confirmar

`lib/brand.ts` es la fuente actual de contactos, dirección y horario; `/admin/configuracion` es lectura. Confirmar exactitud antes de cambios. No inventar descuentos, tarifas, medios de pago adicionales, categoría de productos ni puntajes de recomendaciones. Pendientes se priorizan en [backlog](DEVELOPMENT_BACKLOG.md).

## Compra invitada y envíos nacionales aprobados

Compra sin registro ni contraseña mediante sesión anónima verificada de Supabase Auth. Nombre completo y teléfono necesarios; email opcional. Pedidos y cotizaciones solo accesibles por la identidad propietaria o administrador autorizado. Un invitado nunca adquiere permisos administrativos.

Cobertura: toda Argentina. Se solicita provincia, localidad, código postal y dirección. Tarifas configurables por destino; no hay costos ni transportistas asignados por defecto. Si falta tarifa válida, se registra solicitud de cotización sin confirmar pedido, reservar stock ni determinar un total ficticio. Una tarifa válida se verifica y congela en servidor al crear pedido. Transferencia admite envío; efectivo sigue siendo al retirar. Descuento único 25%, reserva 24 horas y acreditación manual administrativa permanecen vigentes; pedidos pagados no liberan stock por vencimiento. No se activan procesos recurrentes ni Mercado Pago.
