# Nueva venta: continuidad y precio acordado

Preparado localmente el 07/11/2026 en `codex/store-sale-repeat-and-price-20261107`. No autoriza aplicar SQL ni publicar.

## Comportamiento

- Después de una venta confirmada, «Registrar otra venta» remonta el formulario con una clave de idempotencia nueva y solicita actualizar el catálogo disponible. La confirmación anterior permanece visible hasta elegir continuar.
- Se retiran del alta «Cliente opcional» y «Notas». Los datos históricos y las columnas existentes se conservan.
- El precio sugerido sigue la política vigente por medio de pago. El administrador puede registrar un precio unitario final mayor o igual al sugerido para esa operación, sin modificar productos.price, costos ni el precio online.
- El campo `unit_price` conserva la vista previa de catálogo para detectar precios desactualizados. El nuevo `sale_unit_price` opcional expresa el precio final acordado; no se vuelve a descontar.
- Pagos y total deben coincidir; no se convierte un excedente arbitrario en ingreso. El precio de la venta se ajusta primero. Se preservan el libro de pagos, los permisos y el descuento transaccional de stock.
- Para conjuntos, el incremento se asigna al primer componente resuelto; se mantienen cantidades, SKU, costo y lista histórica. El subtotal se agrupa por publicación lógica para evitar descuentos ficticios entre componentes. La solicitud queda en metadata para trazabilidad.

## Validación

- Build estándar Next.js/Turbopack y TypeScript con catálogo sintético, sin escrituras.
- ESLint completo: cero errores y 12 advertencias preexistentes; revisión focalizada posterior.
- Pruebas del modelo, acciones, servicios y compatibilidad de ventas existentes.
- Chrome con React real a 390×844, 648×572 y 1366×768: pagos combinados, cambios de medio, error/reintento con la misma clave, siguiente venta con clave nueva, edición a precio mayor y tres envíos independientes. Acciones simuladas y tráfico externo bloqueado. Capturas `store-sale-agreed-*` en los artefactos de sesión.
- SQL ejecutado sobre PostgreSQL WASM en memoria (PGlite 0.5.15 instalado sólo en artefactos, sin dependencia nueva de la aplicación), cargando el historial sintético hasta el contrato de componentes y luego la nueva migración. Nueve casos: compatibilidad anterior, precio mayor, precio sobre lista, tarjeta, importes inválidos, falta/exceso de pago, rechazo sin escrituras, reintento después de cambio de catálogo, asignación por componente, permisos y preservación de contratos online. El preflight alterado aborta sin dejar el helper creado.
- Límite: este motor aislado no certifica concurrencia entre sesiones ni la definición/grants actualmente instalados en Supabase. Docker no estaba disponible. Se conservan los bloqueos del contrato existente; no se hicieron ventas reales.

## Orden necesario para publicar

1. Con autorización expresa para base y despliegue, reconfirmar proyecto, main, deployment activo y ausencia de builds pendientes. Capturar definición, propietario y grants de `create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)` para recuperación; comprobar que el helper aún no exista y que el contrato actual coincida con los fragmentos exigidos por la migración. Detenerse si difiere.
2. Aplicar exclusivamente `202611070001_store_sale_agreed_unit_prices.sql`. No aplicar el historial de staging ni semillas. Es DDL transaccional, sin backfills o modificación de ventas, catálogo o stock existentes. El formulario anterior sigue siendo compatible porque el precio acordado es opcional.
3. Verificar definición, SECURITY INVOKER y EXECUTE exclusivo de service_role tanto en la transacción como en el helper. No crear una venta real como prueba.
4. Integrar y publicar el candidato probado. Recargar las pestañas administrativas para usar el nuevo formulario. Comprobar navegación y controles sin enviar operaciones productivas.

No publicar primero el formulario: la RPC anterior rechaza el nuevo atributo cuando el precio fue ajustado.

## Recuperación

Ante un error, informar antes de revertir y detener nuevos cambios. Conservar las ventas, pagos e inventario ya registrados. Volver al deployment previo es compatible con la nueva RPC porque sus campos adicionales son opcionales. No borrar filas ni reconstruir stock para deshacer este despliegue.

Si debe restaurarse la RPC, usar la definición y los grants capturados en el preflight, con autorización específica. Mantener la trazabilidad y los snapshots ya existentes. No eliminar el helper mientras una función desplegada lo invoque. La recuperación no requiere modificar el checkout online.
