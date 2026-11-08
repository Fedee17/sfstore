# Administrador: mejoras operativas locales — 07/11/2026

El propietario aprobó implementar la secuencia de la auditoría. Candidato: `codex/admin-business-improvements-20261107`, sobre el snapshot local `3339fa3`. No se autoriza por ello ejecutar la migración pendiente ni publicar. Production conocida permanece en `7f4b37a`; no se ejecutaron operaciones productivas en este trabajo.

## Cambios por etapa

1. **Fiabilidad (A01–A03).** Inicio reutiliza el contrato comercial del informe mensual: ventas confirmadas del día argentino, cobros aprobados con fecha del día y saldos de ventas del mes se presentan separados. Los pagos sin fecha y las limitaciones de conciliación siguen visibles. Un error de lectura no se muestra como cero. Inventario filtra el día argentino con límite final exclusivo y muestra la fecha en esa zona. Consulta usa la misma función de precio sugerido que Nueva venta, sin cambiar el catálogo almacenado.
2. **Continuidad de venta (A05).** Se conserva el candidato previo: Registrar otra venta limpia el formulario, refresca el catálogo y genera otra clave de operación; sin Cliente/Notas en el alta. Precio final mayor al sugerido se registra como venta, sin confundirlo con vuelto ni descontarlo otra vez. Requiere la migración preparada y su autorización separada; ver [runbook](../docs/STORE-SALE-REPEAT-AND-PRICE.md).
3. **Atención e historiales (A06/A09).** Consulta ofrece Vender este producto y Copiar precio; no envía mensajes. La venta preselecciona el producto disponible y valida nuevamente al confirmar. Historiales buscan referencia/proveedor y nombre original de línea, admiten Desde/Hasta y conservan filtros/página al volver del detalle local/histórico. Búsqueda acotada a 100 coincidencias de cada fuente; si hay truncamiento o exceso, solicita una búsqueda más específica, sin devolver coincidencias parciales. No se leen productos actuales para reescribir nombres/precios históricos.
4. **Inicio y tareas (A04/A07/A11–A15).** Accesos frecuentes; navegación agrupada por tarea y estado activo, sin la fila de once destinos equivalentes. Datos de la tienda es secundario y sigue siendo lectura. Pedidos web separa avisos de pago, cotizaciones, pedidos y supervisión; las alertas técnicas críticas siguen visibles. Avisos pendientes se filtran antes de paginar, para alcanzar avisos antiguos. Se preserva la acreditación explícita y las reservas protegidas. WhatsApp se oculta sólo en `/admin`. Formularios de producto, compra y venta advierten al cerrar/recargar o seguir enlaces con cambios; sin persistencia en localStorage. Detalle de venta apila sus datos en móvil.
5. **Disponibilidad y catálogo (A08/A10).** Inventario abre una lista de disponibilidad ordenada de menor a mayor, con filtro sin stock/stock bajo y acceso a revisión, movimientos y carga de compra. Se reutilizan las publicaciones por componentes: los combos comparten stock, no se suman como unidades físicas ni admiten ajuste manual independiente. El umbral de tres unidades es el existente y está explicado; no se inventan mínimos de reposición. Movimientos conserva trazabilidad y agrega páginas de 50, sin el corte silencioso a 200. Productos abre en lista compacta, páginas de 40 y filtro de foto/precio/costo pendientes; detalle y ajustes existentes siguen disponibles. Lecturas completas verifican conteos y rechazan respuestas truncadas antes de mostrar saldos/totales.

## Validación y evidencia

- Build estándar Next.js 16.4.1/Turbopack y TypeScript correctos, con servidor Supabase sintético y cero escrituras. Sin secretos productivos. Launcher y evidencia en el directorio de artefactos de la sesión.
- Suite general: **1.015 aprobadas, cero fallos, 19 omisiones** por servicios de prueba opcionales. Las nueve pruebas SQL de precio acordado pasan adicionalmente en PostgreSQL WASM aislado. Las tres pruebas reales de formularios en Chrome pasan adicionalmente: imágenes/guardado, editor de precios y ventas con pagos/reintentos/segunda operación.
- Seis pruebas nuevas de flujos, más tres de fundamentos: separación de indicadores, fecha nocturna argentina, coherencia de precio, rangos históricos, búsqueda por snapshots, retorno seguro, stock/combos, paginación y rechazo de resultados parciales.
- Chrome en ventas a 390×844, 648×572 y 1366×768: cobro completo, precio mayor, reintento, clave nueva, salida cancelable y preselección. Acciones simuladas; sin ventas reales.
- Ocho controles visuales sintéticos: Inicio, Productos, Disponibilidad y Nueva venta a 390 y 1366 px, con componentes reales y CSS del build. Sin desborde horizontal. Se encontró y corrigió la compresión del buscador de stock móvil. Capturas `admin-business-{home,products,stock,sale}-{390,1366}.png` y métricas `admin-business-visual-qa.json` en artefactos.
- ESLint completo: cero errores y 12 advertencias previas. `git diff --check` correcto.
- Los fixtures aislados se actualizaron para resolver los componentes nuevos; las pruebas de precios/combos siguen comprobando los importes e identidades originales. El manifest de staging incorpora la copia idéntica de la migración pendiente; generar staging no ejecuta SQL. El script de QA visual resuelve componentes de servidor fuera de Next y usa mocks: no certifica autenticación ni navegación completa de Production.

## Criterios de aceptación y límites

| Control | Estado y evidencia |
|---|---|
| Utilidad | Sí: una búsqueda hacia venta, próxima operación sin recarga, consultas por fecha/referencia, listado compacto y stock revisable. Ahorro de tiempo esperado, todavía no medido. |
| Identidad | Sí: se reutilizan colores, controles y patrones administrativos existentes. No se rediseñó la tienda pública. |
| Móvil/escritorio | Sí en fixtures de componentes y formularios indicados. Revisión visual autenticada con catálogo real pendiente. |
| Accesibilidad | Etiquetas, estados, foco nativo y objetivos de 44 px; menú nativo por teclado. No se certifica auditoría exhaustiva con lector de pantalla. |
| Integridad | Pruebas de reglas, SQL, históricos de sólo lectura y cantidades de combos. No se alteraron datos comerciales reales. |
| Medición | Indicadores de tarea definidos en la auditoría. Sin analítica nueva de administración ni promesas de ahorro no medido. |
| Publicación | No realizada; sin push, merge o nueva modificación de Supabase. |

Límites concretos:

- La advertencia de cambios protege enlaces y cierre/recarga. No se afirma interceptar toda navegación programática ni el botón Atrás interno de App Router. No se implementó un autosalvado de datos sensibles.
- El resumen diario reutiliza la lectura comercial completa; no se afirma optimización de tiempos sin medirla con volumen real. Pendientes corresponde a ventas del mes, no a toda la deuda histórica.
- Las búsquedas de historial son acotadas; una búsqueda muy amplia debe refinarse. La disponibilidad rechaza catálogos truncados y solicita acotar nombre/categoría. No hay sugerencias automáticas de cantidades ni proveedor preferido sin datos de reposición aprobados.
- No se creó una exportación comercial: requiere definir campos y alcance de datos. No se calculan caja neta ni ganancia neta sin gastos/retiros/devoluciones/saldo inicial.
- La migración de precio acordado no fue aplicada. PostgreSQL WASM no certifica concurrencia de varias sesiones ni el contrato/grants remoto. El preflight y autorización productiva siguen siendo obligatorios.

## Próximo paso y reversión

Revisión visual del propietario sobre este candidato. Después, autorizar de manera específica el preflight/aplicación de `202611070001_store_sale_agreed_unit_prices.sql` y la publicación del frontend, en ese orden. Reconﬁrmar main y deployment activo antes de integrar. No aplicar las 41 migraciones del staging a Production.

Ante una incidencia, detener operaciones nuevas e informar antes de revertir. El frontend anterior es compatible con la RPC nueva por sus campos opcionales. Conservar ventas, pagos y movimientos; no restaurar la base ni reconstruir stock para revertir UI. Recuperación de RPC sólo desde definición y grants capturados, con autorización específica, como describe el runbook.

## Seguimiento solicitado — Ventas y Pedidos web, 08/11/2026

El propietario pidió corregir la utilidad/maquetación de Pedidos web, retirar las pruebas del listado de Ventas, quitar el selector Pago y añadir gráfico de barras y producto más vendido por mes. Se retomó el mismo candidato local preservando los cambios anteriores.

Ventas ahora reutiliza el modelo comercial validado para seis barras mensuales y ranking por unidades del mes seleccionado, con empate indicado, vacío real y valores originales. El selector mensual no cambia los filtros del historial; cambiar los filtros del historial no altera el panel, como indica la pantalla. Los importes de las barras se abrevian visualmente; el total seleccionado, el título emergente y la etiqueta accesible conservan el importe exacto. El selector de pago se retiró y parámetros antiguos de pago se ignoran en este recorrido; los estados de los registros y las reglas de cobro no cambian. Se conserva el historial debajo.

Las operaciones identificadas por la política de evidencia (IDs exactos de operación/producto/categoría) se excluyen antes de contar y paginar el historial, y del gráfico/ranking. No se borran ventas, pagos o movimientos ni se usa búsqueda por nombre para inferir pruebas. Para compartir la misma lectura del panel y listado, Ventas obtiene un snapshot completo paginado por el lector existente, con límites/timeout y rechazo de resultados parciales; luego filtra y pagina en memoria. Compras y detalles conservan sus lectores acotados. No se certifica rendimiento con volumen productivo.

Pedidos web tiene tarjetas con estado, comprador, productos, medio, importe y fechas argentinas; comprobante privado, bloque de acreditación y rechazo separado con reconocimiento explícito de cancelación/liberación. Historial, excepciones y supervisión quedan desplegables. Cotizaciones tiene presentación propia, formulario con costo verificado y aclaración de que no envía mensajes ni genera pedido/reserva. Estados vacíos/error tienen acciones de navegación/actualización, sin mostrar cero como sustituto de un fallo. Se mantienen las mismas Server Actions/RPC/guardas, clave estable para reintentar y confirmación bancaria del total. Los campos de texto preservan lo ingresado ante error; la verificación bancaria debe confirmarse nuevamente en cada intento. La consulta protegida agrega sólo nombre/teléfono y snapshots de productos necesarios para la tarjeta. Sin lecturas de clientes reales en la validación.

Validación final: build estándar Turbopack y TypeScript correctos con servidor sintético, cero escrituras. ESLint cero errores y 12 advertencias previas. Suite general: 1.020 aprobadas, cero fallos y 20 omisiones opcionales; la nueva prueba omitida por defecto se ejecutó por separado en Chrome y pasó a 390/648/1366 (desplegables, requerimiento de verificación, error/reintento con misma clave, bloqueo tras éxito y consentimiento de rechazo). Cinco pruebas nuevas de panel/exclusiones/paginación/estados/autorización pasan. Nueve controles visuales sintéticos sobre componentes reales: Ventas, Pedidos web con acreditación abierta y cotizaciones vacías a 390/648/1366, sin overflow. Se inspeccionaron las capturas. Artefactos admin-next-*, incluidos sales-panels-* y checkout-648.png. Los tests opcionales con PostgreSQL se adaptaron a las nuevas bandejas/desplegables, pero no se ejecutaron por falta del servicio local; no se cuentan como pases.

Estado: revisión autenticada/productiva y autorización de publicación pendientes. Sin nuevo commit, push, integración, despliegue o SQL remoto. Las capturas utilizan datos sintéticos y no representan cifras reales del negocio. Se preserva el requisito anterior de aplicar la migración de precio acordado antes de publicar ese formulario, con autorización específica.
