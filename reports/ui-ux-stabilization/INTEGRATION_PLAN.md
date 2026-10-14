# Publicación de UI y preparación de integración

## Alcance verificado

El worktree estaba limpio al retomar, con HEAD `4ee5c55`. `main` remoto sigue en `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`. El commit contiene 13 archivos de implementación de UI, tres de pruebas y evidencia local. La revisión completa confirma que no cambió `services/`, `store/`, `supabase/`, APIs, checkout, carrito, contratos, precios, cálculo de descuentos, stock ni pedidos. El componente nuevo del botón lee el carrito y llama al `addItem` existente para confirmar su resultado; no sustituye sus reglas. No cambió el código de aplicación en esta continuación: sólo se agrega el comparador de lint y documentación.

## Los siete errores de ESLint son heredados

Se ejecutó ESLint tanto sobre el worktree como sobre todos los fuentes JS/TS del commit base obtenidos mediante `git show`, usando las mismas rutas de archivo, configuración y dependencias. Configuración y lockfile tienen el mismo blob Git en base y HEAD. Los diagnósticos se compararon por ruta, línea, columna, regla y mensaje completo, además de comparar el blob Git de cada archivo con errores.

| Archivo | Línea | Regla | Resultado |
| --- | --- | --- | --- |
| app/checkout/exito/page.tsx | 46, 116 | @next/next/no-html-link-for-pages | Dos errores idénticos a la base; archivo intacto |
| app/checkout/fallo/page.tsx | 19 | @next/next/no-html-link-for-pages | Idéntico a la base; archivo intacto |
| app/checkout/pendiente/page.tsx | 19, 61 | @next/next/no-html-link-for-pages | Dos errores idénticos a la base; archivo intacto |
| app/producto/[slug]/page.tsx | 245 | @next/next/no-html-link-for-pages | Idéntico a la base; archivo intacto |
| app/checkout/page.tsx | 171 | react-hooks/immutability | Idéntico a la base; archivo intacto |

Resultado: base **9 errores**, UI **7 errores**, **0 nuevos**. Esta rama elimina los dos errores de enlaces a inicio en el encabezado. No se desactivan reglas ni se modifican archivos de checkout. Evidencia: `lint-baseline-comparison.json`; reproducción: `node scripts/compare-ui-lint-baseline.mjs 7a8a105`.

TypeScript y las pruebas se ejecutaron nuevamente: 580 aprobadas, cero fallidas y una omitida de 581. El build y los recorridos de navegador de la entrega anterior siguen siendo evidencia válida del mismo código de aplicación: cinco tamaños de pantalla y dos fixtures de galería/precios. No se repitieron contra Production. ESLint del alcance queda sin errores, con advertencias de imágenes HTML. El lint global sigue fallando y debe declararse expresamente en la PR.

## Archivos compartidos y simulación de conflictos

Se consultaron las PR abiertas #1–#7 y sus cambios respecto de su propia base:

| PR | HEAD consultado | Archivo compartido con UI |
| --- | --- | --- |
| #1 — Storage | a012bf45cc512869b388b1486f372da21427b9d4 | components/site-header.tsx |
| #2 — checkout/SEC-01/PAY-01/Storage | f1378298a9309ea82e22842b8c8445b171e7ec44 | components/site-header.tsx |
| #3 — dependencias | 312f0e774c91af23b685cb24723feb3c79bcac0c | Ninguno en su diff directo |
| #4 — XLSX | e6bab4514002600e200b22f5d9aae9a98d8d3efc | Ninguno en su diff directo |
| #5 — login CAPTCHA | d3ed42484622896e56dfb76667b1acf6e1846ec6 | Ninguno en su diff directo |
| #6 — auditoría | 5184299cfc7df57caee85b0a165e71b67d21375f | Ninguno en su diff directo |
| #7 — uploads | 4300d1110b2dbd43f3b053b5ee2f042360dbcf52 | Ninguno en su diff directo |

Las PR #3–#7 están encadenadas sobre el trabajo de checkout, por lo que heredan el encabezado de sus antecesoras aunque no lo cambien directamente. #1 no es ancestro Git de #2; no se supone que ambas puedan aplicarse indistintamente ni se prescribe integrar ambas ramas completas.

`git merge-tree --write-tree --name-only HEAD origin/ui-audit-pr2` y la simulación equivalente de #1 detectaron **un conflicto textual: components/site-header.tsx**. Este comando construye objetos temporales de Git; no hace un merge sobre una rama, no cambia HEAD, índice ni archivos, y no crea un commit de integración. No se resolvió el conflicto.

## Plan para el agente principal

1. Elegir el HEAD definitivo del checkout y de su cadena de seguridad. Crear o usar su worktree de integración, no `main` ni esta rama de UI. Refrescar el análisis si cambian los HEAD anteriores.
2. Aplicar el trabajo de UI sobre esa línea en una futura integración autorizada. Revisar el encabezado por cambios concretos, sin seleccionar todo el archivo con `ours` o `theirs`.
3. En `components/site-header.tsx`, conservar de UI: búsqueda GET hacia `/buscar`, categorías derivadas del catálogo, botones táctiles/teclado y ARIA, cierre por Escape/foco, diseño móvil compacto y enlace `/ayuda`. Conservar del checkout: los enlaces `Link` a inicio con **`prefetch={false}`**. Ambos ya convierten los enlaces a `Link`; debe haber un único import de Link y `useState`, sin restaurar `FormEvent` ni el submit que cancelaba la búsqueda.
4. Mantener íntegros los archivos y las reglas de checkout, APIs, sesión, CAPTCHA, pagos, precios y reservas de la línea del agente principal. `app/carrito/page.tsx` y `app/producto/[slug]/page.tsx` no fueron modificados por UI. `product-actions.tsx` es otro archivo; sólo aporta texto y anuncio accesible.
5. Revisar una **incompatibilidad semántica de precios** aunque Git no señale conflicto: las tarjetas/inicio muestran el `transferPrice` existente; PAY-01 comunica un 25% sobre lista, calculado y congelado por el servidor. No asumir que ambos importes coinciden. El agente principal debe acordar la presentación usando su contrato comercial aprobado; UI no modifica cálculos ni datos para forzar esa coincidencia.
6. Ejecutar tipos, build, pruebas de checkout/security y regresiones de búsqueda, menús y carrito en entorno sintético integrado. Los recorridos actuales de UI usan el carrito de `main`; no sustituyen las pruebas del nuevo checkout ni deben aplicarse sin adaptación a sus etiquetas/estados. Comprobar persistencia, cantidades, descuento único, stock, ausencia de duplicaciones, instrucciones de pago y límites de sesión, sin enviar pedidos reales.
7. Resolver los errores de lint heredados en la rama responsable o declarar un estado residual explícito antes del lanzamiento. No silenciar reglas globales para hacer aprobar UI.
8. Revisar el bloqueo de catálogo que sigue a continuación. Mantener la PR de UI en draft hasta completar la revisión conjunta. Ningún paso de este documento autoriza merge, despliegue o cambios de Production.

## Posible bloqueo de lanzamiento: catálogo demo

Prioridad **P0 de revisión previa a publicación del checkout**. No se demuestra aquí que Production esté mostrando demos; sí se confirma el comportamiento del código y su reproducción sin backend.

`services/products.ts` importa `data/products.ts` y devuelve esos productos cuando falla la consulta, cuando no hay productos visibles o cuando no se encuentra un slug. Los datos incluyen nombres, importes y stock de ejemplo. La búsqueda nueva consume ese mismo servicio; no introduce el fallback ni lo corrige. La PR #2 consultada tampoco modifica `services/products.ts`.

El agente principal debe coordinar una corrección separada: distinguir un catálogo vacío válido de un error del backend, impedir mostrar/agregar datos demo como mercancía comercial en el entorno de publicación y mantener fixtures explícitos para pruebas. Debe verificar, con datos sintéticos, backend no disponible, categoría vacía, producto inexistente y catálogo válido. Confirmar además que el checkout usa IDs reales y reglas autoritativas del servidor. No implementar el cambio ni modificar el contrato desde esta rama.

## Estado de publicación

El usuario autoriza push y draft PR hacia `main` con el lint heredado documentado. No se ejecutan comandos de Vercel, migraciones, merges ni cambios de Production. La rama conserva `4ee5c55` y agrega un commit de evidencia y plan de integración. La creación de PR es una entrega para revisión, no autorización de lanzamiento.
