# Fecha comercial de ventas locales — candidato del 08/11/2026

El propietario pidió registrar una venta olvidada con el día en que ocurrió, incluso si corresponde al mes anterior. Implementación local; no se aplicó SQL remoto ni se autorizó publicar.

## Comportamiento y límites

- Nueva venta muestra Fecha de venta, inicialmente hoy en Argentina. Admite fechas reales desde 1900 hasta hoy; cliente, acción, servicio y RPC rechazan valores inválidos/futuros. Clientes anteriores sin campo conservan la RPC anterior.
- La fecha elegida se almacena en `orders.store_sale_date` exclusivamente para ventas locales actuales. `created_at` conserva el instante de carga. Sin backfill ni cambios sobre ventas existentes o importaciones históricas.
- Historial, filtro por fecha, panel diario, barras mensuales, ranking e informe mensual usan la fecha comercial. Los registros anteriores sin fecha explícita conservan el día argentino de `created_at`; los importados mantienen su fecha original.
- `order_payments.paid_at` y los movimientos de inventario conservan el instante real de registro de la operación. No se inventa una hora de cobro pasada ni se reescribe el libro de pagos. Por eso un cobro recién registrado puede aparecer en otro mes que la venta comercial. Cambiar la fecha de venta no atribuye automáticamente una fecha histórica a la acreditación.
- La confirmación sigue descontando el stock actual y exige el cobro completo. El formulario advierte al elegir un día anterior: comprobar que no se haya registrado antes, y que no se reconstruyen costos ni cobros históricos. No resuelve un ajuste manual de stock ya realizado ni permite repetir una operación existente como una nueva venta.
- La operación toma el catálogo/precio sugerido actual y permite el precio final acordado conforme al candidato previo. Para cargas atrasadas, los costos capturados al ingresar no se presentan como costo histórico verificado: metadata distingue `current_product_cost_at_late_entry_v1`, y el informe conserva margen desconocido en esas líneas.

## Transacción e idempotencia

La migración aditiva `202611080001_store_sale_commercial_date.sql` crea una columna nullable y `create_store_sale_dated_atomic`. Es SECURITY INVOKER con EXECUTE sólo para service_role. Verifica la migración previa de precio acordado y los permisos del contrato principal.

La RPC nueva toma la misma advisory lock por clave que la transacción anterior, verifica la fecha de una operación existente y delega en la RPC estable. Guarda la fecha sólo cuando la operación fue creada. Reintentar con la misma fecha y solicitud devuelve la venta existente; cambiar la fecha con la misma clave produce conflicto. Una excepción revierte también la venta, los pagos y el stock dentro de la transacción. La RPC anterior y los contratos web permanecen sin redefinir.

## Validación

- Doce pruebas PostgreSQL WASM aisladas aprobadas: nueve regresiones de precio/stock/roles y tres casos de fecha pasada, conservación de timestamps, costo no histórico, replay, conflicto, fechas inválidas/futuras y permisos. No certifican concurrencia entre varias sesiones ni el contrato remoto actual; Docker local no disponible según diagnóstico anterior.
- Cinco pruebas nuevas de fecha: calendario y medianoche argentina, atribución entre meses con cobro separado y margen desconocido, RPC elegida, validación de acción y filtro del lector legado.
- Chrome con React real a 390/648/1366: fecha pasada elegida y enviada con la clave de la operación, reintento sin duplicar y continuidad de la siguiente venta. Acciones simuladas, sin red externa ni ventas reales.
- Tres controles visuales sintéticos del formulario a 390/831/1366, sin overflow; captura del campo revisada. Evidencia `sale-date-*` y `store-sale-agreed-*` en los artefactos de sesión.
- Build estándar Turbopack/TypeScript aprobado; suite general 1.025 pases, cero fallos y 20 omisiones opcionales. Pruebas SQL y Chrome indicadas se ejecutaron adicionalmente a la suite por defecto. ESLint cero errores y 12 advertencias previas. Sin cambios de dependencias.

## Secuencia de publicación pendiente de autorización específica

1. Reconfirmar main/Production, respaldar definiciones/grants aplicables y comprobar el contrato, columna y RPC remotos. Detener ante discrepancias. No probar con ventas reales.
2. Aplicar primero `202611070001_store_sale_agreed_unit_prices.sql` y después `202611080001_store_sale_commercial_date.sql`, únicamente si no fueron aplicadas y tras aprobación. No ejecutar las 42 migraciones de staging sobre Production.
3. Comprobar columna, constraint, SECURITY INVOKER y EXECUTE exclusivo de service_role. Publicar después el frontend completo validado: los nuevos lectores necesitan la columna, además de la RPC de alta.
4. Verificar UI y lecturas sin enviar ventas ni pagos. La prueba de escritura fue aislada.

Recuperación: informar antes de revertir y detener operaciones nuevas ante un fallo crítico. Conservar fecha comercial, ventas, pagos y movimientos; no borrar columnas/filas ni restaurar stock. El frontend anterior puede operar con la RPC antigua pero no interpreta la nueva fecha en sus informes, limitación que debe hacerse visible si se revierte UI. Restaurar funciones o esquema requiere una autorización específica y revisar operaciones posteriores; un rollback de UI no autoriza eliminar los datos nuevos.
