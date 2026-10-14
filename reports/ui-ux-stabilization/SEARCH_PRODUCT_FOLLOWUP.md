# Correcciones P1 enfocadas: búsqueda y ficha

## Decisión comercial recibida

El usuario confirmó 25% de descuento en efectivo/transferencia sobre el precio de lista correspondiente: lista 100 debe mostrar 75. La decisión se comunicó a `LOCAL SFSTORE`. El agente principal del checkout es responsable de reconciliar precios almacenados, catálogo y PAY-01. No se cambian aquí esa lógica, los cálculos, los datos comerciales ni Supabase. Los patches de encabezado/configuración siguen disponibles para su worktree de integración. PR #8 continúa en draft, sin autorización de merge o despliegue. No se usa el Preview anterior para pruebas o escrituras.

## Problemas reproducidos y solución mínima

1. **Refinar una búsqueda:** `/buscar?buscar=Asad` mostraba el resultado, pero el campo editable estaba vacío. La prueba previa en localhost confirmó `editableSearchValue: ""`. Se pasa la consulta de la página al encabezado mediante una prop opcional y `defaultValue`; las demás páginas conservan el campo vacío. Otro caso reproducido: editar el texto sin enviarlo y pulsar Ver todos cambiaba la URL a `/buscar`, pero conservaba el texto editado. Se identifica el input por la consulta ejecutada para reiniciarlo al cambiar ese estado de navegación. Se verifican consulta inicial, edición a Khamrah, resultado vacío, recuperación por enlace y limpieza para volver al catálogo completo. No se cambia el algoritmo de búsqueda ni el backend.
2. **Feedback falso en la ficha:** con un carrito sintético persistido de una unidad y límite local de una unidad, la ficha de ejemplo permitía pulsar Agregar y anunciaba éxito aunque la cantidad seguía en uno. La prueba previa confirmó `storedQuantity: 1` y `visibleFeedback: "Producto agregado al carrito."`. La UI ahora refleja el límite ya utilizado por el store y sólo anuncia éxito cuando el `addItem` existente realmente aumenta la cantidad. No se refresca ni altera el stock del carrito, no se modifica el store y no se cambian reglas de inventario. La reconciliación de stock persistido con el backend sigue fuera de este alcance.

## Verificación acotada

`tests/ui-search-product.browser.mjs` ejecuta exclusivamente búsqueda y ficha en localhost con Supabase ficticio y almacenamiento local sintético, a 320 y 1440 px. Se bloquean solicitudes de navegador a otros servicios. No se recorre checkout ni se envían compras. Ver `search-product-results.json`.

Controles: preservación/edición de consulta, recuperación de resultado vacío, botón desactivado al límite persistido, confirmación de una adición real al carrito local, cantidades y persistencia tras recarga, ausencia de excepciones JS y desbordamiento horizontal. Se ejecutan tipos, lint del alcance, build y las pruebas de búsqueda pertinentes. No se repite una auditoría general ni se cambian reglas del linter para ocultar los errores heredados.

Archivos de aplicación: `app/buscar/page.tsx`, `components/site-header.tsx` y `app/producto/[slug]/product-actions.tsx`. El patch del encabezado se regenera para conservar la prop opcional además de los cambios UI y `prefetch={false}` del checkout. Ningún archivo de checkout, servicio, API, precio, inventario o Supabase se modifica.
