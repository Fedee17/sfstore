# Cargadores: precio especial por combo

Estado: implementado localmente sobre `e429ab78`, sin publicar, aplicar SQL ni modificar datos reales. Continúa la conversión y conciliación de [inventario por componentes](CHARGER-COMPONENT-INVENTORY.md); no cambia el reparto aprobado de costos ni las 49 piezas de envío.

## Regla comercial aprobada

| Presentación | Lista | Efectivo / transferencia |
| --- | ---: | ---: |
| Cabezal | $22.000,00 | $16.500,00 |
| Cable USB-C a USB-C | $15.800,00 | $11.850,00 |
| Cable USB-C a Lightning | $15.800,00 | $11.850,00 |
| Cabezal + un cable elegido | $30.666,67 | $23.000,00 |

El precio especial reemplaza la suma individual del conjunto. Se aplica el 25% una sola vez al precio de lista del combo: `round(30666.67 × 0.75, 2) = 23000.00`. El contrato existente redondea por unidad antes de multiplicar; tres combos son $69.000,00 por transferencia y $92.000,01 de lista. No se cambia el precio comercial aprobado para acomodar el redondeo.

Si cualquier pago de una venta física usa débito, crédito, QR u otro medio, toda esa venta utiliza lista. Efectivo y transferencia combinados conservan el descuento. El cliente no puede enviar precios al checkout, cupones ni descuentos adicionales. Los dos componentes comprados por separado siguen costando $28.350 por efectivo/transferencia; los carritos antiguos no se transforman automáticamente en combos.

## Contrato técnico

- El combo conserva el ID del producto comercial existente, combinado con `comboConnector` (`cc` o `lightning`), como identidad lógica de selección. No tiene stock propio; no puede venderse como SKU simple. La unidad previa del cabezal y el cable genérico histórico se conservan según el contrato de componentes; el cable USB-A a USB-C queda fuera.
- `component_combo_pricing` guarda una regla versionada por receta. `configure_component_combo_price` exige actor, clave idempotente y auditoría inmutable. No escribe precios individuales ni activa recetas automáticamente. El contrato queda vacío tras la migración.
- La oferta pública exige la regla habilitada y la aprobación previa de los precios individuales exactos. Cambiar un precio individual invalida esa aprobación. No se publica una oferta incompleta ni se reemplaza por una suma silenciosa de precios.
- Catálogo, mostrador y carrito representan una selección con un precio único. En servidor/PostgreSQL se expande a un cabezal y un cable reales. Se agrega la demanda de cada SKU entre combos y artículos individuales, se bloquean productos en orden y se conservan los controles de reservas, canales e idempotencia.
- Cada línea real conserva costo, precio y `combo_price_snapshot`: presentación, conector, versión y precio comercial congelado. El importe de lista y el neto ya descontado se distribuyen por separado proporcionalmente a los precios individuales; se redondea el cabezal y el cable recibe el residual. La suma de líneas coincide con el total cobrado. No se vuelve a descontar el precio asignado a cada componente.
- Los detalles administrativos y el comprobante de pedido identifican las líneas como partes del combo. Analytics recibe importes reales asignados por SKU, sin duplicar ingresos; no se recalculan costos ni operaciones históricas.
- Los límites existentes del checkout se aplican a la demanda física agregada: dos conectores comparten el límite y el stock del cabezal. No se amplían límites para hacer pasar una compra de varios combos.
- Cancelaciones y vencimientos reutilizan las liberaciones actuales por línea y su idempotencia. Las acreditaciones no vuelven a descontar stock; un pedido pagado no libera reservas por vencimiento.

## Devoluciones: alcance preparado

`return_component_combo_stock` permite devolver físicamente pares completos ya vendidos, con actor, motivo y clave idempotente. Bloquea el pedido y los SKU, controla el acumulado devuelto y evita doble reposición incluso con claves concurrentes. Devuelve un importe de referencia basado en el precio congelado. **No procesa dinero, cambia pagos ni constituye un reembolso financiero.** No añade un módulo de devoluciones ni habilita devoluciones parciales de un solo componente. Esas políticas y su interfaz quedan fuera de esta entrega.

## SQL y transición futura

Nueva migración preparada: `supabase/migrations/202610200001_component_combo_pricing.sql`, posterior a `202610190001_component_inventory.sql`. Incluye transacción, timeout de lock de 3 segundos, timeout de sentencia de 30 segundos, RLS y denegación de ejecución pública de los auxiliares. La vista pública contiene solo la oferta comercial, sin costos ni auditorías. Los servicios administrativos conservan la autorización existente.

La migración verifica firmas, SHA-256 del cuerpo completo de cinco RPC actuales, tipo de retorno y privilegios antes de reemplazarlos. Normaliza únicamente CRLF a LF. Si el contrato difiere, aborta con `COMBO_BASE_CONTRACT_CHANGED`; no quitar la guarda ni adaptar automáticamente Production. El preflight `reports/component-combo-pricing-preflight-read-only.sql` permite revisar esas condiciones mediante catálogos, con `READ ONLY`, timeouts y rollback. No certifica por sí solo el destino ni la vigencia de datos comerciales.

Antes de una publicación autorizada:

1. Confirmar deployment/commit productivo, esquema, contratos, respaldo reciente recuperable y hashes del candidato. Revalidar compra, stock, movimientos y reservas: la evidencia anterior no sustituye esa lectura.
2. Revisar primero el plan de componentes y conversión existente, con los seis SKU exactos y las cantidades aprobadas. No recrear compras ni alterar su historial. Conservar el estado de apertura, reclasificación compensada y residuales de costos.
3. Ensayar ambas migraciones y el candidato sobre datos sintéticos; coordinar una pausa breve de edición de recetas/precios. Sin recetas activas, los productos simples mantienen su comportamiento. Si hay consumidores de combos antiguos activos, pausar su oferta hasta actualizar el código; no dejar una interfaz antigua ofreciendo otra suma comercial.
4. Aplicar solo los archivos revisados y autorizados, verificar contratos y publicar el código compatible antes de habilitar ofertas de combo. Ante error de SQL, detenerse y comprobar rollback. Ante resultado incierto, consultar versión/clave de auditoría antes de repetir.
5. Preparar explícitamente los precios individuales aprobados, su aprobación de valores exactos y la regla de combo $30.666,67 / $23.000 mediante una nueva autorización productiva. No se aplica nada de esto al ejecutar la migración estructural. No utilizar UUID sintéticos de los tests.
6. Verificar UI en notebook/celular, Auth y PostgREST en un entorno no productivo autorizado. No realizar compras productivas para sustituir estas pruebas.

Recuperación: un fallo transaccional no deja cambios parciales. Tras ventas con snapshots de combo, conservar el esquema y una versión compatible del código; no eliminar columnas ni volver ciegamente al formulario anterior. Si hay un incidente, pausar las compras/ofertas mediante el procedimiento operativo aprobado y corregir hacia adelante. La reversión de la conversión inicial conserva sus guardas: solo procede sin actividad posterior y nunca sobrescribe una compra histórica. Un reembolso financiero requiere su propia autorización.

## Evidencia y límites de validación local

Las pruebas incluyen precios individuales y especiales, ambos conectores, descuentos y pagos combinados, cantidades múltiples, carritos antiguos, última unidad concurrente entre mostrador/web, falta de un componente, cancelaciones/vencimientos idempotentes, pago confirmado, devolución concurrente, cotización de envío, permisos y preservación del historial/costos. Los tests usan PostgreSQL 17.6 descartable y datos sintéticos, sin acceso a Production.

Los componentes React y el estado real de carrito se prueban con renderizado y adaptadores locales. Esto no equivale a una revisión visual en dispositivo ni a un circuito completo con Supabase Auth/PostgREST. La inspección visual continúa pendiente mientras esté prohibido el control del navegador/escritorio. La interfaz conserva selectores etiquetados, elección explícita de cable, una sola línea lógica, mensajes de disponibilidad y controles de cantidades; no se declara visualmente certificada.

No se instala medición nueva ni se atribuyen mejoras de conversión sin datos. En una publicación futura pueden medirse selección de conector, adición y rechazo por disponibilidad, sin costos ni datos personales. No quedan decisiones pendientes sobre los precios o el reparto de costos aprobados; quedan preflight, respaldo, revisión visual/integración y autorizaciones de publicación.

## Resultados de cierre — 20/10/2026

- Suite general: **865 aprobadas, 0 fallos, 13 omisiones opcionales** (878 tests).
- PostgreSQL 17.6 aislado: **56 aprobadas, 0 fallos, 0 omisiones**: 20 de precio especial, 27 del motor de componentes y 9 de variantes comerciales. El nuevo preflight también aprobó las cinco firmas; un cambio sintético de privilegio abortó la migración sin dejar tablas ni cambios parciales. Los contenedores propios se retiraron.
- Build de producción y TypeScript: aprobados localmente. ESLint: cero errores y nueve advertencias preexistentes de imágenes; sin nuevas advertencias. `git diff --check`: aprobado.
- Gitleaks sobre el diff preparado: sin secretos detectados. Auditorías privadas preexistentes y archivos de runtime excluidos del commit.
- SHA-256 del nuevo SQL con los bytes LF guardados en Git: `b8cf692d065d3fd593e232c6d6ce04f06759201e2cd01418e61deadb20d727ea`. Verificar los bytes exactos antes de una futura autorización de aplicación.

La repetición inicial de PostgreSQL no pudo iniciarse porque Docker Desktop estaba detenido. Tras iniciarlo en segundo plano se completaron las 56 pruebas. No se modificaron pruebas para ocultar fallos de inventario ni se presentan pruebas omitidas como aprobadas. La validación visual y el circuito completo no productivo Auth/PostgREST siguen pendientes; no se abrió navegador ni se controló el escritorio.
