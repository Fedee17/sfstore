# Cinco presentaciones comerciales de cargadores

Implementación local del 21/10/2026. No publicada. Base: `84651ee6179439c26fa9b88d8c12653bf202ed81`.

## Decisión de arquitectura verificada antes de modificar código

Se conserva una receta. `component_recipes.presentation_product` es único; `public_component_offers` ya devuelve una fila por `(recipe.id, connector)` y `resolve_commercial_lines` resuelve `(presentation_product, comboConnector)` a un cabezal y un cable. Crear otra receta no es necesario y podría duplicar la conversión o la configuración de la misma compra.

Se proyectan dos publicaciones virtuales desde las dos ofertas existentes. No se crean filas adicionales en `products`, recetas, balances de stock, reglas de precio o reservas. Las migraciones preparadas y los tres SQL privados de conversión conservan su contenido.

| Presentación | Lista | Efectivo/transferencia | Inventario |
|---|---:|---:|---|
| Cabezal iPhone | $22.000 | $16.500 | SKU físico existente |
| Cable USB-C a USB-C | $15.800 | $11.850 | SKU físico C/C |
| Cable USB-C a Lightning | $15.800 | $11.850 | SKU físico Lightning |
| Cargador completo USB-C a USB-C | $30.666,67 | $23.000 | Un cabezal + un cable C/C |
| Cargador completo USB-C a Lightning | $30.666,67 | $23.000 | Un cabezal + un cable Lightning |

Los nombres actuales de los SKU físicos se conservan desde el catálogo; no se renombraron datos productivos. Cada combo tiene tarjeta, nombre, URL y botón propios en catálogo/búsqueda. Las fotos no se adivinan: placeholder explícito hasta disponer de una fotografía verificada del conjunto/conector.

## Identidad y contratos

- ID de publicación: `combo:<presentation UUID>:<cc|lightning>`; se usa solo como identidad de lectura/UI y clave de tarjeta.
- URL: `/producto/combo-<presentation UUID>-<cc|lightning>`.
- La solicitud comercial sigue enviando únicamente el UUID de `presentation_product` y `comboConnector`; nunca se envía el ID virtual como UUID ni el precio calculado por el cliente.
- El carrito usa la misma clave `(UUID, connector)`, conserva la URL de la presentación y deduplica con entradas agregadas desde el selector anterior.
- La disponibilidad mostrada es `min(stock cabezal, stock cable elegido)`, una proyección sin contador persistido. Los dos conjuntos y los componentes individuales comparten la misma validación de demanda.
- Precios, costo, descuentos únicos, reservas y movimientos siguen resueltos por los contratos existentes. Débito/crédito/QR/otros mantienen lista completa en mostrador.
- Las URLs anteriores del cabezal y los carritos persistidos continúan siendo válidos. No se reescriben operaciones históricas.

## Lectura y autorización

El catálogo usa exclusivamente las vistas públicas existentes; hereda su filtrado de visibilidad, bloqueo comercial y aprobación de precios. Los detalles virtuales cargan los dos SKU en una consulta agrupada. La lectura de ofertas pagina por `(id, connector)`, incluso si PostgREST reduce el tamaño de página y ambas filas comparten receta. Un fallo de ofertas no inventa combos ni impide mostrar productos físicos. El mostrador conserva la sesión administrativa y canaliza las selecciones al `selectCombo` existente.

## Evidencia local y límites

Pruebas automatizadas focalizadas de publicaciones, catálogo, precios, carritos antiguos, formulario de mostrador y controles de demanda compartida. Revisión con Next.js completo, PostgreSQL 17.6 descartable, PostgREST y Auth local: cinco tarjetas, dos resultados de búsqueda, fichas separadas, ambos conectores en carrito/checkout y búsqueda de mostrador. Notebook 1366×900 y viewport móvil 390×844 sin desbordamiento observado. Capturas privadas bajo `staging/runtime/charger-release-private/five-presentations/`.

Se conservaron las correcciones previas de precio sin centavos partidos y selector móvil breve. No se confirmó ninguna venta/pedido durante la revisión visual. El perfil Chrome mantiene la advertencia de hidratación por el atributo `cz-shortcut-listen` inyectado por una extensión; no se suprimió ni se modificó el navegador.

Esta modificación de presentación no añade migraciones. La publicación completa sigue requiriendo las dos migraciones ya preparadas y la configuración/conversión autorizada por separado; ninguna se aplicó en Production. El catálogo conserva la clasificación existente: esta entrega no crea categorías ni recategoriza productos reales.


Validación final: 64 pruebas afectadas aprobadas (13 específicas de publicaciones y 51 regresiones), cero fallos ni omisiones; build Turbopack y TypeScript aprobados. El primer build en sandbox falló al crear la junction de xlsx; la misma compilación pasó con permisos de ejecución fuera del sandbox, sin modificar ACL ni configuración. ESLint sin errores, con dos advertencias preexistentes de imágenes. Gitleaks y revisión de diff antes del commit. No se repitieron las suites PostgreSQL de inventario sin cambios.
