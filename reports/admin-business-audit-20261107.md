# Auditoría del administrador SFSTORE: utilidad y agilidad

Fecha: 07/11/2026, Argentina. Alcance: auditoría funcional y de implementación; no implementación de nuevas mejoras.

## Alcance y evidencia

- Referencia productiva conocida: `7f4b37a`, publicada en sfstore-ten.vercel.app. Se contrastaron las rutas y servicios del repositorio; la reproducción del indicador inicial utiliza expresamente el código de ese commit.
- Los cambios de Nueva venta en `codex/store-sale-repeat-and-price-20261107` están pendientes de integración, migración y publicación. No se presentan como comportamiento productivo resuelto.
- Se revisaron inicio, navegación, ventas, pedidos/encargos, pedidos web, compras, proveedores, productos, consulta rápida, inventario, informe mensual y configuración, junto con sus servicios relevantes.
- Se reprodujeron dos comportamientos con entradas sintéticas, sin conectarse a la base productiva: suma del indicador inicial y desplazamiento de fecha en inventario. Evidencia privada de sesión: `admin-business-audit-evidence.json`.
- No se ejecutaron ventas, compras, pagos, acreditaciones, ajustes de stock, importaciones ni mensajes. No se inspeccionaron secretos o datos de clientes.
- **Límite visual:** el runtime de navegación de esta sesión falló antes de poder conectarse a la pestaña autenticada (`failed to write kernel assets`). No se pudieron obtener capturas nuevas ni recorrer visualmente toda la sesión del propietario. No se afirman contrastes medidos, tiempos de carga, accesibilidad completa ni una auditoría visual exhaustiva. Los riesgos de layout se identifican por CSS y necesitan comprobarse en pantalla.
- No hay tiempos de operación medidos: las oportunidades de ahorro son cualitativas. No se inventan minutos ahorrados, ingresos, conversiones o datos comerciales.

## Diagnóstico

El administrador tiene una base valiosa de registro, trazabilidad y análisis. Su principal oportunidad es conectar esa base con decisiones diarias: qué cobrar, qué entregar, qué vender y qué reponer. Hoy varias tareas requieren elegir entre secciones, volver a buscar el mismo producto o abrir un registro para llegar a su siguiente acción.

El criterio de prioridad es: fiabilidad de los datos → continuidad de la atención → acceso a la siguiente acción → menor trabajo repetido → presentación y densidad.

## Hallazgos priorizados

### A01 · Alta · El indicador de ventas del inicio no distingue estados ni período

**Confirmado en código y reproducción sintética.** `services/admin.ts:444` llama lectores generales y en la línea 458 suma `order.total` de todos los pedidos recibidos. Excluye importaciones históricas, pero no filtra cancelados, pendientes, fecha comercial o pagos aprobados. `app/admin/page.tsx` muestra ese resultado como «Ventas registradas», sin período.

Ejemplo **sintético**: una venta pagada de 100, un pendiente de 200 y un cancelado de 300 producen 600 en el indicador. Esto no demuestra un importe incorrecto concreto en Production; demuestra que ese cálculo no equivale a ventas confirmadas ni a dinero cobrado.

**Impacto:** no permite responder de forma confiable cuánto se vendió o cobró hoy. Los lectores sin conteo/paginación explícitos tampoco garantizan un total completo al crecer el catálogo/historial.

**Acción:** reutilizar las definiciones de `lib/commercial-reporting`, con período argentino visible, para separar «Ventas confirmadas», «Cobros acreditados» y «Pendiente de cobro». No sumar con otro criterio en el inicio. Si una lectura falla, mostrar «No disponible», sin presentar un cero parcial como resultado válido.

### A02 · Alta · La fecha del inventario no coincide con el día comercial argentino

**Confirmado y reproducido.** `services/inventory.ts:166`–171 arma límites `00:00Z`/`23:59Z` para una fecha elegida. Un movimiento del 07/11 a las 22:30 argentinas tiene timestamp 08/11 01:30Z y queda fuera del filtro 07/11.

**Impacto:** dificulta encontrar un movimiento y conciliar lo ocurrido durante el día.

**Acción:** reutilizar `commercialDayBounds` y el intervalo inicio inclusivo/fin exclusivo del modelo comercial. Probar límites de medianoche, no compensar con un desplazamiento fijo repetido por pantalla.

### A03 · Alta · Consulta rápida y venta calculan el precio especial por caminos diferentes

**Riesgo confirmado en implementación; diferencia concreta de importes no comprobada.** `services/admin-catalog.ts` lee `transfer_price` y la tarjeta de consulta lo muestra. El flujo de venta calcula su sugerido desde lista y medios de pago mediante `calculateStoreSalePricing`.

**Impacto:** con datos desactualizados, puede cotizarse un importe en Consulta y aparecer otro al cobrar.

**Acción:** definir un único contrato de precio sugerido para el mostrador y reutilizarlo en consulta, resultados y venta. Separar el precio público por transferencia cuando su política sea distinta. Conciliar el Excel antes de cambiar precios reales; no corregir esta diferencia con un porcentaje arbitrario.

### A04 · Alta · Inicio con poca orientación a tareas pendientes

**Confirmado.** El inicio presenta cuatro cifras generales y últimos cinco pedidos. No ofrece accesos principales a Nueva venta/Nueva compra ni convierte la lista en accesos a cada registro.

**Impacto:** el operador debe navegar y volver a ubicar una tarea para actuar.

**Acción:** priorizar «Registrar venta», «Consultar producto», «Cargar compra» y una bandeja de pendientes con enlaces: pagos informados por revisar, cotizaciones solicitadas, encargos con entrega pendiente y productos que requieren revisión. Los contadores deben llevar exactamente al filtro que representan.

### A05 · Alta · Una venta confirmada interrumpe el siguiente registro

**Confirmado en la versión publicada; corrección ya preparada localmente.** El formulario productivo conserva estado exitoso y deshabilita los controles; falta una transición explícita a la siguiente operación. El propietario también confirmó necesitar registrar un precio mayor.

**Acción:** completar la publicación controlada del candidato existente: nueva operación con clave independiente, actualización del catálogo, retiro de Cliente/Notas y precio acordado separado del sugerido. No repetir esta implementación en otro componente. La migración preparada debe preceder al despliegue del formulario.

### A06 · Alta · La consulta no desemboca directamente en una venta

**Confirmado.** Las tarjetas de Consulta muestran datos y un acceso a Editar; no incorporan el producto a Nueva venta. Esa pantalla tiene su propia búsqueda.

**Impacto:** se consulta un producto y luego se repite su búsqueda para cobrarlo.

**Acción:** «Vender este producto» con identidad/SKU seleccionado, validando de nuevo disponibilidad y precio al confirmar. Añadir «Copiar precio y descripción breve» sólo con datos verificables; no enviar mensajes automáticamente. Mantener la consulta de sólo lectura separada de la confirmación de venta.

### A07 · Media-alta · Navegación con demasiadas opciones al mismo nivel

**Confirmado en estructura; impacto visual pendiente.** `components/admin/admin-nav.tsx` contiene once destinos y Cerrar sesión, distribuidos con flex-wrap. No indica ruta activa con `aria-current`. «Pedidos», «Pedidos web» y «Ventas» son flujos distintos, pero esa distinción depende de conocer el sistema.

**Acción:** organizar por tarea: Inicio, Vender/Consultar, Pedidos y entregas, Stock/Productos, Compras/Proveedores, Informes. Mantener Configuración y sesión como utilidades secundarias. Identificar claramente «Encargos» frente a «Pedidos de la web», conservando sus distintas reglas de reserva, pago y entrega.

### A08 · Media-alta · Inventario sirve de registro, pero no de bandeja de reposición

**Confirmado.** La ruta Inventario consulta movimientos; Productos dispone de filtros de stock. El servicio de movimientos limita el resultado a 200 registros sin paginación propia.

**Impacto:** hay que interpretar movimientos o recorrer productos para decidir qué reponer, y no debe confundirse lo mostrado con el historial completo.

**Acción:** mantener «Movimientos» para trazabilidad y ofrecer «Disponibilidad y reposición» con filtros de faltantes, producto, proveedor y categoría. Separar stock físico, reservado y vendible cuando los contratos lo permitan. Para combos, usar el motor existente. No inventar mínimos de compra o demanda; cualquier umbral por categoría debe acordarse con el propietario.

### A09 · Media · Los historiales de ventas y compras dificultan localizar un registro conocido

**Confirmado.** `HistoryFilters` ofrece origen, canal/pago/fecha según el caso; el contrato de listas no incluye búsqueda por producto, número de venta o proveedor. Compras no presenta un rango temporal en ese componente.

**Impacto:** para resolver «la venta de tal mate» o «la compra de tal proveedor» puede ser necesario paginar sin una búsqueda directa.

**Acción:** añadir búsqueda y accesos de fecha útiles, preservando paginación exacta y filtros en la URL. Ofrecer «Hoy», «Esta semana» y rango comercial, sin mezclar histórico y actual de forma silenciosa. Al volver de un detalle, conservar contexto y filtros.

### A10 · Media · Productos está diseñado como una serie de fichas extensas

**Confirmado en estructura; densidad visual pendiente.** Cada producto muestra identidad, slug, SKU, lista, transferencia, costo, margen, stock y múltiples acciones. El formulario completo reúne información comercial y contenido de publicación.

**Acción:** vista compacta para trabajar: foto, nombre, vendible, precio y estado; detalle ampliable para costo/margen/identificadores y acciones secundarias. Separar «Datos comerciales», «Fotos y publicación» y «Atributos», reutilizando el mismo guardado seguro. Incorporar una bandeja «Publicaciones incompletas» para fotos o datos faltantes. Conservar ajustes de inventario con motivo; no sustituirlos por una edición directa e informal del saldo.

### A11 · Media · Pedidos web mezcla tareas comerciales y supervisión técnica

**Confirmado.** `app/admin/checkout/page.tsx` coloca supervisión, ejecuciones, liberación de reservas, cotizaciones y pedidos en una misma página extensa.

**Impacto:** la información necesaria para cobrar o cotizar compite con operaciones excepcionales y detalles del ejecutor.

**Acción:** bandejas «Pagos para revisar», «Cotizaciones» y «Pedidos» con la siguiente acción en cada registro. Mover salud técnica e historial bajo un detalle secundario, manteniendo avisos críticos visibles. Conservar la verificación explícita de acreditación bancaria; un comprobante no confirma el pago. No acelerar eliminando esa guarda.

### A12 · Media · Informe mensual valioso, demasiado extenso para el control cotidiano

**Confirmado.** Analytics distingue ventas, pagos fechados, cobros sin fecha, costos verificables e históricos. Es una base que conviene reutilizar. Su servicio obtiene un snapshot completo para construir el informe y sus comparaciones.

**Acción:** conservar el mensual para análisis y colocar una síntesis diaria en Inicio. Resumir las aclaraciones con detalles desplegables y mostrar siempre las limitaciones que cambian una decisión. Medir tiempos antes de optimizar la lectura completa; no afirmar que es lenta sin medición. Un resumen por método debe llamarse «Cobros»; no «Caja disponible» ni «Ganancia neta» sin modelar gastos, devoluciones, retiros y saldos iniciales.

### A13 · Media · Ayudas de la tienda pública presentes en el administrador

**Confirmado.** El layout monta WhatsApp globalmente y el componente sólo se excluye del recorrido de carrito/checkout; no excluye `/admin`. El enlace es una consulta al WhatsApp de la propia tienda.

**Impacto:** aporta poco a quien está administrando y puede competir con controles, especialmente en pantallas pequeñas. La oclusión exacta necesita revisión visual.

**Acción:** ocultarlo en Admin o reemplazarlo por ayuda operativa contextual. No modificar por ello el botón de la tienda pública aprobado.

### A14 · Media · Prevención de pérdida de trabajo y revisión móvil

**Riesgo por implementación.** No se encontró un aviso general de cambios sin guardar en los formularios revisados. Compras tiene guardado explícito de borrador, una base útil. El detalle de una venta usa columnas fijas de 5rem, 8rem y 9rem, más espacios y padding, sin alternativa de tarjetas en celular; su contenedor oculta desbordes.

**Acción:** advertir al salir con cambios; mostrar guardado y recuperación claramente. No almacenar automáticamente datos sensibles en localStorage sin una política. En el detalle de venta, apilar las filas en móvil y verificar importes, costo y subtotal a 390 px. Completar la revisión visual y de teclado que quedó bloqueada en esta auditoría.

### A15 · Baja · Configuración ocupa un destino principal sin permitir configurar

**Confirmado.** `app/admin/configuracion/page.tsx` muestra datos de marca y un mensaje sobre edición futura. No es una herramienta de ajuste operativa actual.

**Acción:** moverla a «Datos de la tienda» o utilidades secundarias. No construir un editor de configuración por decorar el menú: implementarlo únicamente cuando haya una necesidad, campos permitidos y guardas definidos.

## Qué conservar y aprovechar

- Consulta rápida y recomendador existentes: mejor conectarlos con la venta que crear otro buscador.
- Ventas, pagos e inventario transaccionales e idempotentes.
- Historial de compras y ventas paginado, snapshots y registros históricos de sólo lectura.
- Envío prorrateado, creación de productos dentro de la compra y foco hacia la cantidad ya implementados.
- Separación entre borrador y confirmación de compra: protege el inventario y no debe eliminarse para reducir clics.
- Informe mensual con distinción entre venta, cobro y margen respaldado por costo verificable.
- Publicación con procesamiento de imágenes y guardas de guardado; no cargar nuevamente fotos para resolver un problema de navegación.

## Secuencia recomendada

1. **Fiabilidad y continuidad:** corregir fechas de inventario e indicador inicial; revisar coherencia de precio en consulta/venta; cerrar el candidato de Nueva venta ya preparado con su publicación autorizada por separado.
2. **Atención diaria:** Inicio con accesos y pendientes, Consulta → Venta, búsqueda directa en historiales, navegación por tarea y retiro de WhatsApp del admin.
3. **Reposición y catálogo:** disponibilidad/reposición, filtro de publicaciones incompletas y productos más compactos; conservar detalle/auditoría.
4. **Control del negocio:** resumen diario por método y lectura mensual; exportación de importes/fechas/SKU únicamente con alcance de datos definido. Datos sin respaldo deben mantenerse como desconocidos.

## Cómo comprobar que ahorra tiempo

Medir antes y después, con las mismas tareas y datos sintéticos o una operación cotidiana realizada por el propietario:

| Tarea | Indicador de mejora |
|---|---|
| Registrar dos ventas consecutivas | Sin recarga manual; claves independientes; sin duplicación |
| Consultar un producto y venderlo | Una sola búsqueda; mismo SKU e importe sugerido coherente |
| Encontrar un cobro o compra | Acceso directo por búsqueda/fecha; sin recorrer páginas a ciegas |
| Ver pendientes al abrir el admin | La siguiente acción se identifica desde Inicio |
| Encontrar un movimiento nocturno | Aparece dentro del día argentino correcto |
| Preparar reposición | Lista filtrada y trazable, sin inferir saldos desde movimientos |
| Cargar una compra | Mantiene líneas ante errores y deja claro cuándo se guarda/confirma |

No se modificó código de aplicación, no se autorizan estas mejoras y no se inició una nueva implementación durante esta auditoría. El candidato previo de ventas permanece separado y pendiente de publicación.
