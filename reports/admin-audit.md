# Auditoria integral del admin de SFSTORE

Fecha de auditoria: 2026-10-03  
Repositorio: `C:\dev\sfstore`  
Rama y commit auditados: `main` / `76ec28d330a01ef65acf54a235fa4231e81f226b`  
Alcance: codigo, historial Git, tests, runtime logs de Vercel y consultas read-only a Supabase/Storage.

## Resumen ejecutivo

El admin tiene buenas protecciones de acceso y una base transaccional solida en compras, inventario y descuento de stock por ventas. No se encontraron inconsistencias operativas actuales en stock, pagos, compras confirmadas ni movimientos. Sin embargo, hay siete riesgos altos en los flujos de escritura y en la interpretacion de datos historicos.

El problema visual reportado al cambiar el estado de un producto no fue una reversion de base de datos: Vercel registro dos POST exitosos y Supabase conserva `Torpedo Criollo Con Base` como `active`. La causa demostrable es un contrato de UI insuficiente: el formulario usa un `select` no controlado, la accion devuelve exito generico sin el estado persistido y luego depende de `router.refresh()`. Esto permite que el usuario perciba un valor viejo o no tenga confirmacion inequívoca y vuelva a enviar.

La deuda mas importante es analitica: el dashboard y analytics mezclan las 129 ventas historicas importadas con la operacion actual. En la consulta leida, el panel suma 132 ordenes por `$5.058.457,64`, mientras que las 3 ordenes operativas suman `$965.092,64`; ademas, la metrica de venta real operativa es `$125.492,64`. Como los historicos fueron insertados recientemente, tambien pueden contarse como ventas del mes por `created_at`.

En imagenes existe deuda previa concreta: 27 objetos iguales para `Al Haramain dubai night` (26 con fila en `product_images` y uno huerfano en Storage), ademas de duplicados de contenido en otros productos. No se modifico ni elimino ningun objeto durante esta auditoria.

### Conteo de hallazgos

| Severidad | Cantidad |
| --- | ---: |
| Critica | 0 |
| Alta | 7 |
| Media | 15 |
| Baja | 5 |
| Total | 27 |

## Top 10 priorizado

1. **AA-006, Alta:** dashboard y analytics mezclan historial, pendientes y operacion corriente.
2. **AA-005, Alta:** registrar pagos y completar stock de una venta local son operaciones separadas.
3. **AA-001, Alta:** guardar producto, atributos e imagenes no es atomico.
4. **AA-002, Alta:** la edicion manual de `cost` puede dejar una procedencia de compra falsa.
5. **AA-003, Alta:** compras permite seleccionar productos normales `draft` o `archived`.
6. **AA-004, Alta:** el alta rapida desde Compras crea un producto `active` con precio cero.
7. **AA-007, Alta:** el listado normal de Compras incluye 180 compras historicas.
8. **AA-008, Media:** el cambio de estado carece de reconciliacion read-after-write y feedback concluyente.
9. **AA-011, Media:** hay duplicados reales de imagenes en Storage y `product_images`.
10. **AA-012, Media:** borrar primero la fila y luego el objeto puede crear huerfanos en Storage.

## Inventario de rutas admin

Las rutas admin estan protegidas por `app/admin/layout.tsx` y, en las paginas revisadas, por `requireAdminSession()`. Las mutaciones usan `requireAdminActionSession()`. `/admin/login` es la excepcion intencional.

- `/admin`: dashboard.
- `/admin/analytics`: indicadores comerciales.
- `/admin/configuracion`: configuracion administrativa.
- `/admin/login`: autenticacion.
- `/admin/productos`, `/admin/productos/nuevo`, `/admin/productos/[id]/editar`, `/admin/productos/importar`.
- `/admin/inventario`.
- `/admin/ventas`, `/admin/ventas/nueva`, `/admin/ventas/[id]`.
- `/admin/pedidos`, `/admin/pedidos/nuevo`, `/admin/pedidos/[id]`, `/admin/pedidos/[id]/editar`.
- `/admin/compras`, `/admin/compras/nueva`, `/admin/compras/[id]`, `/admin/compras/[id]/editar`.
- `/admin/proveedores`, `/admin/proveedores/nuevo`, `/admin/proveedores/[id]`, `/admin/proveedores/[id]/editar`.
- `/admin/consulta`.

## Matriz de modulos y escrituras

| Modulo | Acciones principales | RPC/servicios | Tablas/Storage | Revalidacion y feedback | Autorizacion |
| --- | --- | --- | --- | --- | --- |
| Productos | crear, editar, atributos, imagenes, estado | acciones directas Supabase | `products`, `product_attributes`, `product_images`, bucket `product-images` | `useActionState`; refresh parcial; rutas publicas incompletas | `requireAdminActionSession()` |
| Importador | preview, confirmar, sync Sheets | servicios de importacion | `products`, atributos e imagenes segun flujo | estado pending y resultado visible | admin o secreto de integracion |
| Inventario | ajuste manual con motivo | `adjust_inventory_stock` | `products`, `inventory_movements` | feedback de accion; operacion atomica | service role tras guard admin |
| Compras | borrador, proveedor, confirmar/cancelar | `save_purchase_draft`, `cancel_purchase_draft`, `confirm_purchase` | `purchases`, `purchase_items`, `suppliers`, `products`, movimientos | varias acciones redirigen o lanzan error | guard admin + RPC service role |
| Ventas locales | crear, pagos, completar | `create_store_sale`, `record_order_payment`, `complete_store_sale`, `apply_sale_inventory` | `orders`, items, pagos, products, movimientos | pasos separados; riesgo de estado parcial | guard admin + RPC service role |
| Pedidos | crear, transicionar, pagar, entregar | `save_customer_order`, `transition_customer_order`, `deliver_order` | ordenes, items, pagos, movimientos | navegacion server-side | guard admin + RPC service role |
| Proveedores | alta, edicion, activacion | servicio central | `suppliers` | redirect/revalidate | guard admin |
| Consulta | busqueda y recomendacion | motor de recomendacion y catalogo rapido | lectura de products/categories/attributes/images | Server Components y GET | sesion admin |
| Dashboard/analytics | lectura y agregacion | `services/admin.ts` | ordenes, items, pagos, productos | render server-side | sesion admin |

### Matriz ruta por ruta

| Ruta | Modulo | Accion principal | Server Action / RPC | Datos | Navegacion, loading y permisos |
| --- | --- | --- | --- | --- | --- |
| `/admin` | Dashboard | ver resumen | lecturas de `services/admin.ts` | orders, products, payments | Server Component; sesion admin |
| `/admin/analytics` | Analytics | ver indicadores | lecturas agregadas | orders, items, payments | Server Component; sesion admin |
| `/admin/configuracion` | Configuracion | ver configuracion | sin mutacion critica detectada | configuracion local | Server Component; sesion admin |
| `/admin/login` | Auth | iniciar sesion | Auth Supabase | auth.users/session | formulario publico intencional |
| `/admin/productos` | Productos | listar/buscar | lectura admin | products, categories, images | Server Component; sesion admin |
| `/admin/productos/nuevo` | Productos | crear | accion de producto | products, attributes, images, Storage | `useActionState`; pending local; guard de accion |
| `/admin/productos/[id]/editar` | Productos | editar/estado | accion de producto e imagenes | products, attributes, images, Storage | `useActionState` + `router.refresh`; guard de accion |
| `/admin/productos/importar` | Importador | preview/confirmar | Server Actions de importacion | products y atributos permitidos | `useActionState`; feedback visible; sesion admin |
| `/admin/inventario` | Inventario | buscar/ajustar | `adjust_inventory_stock` | products, inventory_movements | pending de formulario; revalidacion; sesion admin |
| `/admin/ventas` | Ventas | listar | servicios de ventas | orders, items, payments | Server Component; sesion admin |
| `/admin/ventas/nueva` | Ventas | crear/cobrar | RPCs de venta, pago y stock | orders, items, payments, products, movements | accion server; pasos separados; doble submit bloqueado en UI |
| `/admin/ventas/[id]` | Ventas | ver detalle | lectura venta | orders, items, payments | Server Component; sesion admin |
| `/admin/pedidos` | Pedidos | listar/buscar | servicios de pedidos | orders, items, payments | Server Component; limite 200; sesion admin |
| `/admin/pedidos/nuevo` | Pedidos | crear | `save_customer_order` | orders, items | formulario server/client; guard de accion |
| `/admin/pedidos/[id]` | Pedidos | detalle/estado/pago | transition/payment/deliver RPCs | orders, items, payments, products, movements | navegacion server-side; sesion admin |
| `/admin/pedidos/[id]/editar` | Pedidos | editar | `save_customer_order` | orders, items | submit y redirect; guard de accion |
| `/admin/compras` | Compras | listar | `listPurchases` | purchases, suppliers | Server Component; actualmente mezcla historia |
| `/admin/compras/nueva` | Compras | crear borrador/producto inline | `save_purchase_draft` y servicios | purchases, items, products, suppliers | varias acciones throw/redirect; sesion admin |
| `/admin/compras/[id]` | Compras | detalle/confirmar/cancelar | `confirm_purchase`, `cancel_purchase_draft` | purchases, items, products, movements | redirect/revalidate; guard de accion |
| `/admin/compras/[id]/editar` | Compras | editar borrador | `save_purchase_draft` | purchases, items | redirect; guard de accion |
| `/admin/proveedores` | Proveedores | listar | servicios supplier | suppliers | Server Component; sesion admin |
| `/admin/proveedores/nuevo` | Proveedores | crear | accion supplier | suppliers | submit+redirect; guard de accion |
| `/admin/proveedores/[id]` | Proveedores | detalle/activar | accion supplier | suppliers, purchases | Server Component + accion; guard admin |
| `/admin/proveedores/[id]/editar` | Proveedores | editar | accion supplier | suppliers | submit+redirect; guard admin |
| `/admin/consulta` | Consulta | buscar/recomendar | query de catalogo + motor | products, categories, attributes, images | GET/Server Components; navegacion con feedback; sesion admin |

### Formularios y patrones de estado

| Flujo | Patron | Riesgo observado |
| --- | --- | --- |
| Crear/editar producto | `useActionState`, estado local de imagenes, `router.refresh()` | estado persistido no vuelve en la respuesta; select de status no controlado |
| Upload de producto | estado local `uploading/submitting`, promesas por lote y compensacion | flujo actual libera pending y deduplica lote nuevo; deuda previa de Storage permanece |
| Importador | `useActionState`, mensaje junto al boton, doble submit bloqueado | comportamiento actual claro; tests cubren success/error |
| Ajuste de inventario | form action/pending + RPC | operacion atomica; falta paginacion y rango horario local correcto |
| Venta nueva | estado cliente + Server Action con varias RPC secuenciales | la UI bloquea doble submit, pero backend puede quedar parcial entre pagos y stock |
| Pedido nuevo/edicion | submit server y navegacion | reglas de stock correctas; feedback depende de navegacion |
| Compra nueva/edicion | acciones server con redirect o excepcion | algunos errores no vuelven como estado inline y pueden perder contexto del formulario |
| Proveedor nuevo/edicion | submit server + redirect/revalidate | patron simple; no se detecto pending infinito |
| Consulta/recomendador | formularios GET y navegacion server-side | el feedback agregado mejora percepcion; cada consulta sigue siendo render server-side |

No se encontro un pending infinito reproducible en el HEAD auditado. Los riesgos actuales son principalmente falta de confirmacion read-after-write, errores que salen por boundary/redirect y operaciones backend parciales aunque el boton cliente evite doble click.

## Modulos mas riesgosos

1. **Ventas locales y pagos:** una operacion comercial puede quedar pagada sin completar inventario.
2. **Productos e imagenes:** una sola accion coordina varias escrituras no atomicas entre DB y Storage.
3. **Dashboard/analytics:** hoy presenta importacion historica como actividad corriente.
4. **Compras:** mezcla historia, permite productos inactivos y el alta inline publica precio cero.
5. **Catalogo/categorias:** la visibilidad inmediata esta en correccion, pero la taxonomia sigue reducida a dos secciones.

## Quick wins

- Excluir `historical_import` en dashboard, analytics y listado normal de Compras.
- Devolver `status`/`updated_at` persistidos y controlar el select de estado.
- Exigir `status = active` al seleccionar y confirmar productos de compras.
- Crear productos inline como `draft`.
- Completar revalidacion de `/`, `/sitemap.xml`, slug anterior y slug nuevo.
- Bloquear asignacion de categorias inactivas y activacion con precio cero.
- Convertir filtros diarios desde `America/Buenos_Aires` a UTC.
- Agregar logs estructurados a mutaciones sin exponer datos sensibles.

## UX funcional y responsive

La revision de componentes no encontro modales globales ni bloqueos de scroll sistematicos. Los formularios largos de producto, compra y venta dependen de layout responsivo y pueden exigir desplazamiento considerable en movil, pero no se demostro un control inaccesible fuera del viewport. Los problemas funcionales verificables son: confirmacion debil del estado de producto, errores no uniformes, listados truncados sin paginacion y ausencia de explicacion cuando una opcion queda deshabilitada.

## Mapa de cobertura

| Prioridad | Flujos con cobertura relevante | Gaps principales |
| --- | --- | --- |
| Alta | RPCs de inventario, compras, pagos, venta y protecciones historicas; upload/idempotencia por pruebas focalizadas | Server Actions reales, rollback producto/atributos/Storage, status end-to-end, paid-without-stock recovery |
| Media | pedidos, proveedores, atributos, importadores, recomendador | concurrencia de imagen principal/reorder, filtros historicos de vistas, zona horaria, paginacion |
| Baja | helpers de presentacion y estados visibles seleccionados | responsive con navegador real, accesibilidad y mensajes de error uniformes |

La suite da una buena red de regresion de contratos, pero una parte importante son pruebas estructurales de fuente/migrations. Para los riesgos altos hacen falta tests de integracion con fallos deliberados entre etapas.

## Hallazgos detallados

### AA-001 - Guardado de producto no atomico

**Severidad:** Alta. **Tipo:** integridad de datos.

`app/admin/productos/actions.ts` guarda primero `products` (aprox. lineas 566-640), luego elimina/reinserta atributos simples (190-235), atributos administrados (287-310) y finalmente procesa imagenes. Un fallo posterior puede dejar el producto o sus atributos parcialmente actualizados aunque la accion termine en error.

**Reproduccion segura:** provocar en test un fallo en atributos o Storage despues de un update valido y comprobar que la fila principal ya cambio.

**Impacto:** producto parcialmente guardado, perdida de atributos previos o divergencia entre producto e imagenes.

**Recomendacion:** encapsular producto y atributos en una RPC transaccional; manejar el upload como fase compensable con un manifiesto del lote nuevo. Riesgo del fix: medio-alto por el alcance del flujo.

### AA-002 - `cost` manual puede conservar una procedencia incorrecta

**Severidad:** Alta. **Tipo:** integridad comercial.

El formulario incluye `cost` y el update lo persiste en `app/admin/productos/actions.ts` (lectura cerca de linea 132; escritura cerca de 617), pero no limpia ni actualiza `cost_source_purchase_item_id`.

**Impacto:** el costo visible puede dejar de corresponder a la compra referenciada, degradando auditoria y margen.

**Recomendacion:** hacer `cost` de solo lectura en la edicion normal o crear una accion explicita que cambie costo y procedencia con motivo. Riesgo: medio.

### AA-003 - Compras acepta productos inactivos

**Severidad:** Alta. **Tipo:** regla de negocio.

`services/purchases.ts:listPurchaseProducts()` filtra `historical_identity = false`, pero no `status = active` (aprox. 85-92). El guardado y `confirm_purchase` validan existencia/no historico, no estado.

**Impacto:** un producto `draft` o `archived` puede recibir costo y stock nuevos mediante una compra normal.

**Recomendacion:** filtrar selector y validar nuevamente en RPC al confirmar. Riesgo: bajo-medio.

### AA-004 - Alta rapida de compra publica precio cero

**Severidad:** Alta. **Tipo:** regla de negocio/publicacion.

`services/purchases.ts` crea el producto inline como `active`, con `price = 0` y descripcion corta vacia (aprox. 196-205).

**Impacto:** el producto puede aparecer en catalogo activo sin precio comercial util.

**Recomendacion:** crearlo como `draft`, exigir precio antes de activar y reforzar la validacion server-side de productos activos. Riesgo: bajo.

### AA-005 - Pago y descuento de stock de venta local no son atomicos

**Severidad:** Alta. **Tipo:** consistencia transaccional.

`app/admin/ventas/actions.ts` registra pagos y luego llama por separado a `completeStoreSale`. `services/store-sales.ts` reconoce el caso en que el pago queda aplicado pero falla el descuento por stock insuficiente (aprox. 173-187).

**Impacto:** venta pagada sin movimiento de inventario, con recuperacion manual posterior. Produccion no presenta hoy ningun caso inconsistente.

**Recomendacion:** una RPC unica para ultimo pago + completado, o un estado explicito `paid_inventory_pending` con recuperador idempotente. Riesgo: alto.

### AA-006 - Dashboard y analytics mezclan historial y operacion

**Severidad:** Alta. **Tipo:** exactitud analitica.

`services/admin.ts:getAdminOrders()` (aprox. linea 196) no excluye `historical_import`; el dashboard suma todas las ordenes (aprox. 407-424) y analytics usa `created_at` de la importacion (desde aprox. 467).

**Evidencia de Production:** 132 ordenes por `$5.058.457,64`; 129 historicas por `$4.093.365,00`; 3 operativas por `$965.092,64`. La venta real operativa calculada fue `$125.492,64`.

**Impacto:** ventas del mes, facturacion, tendencias y decisiones comerciales incorrectas.

**Recomendacion:** separar vistas operacional e historica; usar `historical_occurred_on` para historia y excluir pendientes de metricas cobradas. Riesgo: medio.

### AA-007 - Compras historicas mezcladas en el flujo normal

**Severidad:** Alta. **Tipo:** funcional/UX.

`services/purchases.ts:listPurchases()` (aprox. 227-248) no filtra `historical_import = false`.

**Evidencia:** 182 compras totales, 180 historicas y 2 operativas.

**Impacto:** el trabajo cotidiano queda enterrado entre registros historicos y se presta a interpretaciones erróneas.

**Recomendacion:** excluir historia por defecto y ofrecer una vista/filtro historico separado. Riesgo: bajo.

### AA-008 - Cambio de estado sin confirmacion del valor persistido

**Severidad:** Media. **Tipo:** estado obsoleto/UX.

`components/admin/products/product-form.tsx` usa `useActionState` y luego `router.refresh()` (aprox. 373 y 405-423), pero el selector de estado usa `defaultValue` (aprox. 550-551). La accion actualiza sin `.select()` y devuelve un mensaje generico (accion cerca de 617 y respuesta cerca de 645).

**Evidencia:** Vercel registro dos POST 200, separados por unos 10 segundos, al editar `Torpedo Criollo Con Base`; Supabase conserva `status = active`. No existe trigger que lo revierta.

**Impacto:** el usuario no sabe con certeza que valor quedo guardado y puede reenviar.

**Recomendacion:** controlar el estado del formulario, hacer update con `.select("id,status,updated_at").single()`, devolver el valor persistido y reconciliarlo antes del refresh. Riesgo: bajo.

### AA-009 - Una venta invalida puede quedar creada antes de validar sobrepago

**Severidad:** Media. **Tipo:** orden de validacion.

La accion crea la venta y luego valida que la suma de pagos no exceda el total.

**Impacto:** un submit rechazado puede dejar una venta persistida sin pago.

**Recomendacion:** validar importes antes de crear o mover creacion y pagos a una sola RPC. Riesgo: medio.

### AA-010 - Pagos multiples se procesan secuencialmente

**Severidad:** Media. **Tipo:** consistencia transaccional.

La accion itera pagos; un fallo tardio deja pagos anteriores confirmados. Las referencias ayudan a reintentar sin duplicar, pero el submit no es atomico.

**Recomendacion:** RPC por lote o respuesta parcial explicita con recuperacion idempotente. Riesgo: medio.

### AA-011 - Duplicados de imagenes en Production

**Severidad:** Media. **Tipo:** calidad de datos/Storage.

`Al Haramain dubai night` tiene 27 objetos con el mismo tamaño/eTag: 26 filas DB y un objeto huerfano. `Rasasi Hawas For Him` y `Lattafa Yara Tous` tambien tienen pares iguales con filas DB.

**Impacto:** costo de Storage, galeria repetida, ordenes ambiguos y mayor riesgo al borrar.

**Recomendacion:** reporte con hash, eleccion humana de canónico y limpieza exacta DB+Storage con snapshot previo. Riesgo: medio.

### AA-012 - Orden de borrado puede dejar objeto huerfano

**Severidad:** Media. **Tipo:** consistencia DB/Storage.

`deleteProductImage` elimina la fila en DB antes del objeto. Si Storage falla, solo registra warning. Existe un huerfano real:

`products/66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227660446-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp`

**Recomendacion:** borrar objeto primero y fila despues, o registrar una tarea de cleanup durable. Riesgo: medio.

### AA-013 - Cambio de imagen principal no atomico

**Severidad:** Media. **Tipo:** concurrencia.

Se desmarca la principal y luego se marca la elegida en dos queries (`app/admin/productos/actions.ts`, aprox. 795-817). Un fallo intermedio deja cero principales.

**Recomendacion:** RPC transaccional con lock por producto. Riesgo: bajo-medio.

### AA-014 - Reordenamiento de imagenes no atomico

**Severidad:** Media. **Tipo:** concurrencia.

El movimiento usa tres updates y compensacion best-effort (aprox. 861-900). Con fallos o concurrencia puede repetir `sort_order`.

**Recomendacion:** RPC que reciba el orden completo y lo aplique transaccionalmente. Riesgo: medio.

### AA-015 - Revalidacion incompleta del catalogo

**Severidad:** Media. **Tipo:** cache/estado obsoleto.

`revalidateProductPaths` revalida admin, consulta, `/perfumes`, `/mates` y el slug nuevo, pero no `/`, `/sitemap.xml` ni el slug anterior cuando cambia.

**Impacto:** home, sitemap o URL vieja pueden quedar desactualizados despues de una edicion exitosa.

**Recomendacion:** centralizar tags/rutas y pasar slug anterior+nuevo; revalidar home y sitemap. Riesgo: bajo.

### AA-016 - Filtros de fecha usan UTC para un negocio en Argentina

**Severidad:** Media. **Tipo:** exactitud temporal.

Ventas, pedidos e inventario construyen dias como `T00:00:00Z` a `T23:59:59Z` (`services/store-sales.ts`, `services/customer-orders.ts`, `services/inventory.ts`).

**Impacto:** operaciones nocturnas pueden aparecer en el dia anterior/siguiente respecto de Buenos Aires.

**Recomendacion:** convertir limites de `America/Buenos_Aires` a UTC en servidor y testear cambios de dia. Riesgo: bajo.

### AA-017 - Limites duros sin paginacion

**Severidad:** Media. **Tipo:** escalabilidad/UX.

Ventas limita a 100, pedidos a 200 e inventario a 200. La busqueda de pedidos ocurre en memoria despues del limite.

**Impacto:** registros antiguos desaparecen y una busqueda valida puede devolver cero.

**Recomendacion:** paginacion server-side y filtros en SQL antes de `range`. Riesgo: medio.

### AA-018 - Acciones sin feedback inline consistente

**Severidad:** Media. **Tipo:** UX/error handling.

Guardar/cancelar compras y varias acciones de imagen lanzan errores y redirigen; no todas conservan input ni muestran resultado especifico.

**Recomendacion:** estandarizar `ActionState`, pending, error recuperable y success para todas las mutaciones admin. Riesgo: bajo-medio.

### AA-019 - Taxonomia publica cerrada en dos secciones

**Severidad:** Media. **Tipo:** arquitectura de catalogo.

El WIP local en `lib/catalog/public-product-visibility.ts` y `types/product.ts` modela solo `perfumes | mates`; todo producto activo no perfume cae semanticamente en `mates`. Esto corrige el 404 inmediato de categorias nuevas, pero no representa Electronica, Regalos, Vasos Termicos o Accesorios Materos como secciones propias.

**Recomendacion:** resolver secciones desde categorias activas y una propiedad/configuracion explicita, sin allowlist rigida. Riesgo: medio-alto.

### AA-020 - El editor permite categoria inactiva

**Severidad:** Media. **Tipo:** validacion.

El formulario lista todas las categorias y la accion solo verifica que el id exista, no `is_active`.

**Impacto:** un producto activo puede quedar en una categoria inactiva y desaparecer publicamente.

**Recomendacion:** deshabilitar/informar categorias inactivas y bloquear nuevas asignaciones server-side. Riesgo: bajo.

### AA-021 - Relaciones monetarias no validadas en editor

**Severidad:** Media. **Tipo:** calidad comercial.

La accion valida montos no negativos, pero no exige `transfer_price < price`, `compare_at_price >= price` ni precio positivo al activar.

**Evidencia:** el draft `Bombillon alpaca y bronce recto` tiene `price = 41.298,70`, `transfer_price = 4`, `cost = 15.900`.

**Recomendacion:** reglas server-side dependientes del estado y warnings de margen. Riesgo: bajo-medio.

### AA-022 - La aplicacion crea infraestructura de Storage en runtime

**Severidad:** Baja. **Tipo:** operacion/seguridad.

`ensureProductImagesBucket` puede crear el bucket publico durante un guardado de producto.

**Recomendacion:** versionar/provisionar infraestructura fuera del request y dejar runtime solo para verificar. Riesgo: bajo.

### AA-023 - Busqueda de nombre en compra interpreta comodines

**Severidad:** Baja. **Tipo:** validacion.

La busqueda usa `ilike(name, input).limit(1)`; `%` y `_` actuan como comodines y, ante nombres repetidos, se toma el primero.

**Recomendacion:** igualdad sobre nombre normalizado o escape de patrones, y exigir seleccion por id. Riesgo: bajo.

### AA-024 - Observabilidad insuficiente en mutaciones

**Severidad:** Baja. **Tipo:** operabilidad.

Los logs recientes muestran POST 200, pero no accion, entidad, resultado persistido ni error normalizado. Esto impidio reconstruir el primer y segundo cambio de estado mas alla del HTTP.

**Recomendacion:** logs estructurados sin secretos con action, entity id, actor id, request/submission id, outcome y duracion. Riesgo: bajo.

### AA-025 - Cobertura critica mayormente estructural

**Severidad:** Baja. **Tipo:** testing.

Los 451 tests pasan, pero varios verifican codigo/migrations por expresiones regulares. Faltan integraciones de Server Actions, fallos intermedios y consistencia DB+Storage.

**Recomendacion:** agregar tests de estado de producto, rollback de atributos/imagenes, filtros historicos, compra inactiva, pago sin stock, cache, zona horaria y paginacion. Riesgo: bajo.

### AA-026 - Identidad activa duplicada de Yara Rosa

**Severidad:** Media. **Tipo:** integridad de catalogo.

Hay dos productos activos `Lattafa Yara Rosa`:

- `05b34469-3eb8-4148-8e97-9a19f1c2df6e`, slug `perfume-yara-rosa`.
- `f1cb2323-...`, slug `lattafa-yara-rosa`.

**Impacto:** stock, ventas, compras, recomendaciones y analytics pueden fragmentarse entre identidades.

**Recomendacion:** auditoria humana de referencias y plan de consolidacion; no borrar ni fusionar automaticamente. Riesgo: alto.

### AA-027 - Alto alcance de service role en la capa admin

**Severidad:** Baja. **Tipo:** seguridad/defensa en profundidad.

El acceso esta correctamente cerrado por `ADMIN_ALLOWED_EMAILS` y guards, pero muchas escrituras ordinarias usan service role y eluden RLS. Las identidades historicas si tienen protecciones fuertes de DB; productos/atributos/imagenes dependen mas de que toda accion recuerde aplicar el guard.

**Recomendacion:** mantener la clave solo server-side, testear automaticamente cada accion exportada y migrar mutaciones compuestas a RPCs transaccionales con permisos minimos. Riesgo: medio.

## Comprobaciones de Production

### Integridad sin anomalías encontradas

- 179 productos, 9 categorias y 76 filas de imagen.
- 0 productos activos operativos con precio nulo, cero o invalido.
- 0 productos normales con `price IS NULL`.
- 0 stocks negativos.
- 0 productos con mas de una imagen marcada principal.
- 0 productos con imagenes pero sin principal.
- 0 filas `product_images` cuyo producto u objeto falte.
- 0 URLs exactamente repetidas.
- 0 movimientos de inventario huerfanos.
- 0 sobrepagos.
- 0 ordenes pagadas/aprobadas con pagos aprobados insuficientes.
- 0 inconsistencias entre `payment_status` y pagos aprobados.
- 0 ventas operativas completadas/pagadas sin movimiento de venta.
- 0 movimientos `sale` duplicados por `order_item_id`.
- 0 compras operativas confirmadas sin movimiento `purchase`.
- 0 movimientos `purchase` duplicados por `purchase_item_id`.
- 0 violaciones de constraints de identidades historicas.

### Protecciones confirmadas

- `ADMIN_ALLOWED_EMAILS` opera fail-closed.
- Paginas y acciones admin revisadas exigen sesion autorizada.
- Ajuste de inventario usa RPC atomica, exige motivo y `no_change` no crea movimiento.
- Venta descuenta stock mediante RPC atomica e idempotente por item.
- Confirmacion de compra es atomica e idempotente por item.
- Entrega de pedido exige `ready` + `paid` y es idempotente.
- Selectores de venta/pedido excluyen historicos y productos no activos.
- `/admin/consulta` no expone `cost`.
- Upload valida tipo, firma y tamaño; HEIC se normaliza en cliente; el lote nuevo usa hash para evitar reintentos duplicados.
- Productos historicos permanecen aislados de catalogo y operaciones normales.

## Plan de remediacion por fases

### Fase 1 - Exactitud visible y bloqueos simples

1. Excluir `historical_import` del dashboard, analytics y Compras normales.
2. Corregir el contrato de estado del editor de productos.
3. Filtrar y validar `status = active` en compras.
4. Crear productos inline como `draft`.
5. Reforzar reglas monetarias y categorias activas.
6. Completar revalidacion de home, sitemap y slugs anterior/nuevo.
7. Corregir rangos diarios a `America/Buenos_Aires`.

### Fase 2 - Atomicidad

1. RPC transaccional para producto + atributos.
2. RPCs para principal y orden de imagenes.
3. Rediseñar venta local para pago/completado recuperable o atomico.
4. Validar pagos antes de crear la venta y registrar lotes en una operacion.

### Fase 3 - Limpieza controlada

1. Snapshot de `product_images` y objetos Storage.
2. Limpiar unicamente duplicados confirmados por hash y referencias.
3. Eliminar el objeto huerfano confirmado.
4. Resolver humanamente la identidad duplicada de Yara Rosa.

### Fase 4 - Escala y mantenibilidad

1. Paginacion y filtros SQL.
2. Taxonomia publica dinamica por categoria.
3. Logs estructurados y correlacion de acciones.
4. Tests de integracion para Server Actions, RPCs y DB/Storage.

## Validaciones ejecutadas

- Suite: **451 tests aprobados**, 0 fallidos, 0 omitidos.
- Warnings de Node: `MODULE_TYPELESS_PACKAGE_JSON` al importar TypeScript; deuda tecnica menor, no fallo funcional.
- Runtime Vercel del deployment `dpl_FWqpTicdVkfnMaSCT1n9Hf7Jz9X6`: no se encontraron `error`, `warning`, `fatal` ni respuestas 5xx en la ventana consultada.
- Todas las consultas a Supabase y Storage fueron read-only.
- No se modificaron codigo, configuracion, datos ni infraestructura durante la auditoria.

