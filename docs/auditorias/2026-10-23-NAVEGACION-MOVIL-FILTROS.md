# P07 / UX-N03 — Navegación móvil y filtros

23/10/2026. Implementación local en `codex/mobile-navigation-filters-20261023`, base publicada `acbcd47d38a83230b8a797e2c02f6cc9659f27b9`. Sin publicación ni modificaciones productivas.

## Cambios

- `SiteHeader`: categorías en una fila horizontal con scroll, enlaces completos y sección activa subrayada; búsqueda, ayuda y carrito conservados. Sin flechas pequeñas separadas en móvil. Navegación de notebook conservada.
- Perfumes/Mates: presentación compacta móvil; descripción extensa conservada después del listado. Primer artículo visible dentro del viewport. Sidebar de notebook y lógica server-side sin cambios.
- `MobileCatalogFilters`: cerrado inicialmente, apertura por Filtros; diálogo nativo de 58dvh, cuerpo con scroll y pie fijo con Aplicar/Limpiar. Borrador por grupo, categoría y opciones existentes; aplicar navega al mismo contrato URL. X/fondo/Escape descartan borrador; cierre restaura foco y overflow; al pasar a notebook se cierra. Tab/Shift+Tab permanecen en el panel.
- WhatsApp flotante oculto bajo 1024px; ayuda del encabezado y consultas contextuales conservadas. No se altera código del checkout ni sus validaciones.
- `mobile-filter-state.ts`: validación de opciones existentes para leer borrador y construir parámetros. Sin importes, stock o mutaciones.
- Fixtures sintéticos: reutilizan las vistas públicas simuladas, GET-only, clave sin privilegios, servidor en loopback y entorno explícito sin credenciales productivas. Nueva opción de build aislado.

## Evidencia

| Vista | Captura |
|---|---|
| Catálogo móvil | [390×844](assets/2026-10-23-navegacion-movil/01-catalogo-movil.jpg) |
| Panel de filtros | [Pie fijo y scroll](assets/2026-10-23-navegacion-movil/02-filtros-movil.jpg) |
| Sin resultados | [Estado vacío recuperable](assets/2026-10-23-navegacion-movil/03-vacio-movil.jpg) |
| Notebook | [Sidebar conservada](assets/2026-10-23-navegacion-movil/04-catalogo-notebook.jpg) |
| Termos | [Categoría sin filtros adicionales](assets/2026-10-23-navegacion-movil/05-termos-movil.jpg) |
| Accesorios | [Publicaciones existentes](assets/2026-10-23-navegacion-movil/06-accesorios-movil.jpg) |

Las capturas son de la aplicación real local con datos sintéticos. No confundir sus nombres, importes ni conteos con Production. El panel se midió en DOM: 489,5/844px ≈58%; el pie ocupa y=767–844 y el cuerpo termina en y=767. Primer artículo Perfumes: 455px en 390×844, 477px en 360×640, 427px en 430×932; en la línea base productiva documentada estaba en ~971px. No es una prueba A/B ni una medida de conversión: catálogo/fixture y contenido difieren. El encabezado compacto mide ~184px en 390px; conserva búsqueda y controles táctiles.

## Validación

- **17 pruebas automatizadas aprobadas, cero omisiones:** 8 nuevas de estado/URL y 9 de búsqueda pública existentes. Borrador no muta URL, combinación de grupos, limpieza manteniendo categoría, Todos, descarte de valores inválidos y categorías sin atributos. Búsqueda de todos los tipos, dos combos, agrupación familiar, exclusión no pública y ausencia de mutaciones.
- **17 comprobaciones en navegador aprobadas:** altura/pie/scroll, X y descarte, aplicar/resultados, Escape/foco/overflow, fondo, CTA fijo durante scroll, combinación/vacío, limpiar, 360/430px, cambio de categoría, Atrás, foco en ambos sentidos, cierre al pasar a notebook, sidebar inmediata, categorías sin atributos y Accesorios con ambas ofertas virtuales. [Resultados detallados](assets/2026-10-23-navegacion-movil/browser-results.json).
- Build Next.js 16.3.8 con webpack y TypeScript: aprobado, 23 páginas estáticas; fixture final registró 15 GET y **0 escrituras**. No se repitieron suites comerciales/SQL ajenas.
- ESLint focalizado: cero errores; advertencia previa `next/no-img-element` sobre el logo existente, conservado para no ampliar alcance.
- Diff sin cambios en Supabase, servicios, precios, inventario, recetas, compras, ventas, carrito o código de checkout. Verificación exacta de que la lógica anterior al render de Perfumes/Mates permanece igual.

## Problemas encontrados y corregidos

1. Tab desde el último botón podía salir del diálogo nativo: agregado ciclo de foco explícito con elementos visibles; prueba posterior aprobada en ambos sentidos.
2. Compilación inicial de desarrollo e hidratación requirieron esperar a que la página estuviera lista antes de verificar selectores; no se confunden timeouts de arranque con resultados aprobados.
3. Build inicial detenido por `EPERM` del sandbox al crear una carpeta `.next`: repetido con permiso para el comando local. No se modificaron ACL ni configuraciones.

## Límites

No hay certificación WCAG completa ni prueba en un teléfono físico/iOS/Instagram WebView. Se comprobó responsive y teclado en navegador integrado. La intención del mock se conserva con las tarjetas, logo, iconos y copy reales existentes; no se copian imágenes ni precios ilustrativos. Accesorios sigue sin filtros propios porque no los tenía. No se instalaron dependencias ni analítica; no se atribuye aumento de conversión.

Para probar localmente: `node tests/fixtures/mobile-navigation-preview.mjs` y abrir `http://127.0.0.1:3153/perfumes?categoria=arabe`. Para repetir build sin credenciales: mismo comando con `--build`. El entorno rechaza archivos `.env` y no se conecta a Production.

**Estado:** implementado y validado localmente, pendiente de revisión y autorización de publicación.
