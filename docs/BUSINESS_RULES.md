# Reglas comerciales existentes

Este documento registra comportamiento observado, no lo aprueba ni introduce cambios. Fuente: `lib/`, `services/`, migrations y pruebas de main `7a8a105`.

## Catálogo y productos

- Estados de producto: draft, active, archived. Catálogo real público exige producto activo, categoría activa e identidad no histórica (`lib/catalog/public-product-visibility.ts`, `services/products.ts`).
- Perfumes se muestran aparte; otras categorías se agrupan bajo Mates. No crear nuevas secciones por inferencia del giro del negocio.
- Precios y stock no negativos en esquema/validaciones relevantes. No ajustar valores reales por tareas de documentación, limpieza o normalización.
- Precio de transferencia usa `transfer_price` si existe; en otro caso usa `price`. Mercado Pago usa precio de lista. No hay porcentaje fijo de descuento que deba inventarse.
- Etiqueta de ahorro requiere precio de transferencia menor y ahorro redondeado de al menos 5% (`lib/pricing.ts`).
- Carrito limita cantidad usando stock capturado localmente. Este límite no reserva stock ni demuestra disponibilidad al pagar.
- Identidades históricas y consolidación Yara tienen exclusiones específicas; conservar trazabilidad y referencias. Ver [modelo de catálogo](catalog-data-model.md).
- Decants son productos independientes con precio/stock/SKU propios; no existe vínculo automático perfume-decant.

## Recomendaciones

Motor de coincidencias por género, familias olfativas, intensidad, ocasiones, presupuesto y stock. Umbrales actuales: principal >=70%, secundaria >=40% y <70%; menor a 40% queda oculto. Agotados requieren umbral principal; decants se agrupan por separado; `inStockOnly` excluye agotados. Coincidencia es una puntuación determinista de atributos, no garantía comercial ni personalización por IA. Conservar ranking y reglas de `lib/catalog/perfume-recommendation.ts`; calidad depende de los atributos disponibles.

## Operaciones administrativas

Compras tienen borrador/confirmación y movimientos trazables; ventas de mostrador admiten precios acordados y RPC atómicas. Pedidos de clientes (`channel=order`) tienen estados y transiciones propias: entregados/cancelados son de solo lectura; total no puede quedar por debajo de lo pagado; entrega exige estar listo, pagado e inventario suficiente. Los canales web, store y order no comparten automáticamente todas sus reglas.

Pagos aprobados se computan mediante libro de pagos. No cambiar históricos, inventario o saldos para hacer coincidir una pantalla. Confirmación, entrega, pagos e importaciones deben conservar idempotencia y trazabilidad (`supabase/migrations`, `services/order-payments.ts`, `services/inventory.ts`).

## Checkout actual y decisiones abiertas

Opciones implementadas: transferencia o Mercado Pago; retiro o envío; Correo Argentino, Andreani y Via Cargo como preferencias. El pedido web se crea en estado pendiente. Confirmar costos, cobertura, plazos, reserva/expiración de stock y cambios de precio entre carrito y pago con el propietario; no están resueltos por mostrar esos inputs.

El checkout actual calcula sobre precios del carrito y hace inserts públicos separados. No considerar esas cifras una política aprobada de confianza del backend. Cambiar ese flujo o conciliación de pagos es tarea RESTRINGIDA; preparar requisitos antes de implementar.

## Imágenes y Storage

Quitar una imagen de una galería y borrar un objeto físico son efectos distintos. En main existe protección previa por referencias; la corrección P1 de retención está pendiente en PR #1. No ejecutar limpiadores heredados ni habilitar apply del procesador. La futura política de retención y eliminación requiere decisión explícita y mecanismo que evite borrar objetos reemplazados/referenciados concurrentemente.

## Datos comerciales a confirmar

`lib/brand.ts` es la fuente actual de contactos, dirección y horario; `/admin/configuracion` es lectura. Confirmar exactitud antes de cambios. No inventar descuentos, tarifas, medios de pago adicionales, categoría de productos ni puntajes de recomendaciones. Pendientes se priorizan en [backlog](DEVELOPMENT_BACKLOG.md).
