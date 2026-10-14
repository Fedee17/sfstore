# SFSTORE — estabilización de UI/UX

Fecha: 13 de octubre de 2026. Rama: `codex/ui-ux-stabilization`.
Worktree independiente: `C:/dev/sfstore/.worktrees/ui-ux-stabilization`.
Base: `main`, commit `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`.

## Contexto y límites

Next.js 16.2.7 App Router, React 19.2.4, TypeScript, Tailwind CSS 4 y Zustand con persistencia local. Las páginas públicas consultan `services/products.ts`; el carrito usa `store/cart-store.ts`. Se conservaron colores, estructura y componentes de la marca. Se leyeron AGENTS.md y las guías instaladas de navegación, CSS, imágenes y searchParams de Next.js antes de implementar.

Se revisaron las ramas y las PR #1–#7 sin modificarlas. GitHub registra un despliegue Production exitoso del commit base el 9 de octubre de 2026. Esto verifica la revisión publicada, no la disponibilidad actual ni el funcionamiento integral de Production. La PR #2 agrega el checkout PAY-01 por transferencia y cambios de permisos/Storage; las PR posteriores de seguridad y CAPTCHA siguen separadas. No se integraron esas ramas.

El encabezado también figura en la PR #2. El usuario autorizó expresamente corregir únicamente su búsqueda, navegación y responsive en este worktree. El carrito, las pantallas del checkout, `app/layout.tsx`, `app/producto/[slug]/page.tsx`, los formularios administrativos compartidos y el backend se conservaron intactos. No hubo cambios de Supabase, SQL, APIs, precios comerciales, cálculo de descuentos, inventario, creación de pedidos ni pagos. No se realizaron compras, migraciones, merges o despliegues.

## Hallazgos y correcciones

| Prioridad | Problema | Corrección y evidencia |
| --- | --- | --- |
| P0 | Buscar cancelaba el submit sin ejecutar ninguna búsqueda. | Reproducido: buscar Asad conservaba `/perfumes`. Formulario GET a `/buscar`, resultados sobre el catálogo público existente y recuperación de búsquedas vacías. Pruebas unitarias de acentos, mayúsculas, marcas y múltiples palabras; flujo real en navegador. |
| P1 | El menú de perfumes usaba categorías antiguas (`presencia`, `diario`, etc.) que no coinciden con las categorías vigentes. | El menú ahora deriva de la misma definición que el catálogo: árabe, diseñador, nicho, inspirado y otro. El navegador verifica los destinos exactos. No se cambiaron reglas de clasificación. |
| P1 | Encabezado de 321 px a 320 px de ancho, fijo sobre la pantalla y con acciones dispersas. | Encabezado de 197 px a 320, 390 y 430 px; logo y acciones en la misma fila, búsqueda debajo, navegación compacta. Se desplaza con el contenido en móvil y tablet. Sin desbordamiento horizontal en cinco tamaños. |
| P1 | Categorías dependían de hover/foco y no tenían un control de apertura táctil independiente. | Botón con `aria-expanded`, apertura por toque/Enter, cierre por Escape y al salir el foco, menú limitado al ancho y alto disponibles. Se quitaron roles de menú de aplicación en favor de enlaces de navegación normales. |
| P1 | Preguntas frecuentes apuntaba a `#faq`, que no existía. | Nueva `/ayuda` con preguntas sobre navegación y compra, enlaces al catálogo y WhatsApp. Se verificó navegación y apertura de preguntas en navegador. No se prometen descuentos, plazos ni medios de pago nuevos. |
| P1 | Agregar desde una tarjeta no daba feedback ni mostraba cuándo se alcanzaba el límite del carrito. | Botón reutilizable que anuncia la cantidad realmente agregada y se desactiva al límite existente. Mantiene las funciones y reglas originales de Zustand. Verificados límite, recarga, persistencia, reducción de cantidad, eliminación y estado vacío. |
| P1 | Algunos importes compactos y de inicio no identificaban el medio de pago del precio mostrado. | Etiquetas de precio lista o efectivo/transferencia; la tarjeta compacta muestra además el precio lista cuando corresponde. Sin cambios de importes ni de cálculos. Verificado con precios sintéticos 100/80. |
| P1 | Fotos verticales/horizontales podían recortarse en tarjeta y foto principal; miniaturas no exponían la selección. | Ajuste `contain` y `aria-pressed` en miniaturas. Fotos sintéticas cargadas y cambio de selección verificados a 320 y 1440 px. Se agregó carga diferida y decodificación asíncrona a fotos del catálogo. |
| P1 | Banners de tamaños distintos cambiaban la altura y rotaban automáticamente cada tres segundos sin pausa. | Marco de proporción estable y selección manual con controles de 44 px. El navegador mide la misma altura antes y después de cambiar de banner. |
| P1 | Sidebar sticky con `top-6` podía quedar bajo el encabezado sticky de escritorio; mínimo de 32 rem agregaba vacío en móvil. | Sidebar con desplazamiento normal y mínimo de altura sólo en escritorio. El riesgo de superposición se identificó en CSS; la presentación posterior se verificó en navegador. No se conserva una reproducción visual anterior de este hallazgo. |
| P1 | Placeholder de búsqueda con contraste insuficiente; textos de producto con codificación rota. | Placeholder de contraste calculado 2,14:1 → 6,07:1 sobre blanco. Corrección de textos estáticos en tarjetas y acciones del producto, y región de estado accesible en la ficha. |

El hallazgo inicial sobre supuestos filtros de mates desconectados se descartó al revisar sus definiciones completas: los filtros mostrados sí están implementados. No se cambiaron.

## Validación

- `npm ci --no-audit --no-fund`: dependencias fijadas, sin modificar package.json o lockfile.
- `npx tsc --noEmit`: aprobado.
- `npm run build`: aprobado con URL de Supabase ficticia, sin archivos de entorno reales. Next advierte sobre dos lockfiles por la ubicación del worktree; no impide compilar.
- `node --test tests/*.test.mjs`: 581 tests, 580 aprobados, 0 fallidos, 1 omitido; las pruebas de integración que requieren infraestructura adicional no certifican PostgreSQL ni formularios administrativos reales.
- ESLint del alcance modificado: 0 errores, 6 advertencias sobre imágenes HTML.
- ESLint global: falla con 7 errores heredados y 10 advertencias. Los archivos con errores no fueron modificados por esta rama.
- Navegador Chrome con Playwright ya instalado: 320, 390, 430, 768 y 1440 px; búsqueda, categorías táctiles/teclado, foco/Escape, banners, carrito, búsquedas vacías, ayuda, catálogo, ficha, login administrativo y presentación del checkout. Ver `browser-results.json` para la ejecución final sobre el build local.
- Galería y precios: fixtures locales a 320 y 1440 px; ver `component-results.json`. La página temporal se elimina al terminar y no se incorpora al producto.
- `git diff --check`: aprobado. Revisión del diff confirma ausencia de cambios comerciales y de backend.

Los recorridos públicos usan los datos de ejemplo del repositorio, URL Supabase `http://127.0.0.1:9` y una clave sintética. Se bloquearon solicitudes de navegador a otros servicios. No se leyeron archivos de entorno reales, datos de clientes ni pedidos. El checkout se abrió con productos sintéticos, sin enviar el formulario. El login se comprobó sin iniciar sesión; no se certifica la administración autenticada. No se midieron LCP/INP ni el rendimiento de imágenes remotas reales.

## Pendientes de coordinación

1. **P0, backend/catálogo:** `services/products.ts` devuelve productos demo ante errores o catálogo vacío. La ejecución sin backend reproduce ese fallback. En una tienda publicada podría mostrar nombres, importes y stock de ejemplo como catálogo comercial. Debe revisarse con el agente de backend; aquí no se modificó el servicio ni la política de visibilidad/stock.
2. **P0, checkout:** el checkout invitado, autenticación, pagos, descuento y reservas pertenecen al trabajo activo de integración. Ninguna prueba de esta rama demuestra que una compra real pueda completarse. No enviar pedidos ni mezclar las lógicas de `main` y PAY-01.
3. **P1, lint compartido:** seis enlaces `<a href="/">` de las pantallas del checkout/ficha y la asignación `window.location.href` en el checkout mantienen siete errores globales. Archivos: `app/checkout/exito/page.tsx` (2), `app/checkout/fallo/page.tsx` (1), `app/checkout/pendiente/page.tsx` (2), `app/producto/[slug]/page.tsx` (1), `app/checkout/page.tsx` (1). Bloqueados por coordinación con PR #2; no se ocultaron reglas del linter.
4. **P1, accesibilidad compartida:** botones +/- del carrito carecen de nombre que identifique el producto; el método de pago no expone selección con ARIA. El formulario del checkout muestra errores sin relacionarlos mediante `aria-describedby` ni trasladar el foco. Hallazgos de código; no se implementaron ni se afirma una validación con lector de pantalla.
5. **Administrador autenticado:** formularios, tablas, estados de carga y errores completos requieren un entorno sintético autenticado. Se verificó sólo el login público y se revisaron componentes existentes. Las pantallas implicadas en compras/pedidos/productos se mantienen fuera de la rama.
6. **P2:** optimización general con Next Image, medición de rendimiento, manejo de fotos remotas fallidas y ordenamiento adicional del catálogo quedan fuera de esta estabilización. No se agregaron dependencias ni un rediseño completo.

## Publicación

El commit de implementación es `4ee5c55`. Inicialmente se conservó local por los errores globales de ESLint. En la continuación, el usuario autorizó publicar la rama y abrir una draft PR si se demostraba que esos errores eran heredados. La comparación reproducible confirmó 9 errores en la base, 7 en esta rama, 0 nuevos y archivos con errores idénticos a la base. Ver `lint-baseline-comparison.json` e `INTEGRATION_PLAN.md`. La draft PR puede prepararse con ese estado explícito; esto no autoriza merges, despliegues ni cambios de Production.

## Archivos de implementación

`app/page.tsx`, `app/ayuda/page.tsx`, `app/buscar/page.tsx`, `app/mates/page.tsx`, `app/perfumes/page.tsx`, `app/producto/[slug]/product-actions.tsx`, `components/site-header.tsx`, `components/home-hero-slider.tsx`, `components/product-grid.tsx`, `components/product-image-gallery.tsx`, `components/catalog/catalog-sidebar.tsx`, `components/add-to-cart-button.tsx`, `lib/catalog/search.ts`.

Pruebas: `tests/catalog-search.test.mjs`, `tests/ui-ux.browser.mjs`, `tests/ui-ux-components.browser.mjs`. Evidencia y capturas: esta carpeta.

## Reproducir los recorridos locales

Continuación de la PR #8: ver `PREVIEW_AND_PAY01_REVIEW.md` para la inspección sin secretos del Preview, bloqueo de nuevos despliegues automáticos sólo en esta rama, resolución comprobada del encabezado y discrepancia de precios PAY-01 pendiente del agente principal. Se corrigieron presentación de centavos e imágenes fallidas, con pruebas locales; estos puntos dejan de estar pendientes de UI. Las simulaciones previas de conflicto describen el HEAD anterior a la resolución preparada. No se realizó merge ni se cambió el contrato comercial.

Usar una instalación existente de Playwright; no se agregó al lockfile del proyecto. Configurar `PLAYWRIGHT_MODULE_PATH` con su ubicación y `UI_BROWSER_EXECUTABLE` con Chrome/Edge instalado. Iniciar la aplicación exclusivamente con la URL Supabase ficticia y una clave sintética. `UI_BASE_URL` acepta sólo localhost o 127.0.0.1.

Ejecutar `node tests/ui-ux.browser.mjs` contra dev o el build local. Ejecutar `node tests/ui-ux-components.browser.mjs` exclusivamente contra dev, ya que crea una página temporal con fixtures y la elimina en `finally`. No ejecutar estos recorridos contra Production o con credenciales reales. Las capturas se sobrescriben con datos sintéticos de cada ejecución.
