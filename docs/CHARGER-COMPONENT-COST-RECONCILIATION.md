# Cargadores: reparto de costos y conciliación del envío

Estado: implementación local, no publicada. Rama `codex/charger-components-20261019`. No autoriza ninguna modificación productiva.

Este documento registra el conciliador de lectura entregado en `053aebf`. La continuación implementó el ejecutor transaccional, recepciones y selección conjunta: ver [motor de inventario por componentes](CHARGER-COMPONENT-INVENTORY.md). Los límites de «trabajo posterior» y las 43 pruebas que figuran abajo describen aquella entrega inicial, no el estado actual del motor.

## Criterio aprobado, no pendiente de otra decisión

- Repartir el costo proveedor de los 20 conjuntos: 50% a cabezales y 50% a cables.
- Ambos conectores tienen el mismo costo proveedor asignado por unidad; hay 10 cables C/C y 10 C/Lightning.
- Distribuir el envío completo de la compra entre 49 piezas: 20 cabezales + 20 cables + 9 vapers. No volver a aplicar el prorrateo de 29 unidades comerciales.
- Los precios de venta no están aprobados. El conciliador no los genera, rellena ni aplica.

El criterio se interpreta como reparto del costo proveedor seguido del envío por piezas. El redondeo del envío puede generar un centavo de diferencia entre el total de cabezales y el de cables, sin cambiar el reparto proveedor 50/50.

## Implementación

`lib/purchases/charger-components.ts` produce una propuesta determinista, sin persistencia. Valida compra confirmada, cantidades, líneas completas, costo proveedor, costo efectivo y totales de envío/adquisición antes de calcular. Reutiliza el asignador de envío existente de Compras, con aritmética entera y restos mayores; no cambia el algoritmo de las compras operativas.

Se guardan dentro de la propuesta los valores originales, los propuestos, diferencias de reclasificación, residuales, cantidades de conversión previstas y una huella SHA-256. La huella cambia si cambia el contenido y se mantiene si sólo cambia el orden de lectura de las líneas. Esto identifica una propuesta; **no equivale a haber implementado una conversión persistente idempotente**.

En la compra confirmada de dos líneas y 29 unidades, la línea de 20 ofrece un enlace de simulación. La ruta `/admin/compras/[id]/componentes?line=...` exige sesión administrativa, rechaza operaciones importadas históricas y consulta la compra mediante los lectores existentes. La pantalla muestra el envío una sola vez, la reclasificación compensada, los costos del lote y los residuales. No tiene acción de aplicar, formularios de escritura ni RPC nuevas. Los errores muestran un aviso y no generan una propuesta parcial.

## Conservación y redondeo

1. Mantener inalteradas compra, líneas, fecha, gasto de envío y movimientos originales. No reabrir ni reconfirmar la compra.
2. Representar fuera de la compra original la diferencia entre su prorrateo de 29 unidades y la distribución aprobada de 49 piezas. El aumento del costo asignado a componentes debe compensarse con una disminución igual del costo asignado a los vapers.
3. Conservar `total exacto del lote = suma proveedor + envío asignado` por grupo, y `residual = total exacto − cantidad × costo unitario redondeado`.
4. La suma de totales exactos propuestos debe ser idéntica al total original de la compra. No distribuir por segunda vez el envío registrado ni agregar una compra ficticia.
5. Los costos unitarios a dos decimales son valores de presentación/contrato vigente, no una prueba de que el valor exacto del lote sea ese unitario multiplicado por cantidad. Conservar los residuales explícitamente; no cargarlos como envío ni ocultarlos en precios de venta.

Los resultados de la compra revisada se generan localmente a partir de su captura privada, sin una nueva lectura productiva. Los IDs y la evidencia completa permanecen en `staging/runtime/charger-components-review-20261019`, ignorado por Git. No se importan datos reales en pruebas: los tests usan identidades sintéticas y cifras representativas.

## Límite operativo y trabajo posterior

Esta entrega implementa el conciliador y su previsualización, **no el ejecutor de conversión de inventario ni un motor de combos**. No se crean productos ni variantes, ni se cambia stock o costo. No se requiere una migración para esta entrega de lectura.

La futura operación deberá registrar una conversión y una reclasificación de costos separadas de la compra, de forma transaccional, con clave única de operación y comprobación de contenido. Consumirá 20 conjuntos fuente, agregará 20 unidades al cabezal reutilizado (21 con la unidad anterior) y 10 unidades a cada SKU de cable. El otro modelo USB-A a USB-C permanece fuera de la operación. Los combos no tendrán saldo propio.

Antes de aplicar costos a registros vigentes, verificar estado y movimientos de la fuente y del otro producto, reservas, versiones y procedencia. No basta con la captura anterior que mostraba nueve vapers: si hubo ventas o cambio de costo fuente posterior, detener la conversión, sin sobrescribir snapshots de costos históricos. La reclasificación debe distinguir inventario remanente de costo de unidades ya vendidas cuando corresponda; esta pantalla no toma esa decisión ni reescribe ventas.

El cabezal incluye una unidad anterior: el costo del lote nuevo no acredita el costo de esa unidad ni altera su historial. La política de costo vigente del SKU y la lectura de evidencia de transformación deben implementarse explícitamente al preparar el ejecutor; no inventar una compra directa del componente ni apuntar su costo a una línea de otro producto para certificarlo.

No se requiere volver a aprobar el reparto 50/50 ni las 49 piezas. Siguen pendientes la aprobación de precios y la autorización de cualquier regularización/publicación productiva. La compra conjunta puede reutilizar dos líneas de componentes; un precio propio del combo necesita un contrato adicional, sin segundo contador de stock.

## Validación y UX

Resultados locales: 43 pruebas aprobadas, sin fallos ni omisiones (21 nuevas del conciliador y 22 del cálculo de compras reutilizado). Cubren reparto proveedor, conservación exacta del envío/adquisición, reclasificación compensada, redondeo por lote, entradas congeladas, huella estable, rechazo de inconsistencias y renderizado de sólo lectura. La página se ejecutó con adaptadores sintéticos: una sesión no autorizada no invoca lectores; una compra histórica o con importes incoherentes muestra error. TypeScript, ESLint focalizado y build de producción aprobados. No se certifica una integración real de base de datos para una conversión que todavía no está implementada; no hay pruebas de escritura en Production ni uso de navegador.

Se reutilizan navegación, colores y tarjetas de Compras, con desglose por grupo y columnas adaptables. La acción se llama **Simular**; la pantalla declara que no modifica datos y que faltan precios. Las cifras exactas, unitarios y residuales tienen etiquetas distintas. Inspección visual de notebook/celular pendiente mientras se resuelve el incidente de Windows; no presentar SSR como aprobación visual.
