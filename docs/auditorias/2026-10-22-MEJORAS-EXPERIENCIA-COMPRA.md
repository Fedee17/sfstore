# SFSTORE — Mejoras de experiencia de compra, fase 1

Fecha: 22/10/2026. **Implementación local, no publicada.** Rama `codex/charger-purchase-ux-20261022`, basada en el código productivo `5884b0edf8b584191822dd89023ffab470cb7f5a`.

Referencia: auditoría `2026-10-21-EXPERIENCIA-CLIENTE-CARGADORES.md`, conservada en el worktree de publicación anterior. No se modificaron sus archivos ni evidencias.

## Resultado y causa confirmada

Una lectura HTTPS GET con la clave pública existente confirmó que el cabezal y los dos cables pertenecen a la categoría real **Electrónica**, slug `electronica`. No estaban almacenados como Mates. `resolvePublicCatalogSection()` convertía cualquier categoría distinta de Perfumes en Mates; el filtro del servicio también trataba todos los productos no perfume como materos. Los combos heredaban ese resultado del cabezal.

Se corrigió el modelo de secciones, los filtros y sus consumidores: categorías materas explícitas → Mates y termos; Electrónica y categorías generales → Accesorios; Perfumes se conserva. No se clasifica por coincidencias del nombre, IDs particulares ni texto del botón. `categoryId`, `categoryName`, `categorySlug` y SKU originales se conservan. La lectura de slugs públicos vigentes confirmó que las categorías materas existentes están cubiertas: `mates`, `termos`, `bombillas`, `accesorios-materos`, `vasos-termicos`.

La sección `/accesorios` permite encontrar las cinco presentaciones. Está vinculada desde el menú, la portada, las fichas y el sitemap. Es dinámica: consulta el catálogo al recibir la petición, sin congelar stock o precios durante el build. La portada obtiene las publicaciones una sola vez, evitando consultas duplicadas por sección. Se conserva la paginación completa del servicio y la exclusión de históricos/ocultos/bloqueados que aplica la proyección pública existente. El guardado administrativo invalida también la nueva ruta.

## Fichas y compra

- En móvil: título, conector incluido, precio por transferencia, lista, disponibilidad y compra antes de la galería. Descripción completa y condiciones de retiro siguen disponibles en «Información del producto».
- En notebook: galería y decisión de compra en dos columnas; sin cambios de fotografía o de selección de SKU.
- Placeholder honesto más compacto cuando no hay foto. No se agregaron fotografías ni afirmaciones sobre potencia, protocolos o modelos compatibles.
- Botón de compra a **aprox. 712 px** desde el inicio en 390 × 844, frente a los **1.640 px** documentados en la auditoría. Altura 48 px. Sin desbordamiento horizontal en la comprobación de ancho 320 px. Son medidas de laboratorio, no resultados de conversión.
- Carrito: lista por unidad, transferencia por unidad, subtotal de lista, descuento y subtotal por transferencia con etiquetas explícitas. Controles de cantidad de 44 × 44 y nombres accesibles. «Seguir comprando» respeta la sección del último artículo, sin enviar siempre a perfumes o accesorios.
- Checkout: líneas por transferencia y total de retiro coherentes con el carrito. Envío sin tarifa conserva «Pendiente de cotización; no transfieras» y el botón deshabilitado. Las cotizaciones aprobadas mantienen el total del servidor. Se advierte que precio y disponibilidad se revisan al preparar el pedido.
- Se retiró el alias del carrito para evitar transferir antes de obtener el pedido. Las instrucciones y los controles del circuito de pago existente se conservan.
- Los banners rasterizados que anunciaban cuotas se reemplazan por presentación tipográfica accesible con el título de cada sección y el mensaje verificable «25% OFF por transferencia · pago completo». No se habilitan tarjetas ni otros medios.

## Precios e inventario preservados

| Presentación | Lista | Transferencia |
|---|---:|---:|
| Cabezal | $22.000 | $16.500 |
| Cada cable | $15.800 | $11.850 |
| Cada cargador completo | $30.666,67 | $23.000 |

Se reutiliza `getWebTransferPrice()` y su redondeo unitario, consistente con el contrato del servidor. Dos combos → $46.000; tres → $69.000. No se aplica nuevamente el 25% al subtotal descontado. Se conservan las identidades de ambos conectores, la serialización sin precios confiados al cliente y el inventario compartido. No se modificaron RPC, migraciones, reservas, pagos, permisos ni datos comerciales.

## Validación realizada

- **124/124 pruebas**, sin skips: taxonomía, servicio paginado con respuestas limitadas a una fila, publicaciones, selección de conector, carrito compartido, redondeo, render real de resúmenes y banner, productos simples/familias, búsquedas, autorización y límites HTTP, métodos no admitidos, cotización, mostrador e historial.
- Nuevas regresiones: electrónica no aparece en Mates, las cinco publicaciones quedan en Accesorios sin modificar su categoría de origen, etiquetas/importes del carrito y checkout, ausencia de anuncios de cuotas.
- Se actualizó únicamente el doble de dependencia de la prueba existente de checkout para importar la taxonomía compartida; sus controles de seguridad no se relajaron.
- `npm ci --ignore-scripts --no-audit --no-fund`, build definitivo y TypeScript: aprobados. Build confirma `/accesorios` dinámico.
- ESLint focalizado: cero errores, seis advertencias `no-img-element` en elementos existentes. `git diff --check`: aprobado.
- Navegador sobre Next local y PostgreSQL 17.6/PostgREST sintéticos, Auth local; ninguna credencial productiva en ese entorno. Se comprobaron ambos conectores, precios individuales y de combo, agregado de un combo de cada tipo, persistencia al navegar, total $46.000, bloqueo de envío sin cotizar, móvil 390 × 844 y notebook 1366 × 900. No se confirmó ningún pedido nuevo en esta tarea.
- El proxy visual privado no entregó interactividad; se comprobó el mismo servidor directamente por su puerto local 3141, donde el agregado respondió y el carrito conservó los conectores. No se cambió código comercial para sortear ese problema del auxiliar.
- Se cerraron la pestaña temporal y los recursos sintéticos creados por el auxiliar; viewport restaurado.

El primer build en sandbox falló por acceso denegado al crear la junction de `xlsx`; la ejecución local autorizada con permisos suficientes aprobó sin cambios de dependencias o configuración. No hubo cambios en Vercel.

## Capturas comparativas

«Antes» proviene de la auditoría de Production del 21/10; «después», del entorno sintético local del 22/10. Los nombres «PRUEBA» y UUID locales no representan cambios en productos reales. Las capturas no son una publicación ni una prueba con clientes reales.

| Pantalla | Antes | Después |
|---|---|---|
| Ficha móvil | [Captura](assets/2026-10-22-mejoras-compra/antes-ficha-movil.jpg) | [Captura](assets/2026-10-22-mejoras-compra/despues-ficha-movil.jpg) |
| Ficha notebook | [Captura](assets/2026-10-22-mejoras-compra/antes-ficha-notebook.jpg) | [Captura](assets/2026-10-22-mejoras-compra/despues-ficha-notebook.jpg) |
| Carrito móvil | [Captura](assets/2026-10-22-mejoras-compra/antes-carrito-movil.jpg) | [Captura](assets/2026-10-22-mejoras-compra/despues-carrito-movil.jpg) |
| Checkout notebook | [Captura](assets/2026-10-22-mejoras-compra/antes-checkout-notebook.jpg) | [Captura](assets/2026-10-22-mejoras-compra/despues-checkout-notebook.jpg) |
| Inicio notebook | [Captura](assets/2026-10-22-mejoras-compra/antes-inicio-notebook.jpg) | [Captura](assets/2026-10-22-mejoras-compra/despues-inicio-notebook.jpg) |

Adicionales: [Lightning móvil](assets/2026-10-22-mejoras-compra/despues-lightning-movil.jpg), [checkout móvil](assets/2026-10-22-mejoras-compra/despues-checkout-movil.jpg), [inicio móvil](assets/2026-10-22-mejoras-compra/despues-inicio-movil.jpg).

## Pendientes y límites

- Fotografías reales de las cinco presentaciones y especificaciones verificables de compatibilidad, si se quieren incorporar. Se conserva el aviso honesto mientras faltan; no se requiere otra decisión sobre precios.
- Carritos guardados antes de publicar pueden conservar la etiqueta antigua de categoría hasta renovar esos artículos. No se reescribe su contenido ni se pierden conectores; el servidor sigue verificando identidad, precio y stock.
- Validación visual en viewport, no dispositivo físico; no se midieron Core Web Vitals de campo, conversión ni accesibilidad completa. No se revisó nuevamente el administrador autenticado: su circuito no fue alterado.
- Antes de publicar se requiere autorización del candidato y control de builds de Vercel conforme al protocolo. No hacen falta migraciones ni reclasificar datos de Production para estas mejoras.

Componentes compartidos revisados: clasificador y tipos públicos, servicio de catálogo/familias/combos, header, portada, galería, ficha simple/familiar, carrito y checkout. El cambio del administrador se limita a invalidar la nueva ruta después de un guardado ya existente.
