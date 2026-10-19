# Variantes — Fase 1: modelo y administración

Fecha: 2026-10-18. Rama `codex/product-variants-admin-20261018`.
Base publicada verificada: `e1fa0de237c3dec1e246a71f4a72793e2f5848ed`; alias productivo consultado por lectura y deployment `dpl_Bwbcb7aiHqLszeEgjGYs4b5ueCLf`, READY, metadato `sfstoreCommit` coincidente. Ninguna modificación productiva.

## Alcance implementado

- `product_families`: publicación sin stock/costo, categoría, nombre/slug, precio base y revisión optimista.
- `product_family_options` y `product_family_option_values`: dimensiones genéricas (máximo 6 por familia y 100 valores por dimensión), identidad inmutable, valores adicionales permitidos. La administración define todas las dimensiones antes del primer SKU.
- Nuevas columnas aditivas en `products`: `family_id`, `variant_choices`, `list_price_override`, `web_visible`, `commercial_blocked`. Los productos simples conservan ID, precio, costo, stock e historial. No hay backfill ni redistribución.
- `variant_choices` es un objeto JSONB de IDs de opción/valor. PostgreSQL comprueba pertenencia, cobertura exacta y combinación única por familia; no se confía en React. FK de familia y tablas de valores normalizadas. La configuración utilizada no puede reinterpretarse ni reasignarse a otra familia/combinación/SKU.
- Precio efectivo materializado en `products.price` = excepción o base. La actualización de base propaga sólo a herederos, dentro de la misma transacción. Los escritores legados/importadores no pueden sobreescribirlo con otro importe: error explícito. No se modifica el precio especial legado ni se aplica de nuevo el descuento.
- Asociación manual de SKU simple: requiere misma categoría, SKU, versión vigente y conservar el precio como excepción. No cambia costo, stock, imágenes, compras ni ventas existentes. No admite identidades históricas.
- Nuevos SKU: borrador, stock 0, costo desconocido (`NULL`), ocultos en web por defecto. No se inventan existencias ni costos.
- Administración integrada en `/admin/productos/familias` y su detalle, enlazada desde Productos. Lista paginada de 25 familias/SKU. Búsqueda acotada de productos simples con aviso de refinamiento si hay más de 20 coincidencias.
- Editor existente para fotografías y datos del SKU. Precio y SKU de variantes se muestran de sólo lectura allí; la familia administra su precio. La categoría/combinación utilizada queda protegida también en SQL.
- Servicios y acciones exigen sesión administrativa con la allowlist existente antes del cliente privilegiado. RLS sin políticas públicas en las tres tablas nuevas, EXECUTE privado, funciones SECURITY INVOKER y search_path fijo. Se conceden al público sólo las dos nuevas columnas booleanas necesarias para filtrar el catálogo existente; sin acceso público a familias/costos/configuración ni nuevas escrituras.
- Catálogo, detalle y sitemap filtran visibilidad web y bloqueo. Ocultar no bloquea mostrador; bloquear impide nuevas líneas y nuevos descuentos de inventario por venta/reserva. Un borrador físico anterior también queda protegido en el movimiento de descuento.
- Las RPC de compras, ventas, checkout, pagos y vencimientos no fueron reemplazadas ni cambiaron sus firmas/ACL. Nuevos guards adicionales; no se intervienen líneas previas, reservas existentes, acreditaciones o liberaciones. No hay reservas manuales ni funcionalidades de decants/probadores.

## Concurrencia

Bloqueo asesor transaccional para cambios de precio/configuración, adquirido antes de bloquear SKU en las RPC nuevas. Los movimientos exclusivamente de stock no toman ese bloqueo global.

El editor legado puede haber bloqueado un SKU antes de intentar actualizar precio. El trigger de catálogo usa `pg_try_advisory_xact_lock`: si otro cambio lo tiene, falla explícitamente con `55P03 / VARIANT_CATALOG_BUSY_RETRY` y revierte la escritura, evitando el ciclo SKU→familia / familia→SKU. El usuario reintenta o recarga; no se publica un éxito parcial ni se hace un reintento ciego. Precios concurrentes y esta inversión se ensayaron con dos conexiones reales.

Limitación: las modificaciones de precio/configuración de familias distintas comparten ese bloqueo breve. No se certificó capacidad con catálogos masivos; los timeouts de migración son 5s de lock y 30s de statement. Si fallan, detener y verificar rollback, no repetir SQL en Production automáticamente.

## Migración

`supabase/migrations/202610180001_product_families_variants.sql`, transaccional y aditiva. Se ensayó únicamente en bases sintéticas descartables PostgreSQL17.6; no se aplicó al Supabase local de checkout ni a Production. El Auth local se reutilizó exclusivamente para usuarios sintéticos temporales, eliminados al terminar, sin deshabilitar CAPTCHA.

El manifiesto y las copias de staging se prepararon para una base NUEVA aislada. No son instrucciones para aplicar todo el historial a Production. Antes de cualquier futura publicación: preflight puntual del esquema real, respaldo autorizado y revisión de la única migración nueva. Los filtros nuevos de catálogo requieren las columnas antes de publicar este código. No borrar familias/columnas para revertir: mantener el esquema aditivo y volver a un código compatible si fuera necesario; no activar variantes hasta completar integración comercial.

## Validación

- Instalación reproducible: `npm ci --ignore-scripts`; no cambios en package.json/lockfile. No se ejecutaron hooks de dependencias. npm informó 9 advisories preexistentes; no se aplicó audit fix ni se cambiaron dependencias.
- PostgreSQL17.6 real: 21/21 escenarios aprobados. Incluyen piloto sintético Termo Stanley1L Pico MateSystem, dimensiones múltiples, combinación duplicada, precios/céntimos/excepciones, rollback, versiones, stock conservado, venta física idempotente, bloqueo, reserva exacta, liberación repetida, pago informado protegido y acreditación completa de una reserva anterior pese al bloqueo posterior.
- Historial: venta actual y una importación histórica sintética creadas ANTES de la migración, instantáneas de líneas, pagos/movimientos y producto comparadas después. Sin reimportar Excel ni copiar datos productivos.
- Navegador con Next real + Auth local + PostgREST16.4 + PostgreSQL17.6 aislado: 6/6 escenarios aprobados (Node informa 7 contando el test contenedor). Sesión ausente/usuario fuera de allowlist y acción no autenticada rechazados. Formularios y acciones reales, sin mocks de RPC. Credenciales locales sólo en memoria/env del proceso hijo; no en argumentos/archivos.
- Anchos 1366×900 y390×844: sin desbordamiento horizontal; capturas sintéticas privadas en staging/runtime/variants-integration. Editor de fotografías accesible. No se repitió upload binario real de Storage en esta prueba; se reutiliza el editor y sus regresiones existentes.
- Defectos corregidos durante el ensayo: etiqueta accesible del selector y pérdida de feedback al remontar el formulario; bloqueo invertido del editor legado. Los fallos iniciales de preparación (copias SQL, fixture UUID/SKU, seed sólo en vacío y firma del liberador) se corrigieron en el arnés, no debilitando reglas.
- Suite general, TypeScript, ESLint, build y Gitleaks: resultados finales en sección de cierre. Las suites opcionales omitidas no se consideran aprobadas.

## Archivos principales

- Migración nueva y `staging/migration-manifest.json`.
- `services/product-families.ts`, `lib/products/variants.ts`.
- `app/admin/productos/familias/{page.tsx,actions.ts,error.tsx,[id]/page.tsx}`.
- `components/admin/products/family-forms.tsx`.
- Ajustes acotados en lista/editor de productos, su tipo administrativo y formulario.
- `services/products.ts` y `app/sitemap.ts`: filtros de disponibilidad.
- Tres pruebas nuevas `product-variants*.test.mjs`; fixture de visibilidad y expectativa del manifiesto adaptados en dos pruebas existentes.
- Este informe y actualización del backlog.

## Recomendación y pendientes

APTO para revisión local de Fase1 y para continuar la integración de compras, ventas y tienda. NO autoriza publicación ni activación del piloto real.

Próxima fase: presentación de opciones en selección de compras/ventas, mensajes de importadores/Sheets para precios administrados, agrupación pública en una ficha, selector y revalidación de carrito, snapshots descriptivos de variante en líneas/constancias y agrupaciones de Analytics sin reasignar historia. El costo online sigue con la política existente: no se introdujo un snapshot inventado ni cambio de valuación.

Una familia todavía NO representa una ficha pública agrupada: esa integración pertenece a la siguiente fase. Mantener sus variantes en borrador/ocultas hasta entonces. El checkbox de visibilidad no implementa el selector público.

El producto real Termo Stanley1L Pico MateSystem y sus existencias no se consultaron ni modificaron. Agrupar SKU ya conocidos no reparte stock; cualquier distribución de un saldo agregado requiere conteo y aprobación independiente.

No hubo commit, push, merge, deploy, migración remota ni escrituras en Production.

## Cierre de verificaciones

- Suite completa final: **864 tests, 851 aprobados, 0 fallidos, 13 omitidos** por configuración opcional. Incluye 21 escenarios PostgreSQL de variantes y las regresiones Docker de ventas físicas. El ensayo UI integrado se ejecutó aparte y aprobó sus 6 escenarios (7 tests contando el contenedor).
- Build Next16.3.8: aprobado. TypeScript final: aprobado. ESLint de todo el código fuente con `npm run lint -- --ignore-pattern 'staging/runtime/**'`: aprobado, 0 errores y 9 avisos preexistentes de imágenes. El comando sin ese filtro detecta los bundles generados del arnés privado (no código fuente); no se cambió la configuración ni se desactivaron reglas.
- Gitleaks de los 22 archivos modificados/nuevos: exit0, sin hallazgos. No se incluyeron node_modules, logs, cookies, credenciales ni capturas privadas. Una primera construcción encontró las copias parciales .tsx del propio escaneo; se preservaron como texto para excluirlas de TypeScript y el build posterior aprobó. No se desactivó el chequeo de tipos.
- No se hicieron cambios de dependencias, SQL histórico, contratos RPC operativos ni datos comerciales existentes.

SHA-256 del archivo de migración local preparado: `9c4fb12a61338303e39c6e43d1966c89c2d1c2ac4ca96f10266ce9f6f73832ca`. Es una referencia de revisión, no autorización de aplicación.
