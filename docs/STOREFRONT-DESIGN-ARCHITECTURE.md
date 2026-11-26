# SFSTORE · Arquitectura visual de la tienda

**Candidato local · 19/11/2026.** Las fichas aprobadas con Next.js 16.4.6 son la referencia visual. La primera parte de la etapa 3 extiende la estética al encabezado público compartido.

## Reglas para futuras pantallas

1. Definir colores, acabados, sombras, escala de títulos y rutas de los recursos botánicos en [`app/storefront-theme.css`](../app/storefront-theme.css). Usar roles como `--boutique-action` y `--boutique-price`, aunque hoy ambos resuelvan al mismo oliva. Mantener los valores propios de «Sobre este producto» en sus tokens `--sf-perfume-*`.
2. Activar la estética con `data-storefront-theme="boutique"` en el contenedor público que se esté migrando. Para un lienzo cálido, usar el módulo [`storefront-surface.module.css`](../components/storefront-surface.module.css). Agregar su clase de follaje sólo si el diseño de esa superficie prevé ese espacio. El atributo del tema por sí solo no pide imágenes.
3. El componente dueño define el acabado y la interacción. `SiteHeader` activa los tokens en su barra y su navegación con `data-storefront-chrome`. Las tarjetas y las acciones de ficha leen los tokens del tema de su contenedor. Usar las escalas existentes de Geist, Tailwind y los módulos para layout, espaciado, radios y tamaños táctiles. Evitar redefinir estos valores en rutas o usar selectores basados en `aria-label`, destino de enlaces o posición de nodos.
4. Conservar foco visible, estados de error, falta de stock y confirmación. El estilo normal de compra se aplica sólo al botón habilitado. El verde de confirmación mantiene su tratamiento propio. El tema tampoco modifica márgenes de la galería, tamaño de fotografías, precio, SKU ni reglas de carrito.
5. Ampliar el tema por superficie con capturas antes/después, pruebas del flujo local y datos controlados. Mantener las ilustraciones olfativas en la biblioteca de perfume y pedir los recursos decorativos sólo desde el componente que los usa.

## Diagnóstico

| Zona | Reutilización existente | Deuda y destino |
| --- | --- | --- |
| Encabezado y navegación | `SiteHeader`, `CatalogSearchBox`, menús de escritorio y navegación móvil | El módulo del encabezado aplica los tokens a barra, navegación, sugerencias y paneles de categorías. Las rutas conservan su integración actual, incluida la consulta inicial de `/buscar` y el encabezado propio del checkout. |
| Home y catálogo | `HomeHeroSlider`, `HomeProductCarousel`, Ritual Matero, `ProductCard`, `ProductGrid`, `CatalogSidebar` y `MobileCatalogFilters` | Home, búsqueda, categorías y relacionados ya comparten la tarjeta. La ficha le pasa nueve variables de color/acabado y parte del foco queda en azul fijo. Absorber ese puente en la tarjeta y centralizar ancho, márgenes y escala de títulos del catálogo. Extraer el marco común de Perfumes y Mates con espacios para filtros y grilla; conservar sus parámetros, textos, orden y comportamiento. Mantener hero, Ritual y carruseles como composiciones de Home. |
| Fichas | `ProductDetailLayout`, `ProductDetailSummary`, `ProductImageGallery`, `ProductPricePanel`, `ProductAccordion`, `ProductSupportSections`, `AddToCartButton` | Las fichas simples y con variantes ya convergen en estas piezas. Mover los acabados de compra, contacto y soporte desde selectores globales de la ruta a sus componentes. Dejar en la ficha el orden y la distribución de bloques. «Sobre este producto» conserva su módulo, escala, composiciones, fuentes, acordes y estructura aprobada. |
| Carrito | `CartContent` en página y `CartDrawer`; `CartItemIdentity` en carrito y checkout | El CSS repite azules, superficies, radios y botones. Unificar los estilos por función, con variantes de densidad para panel y página; conservar foco, cierre, cantidad, SKU, stock y precio. |
| Checkout | `CartItemIdentity`, `CheckoutCaptcha`, componentes de comprobante y utilidades de precio compartidas | `app/checkout/page.tsx` repite clases de campos, tarjetas de elección, avisos y totales entre controles. Extraer presentación sólo cuando se repita. Mantener la pantalla de compra con su encabezado propio, las redirecciones heredadas y el acceso protegido al comprobante. El resumen de totales puede compartir filas y estilos con el carrito, conservando el distinto contexto de importes e información. |

## Tokens y límites

- **Base semántica.** Una hoja CSS para lienzo, superficies, texto, texto secundario, borde, acción principal, foco y estados. Los primeros valores salen de la ficha: lienzo `#fcf7ef`, superficie `#fffcf6`, oliva `#444f25`, títulos `#352416`, texto `#3e3125`, borde `#e2d6c6`. Mantener el tratamiento de éxito, error, aviso, selección y agotado con texto o icono además del color. Separar acción principal, enlaces y precios aunque compartan oliva hoy.
- **Medidas.** Compartir tipografía Geist donde ya se usa, escalas por papel, contenedores, espacios, radios, sombras, tamaño táctil y capas de flotantes. Los tamaños distintos por función siguen siendo distintos. La base y los aliases útiles para Tailwind pueden convivir con CSS Modules y con el comportamiento de tema del resto de la aplicación.
- **Alcance.** Activación explícita en las superficies públicas migradas, dejando administración fuera. Mantener el aspecto heredado en cada superficie hasta su etapa. El CSS del componente conserva interacción visual y variantes; la ruta dispone secciones. No usar atributos de accesibilidad, destinos de enlaces ni posición de nodos como ganchos de tema.
- **Duplicación a retirar.** Variables boutique dispersas, fallbacks celestes redundantes, colores literales repetidos, marcos de catálogo y clases repetidas de formularios. Consolidar por significado tras una comparación visual. El tono `#414b24` del desplegable y el `#444f25` de la acción exterior cumplen roles distintos y se conservan.

## Recursos botánicos

- `vegetacion-ficha.webp` (2.604 bytes) sirve como follaje de esquina de la ficha y `botanica.webp` (6.510 bytes) para «Sobre este producto». El encabezado usa `follaje-encabezado.webp` (29.862 bytes), con transparencia para conservar el fondo oliva entre las hojas. La ruta y la sombra se definen en el tema compartido. La decoración del encabezado no intercepta clics.
- La biblioteca actual contiene 81 WebP, 481.652 bytes en disco. Es un inventario de recursos, no el peso de una visita. Mantener la selección por notas documentadas y solicitar sólo las ilustraciones y composiciones visibles. Las fotos reales, el logo y las reglas de encuadre son recursos de producto/marca. Las decoraciones quedan fuera del árbol accesible, sin precarga global, y se verifica su impacto en red, LCP y CLS.

## Dependencias que guían la migración

- Tokens del tema → encabezado, botones, tarjetas, campos, superficies y foco → composiciones de ruta.
- Home, categorías, búsqueda y relacionados → `ProductCard` → acciones de compra, precios y reglas de encuadre ya compartidas.
- Ficha simple y de familia → galería, resumen y soporte → presentación comercial y SKU seleccionado. `ProductInformation` consume datos documentados; `PerfumeInformation` conserva su biblioteca y composición.
- `SiteHeader` → buscador y `CartDrawer` → `CartContent`. Carrito y checkout → `CartItemIdentity`, store y utilidades comerciales existentes. Checkout → sesión, envío, reserva, pedido y comprobante. La capa visual recibe estados y acciones existentes y carece de dependencias hacia API, Supabase o pagos.

## Orden de implementación

1. **Línea base.** Capturas con datos controlados de fichas aprobadas, encabezado, home, catálogo, carrito y checkout. Registrar fotos, orden, interacciones, foco, contraste y carga. Comparar a 320, 390, 768, 1024 y 1366 px; incluir justo antes y después de los cortes del encabezado y la grilla.
2. **Extracción sin cambio visual.** Incorporar tokens y pasarlos primero a ficha, tarjetas relacionadas y encabezado en su contexto actual. Retirar sus reglas cruzadas de a grupos pequeños sólo tras verificar equivalencia. Cubrir Éclaire, Iconic, Rome Pour Femme, mate simple y Stanley con variantes. Conservar carrusel, flechas, miniaturas, CTA y contenido aprobado.
3. **Descubrimiento.** Extender el tema en cambios separados a encabezado/navegación, home y catálogo/búsqueda. Validar búsqueda con consulta preservada, menú móvil y escritorio, teclado, foco, URLs/filtros, grillas y tarjetas con y sin stock. Diferir mover el encabezado de ruta a layout hasta verificar esos contratos; el tema compartido puede funcionar antes de esa decisión.
4. **Carrito.** Migrar panel y página juntos por `CartContent`. Comprobar cantidad, retiro de ítems, persistencia, SKU, totales, estado vacío, confirmación de agregado y foco al cerrar. Verificar disposición del flotante junto a WhatsApp y el aviso de consentimiento.
5. **Checkout y limpieza.** Migrar primero superficies y controles, luego filas de importes y avisos. Probar localmente retiro/envío, cotización, CAPTCHA, errores y reintento, límites de reserva, recepción de comprobantes y visibilidad de datos de transferencia sólo en el paso autorizado. Reutilizar `cart-variant-identity`, `checkout-clarity` y `checkout-submit-feedback-browser`. Ejecutar TypeScript, ESLint, pruebas afectadas y build. Retirar sólo las reglas que queden sin lectores y someter cada etapa a revisión visual local.

El diagnóstico inicial fue estático. Las etapas 1 y 2 usan capturas del candidato local con el mismo catálogo de prueba y comparaciones a nivel de píxel. La migración productiva, las dependencias, las reglas comerciales y el catálogo quedan fuera del alcance.
