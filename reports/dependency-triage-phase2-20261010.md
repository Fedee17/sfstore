# Dependencias — análisis focalizado de Fase 2

Se revisaron las **36 entradas** de npm audit ya registradas (1 crítica, 34 altas, 1 moderada), sus rutas en package-lock y las causas directas/propagadas. No se repitió una auditoría integral ni se ejecutó PoC sobre Production. El [registro inicial](development-preparation-validation-20261010.json) contiene advisories/rangos; el [análisis por entrada](dependency-triage-phase2-20261010.json) detalla ruta plausible, actualización y riesgo de las 36.

## Criterios y resultados

`dev` del lock distingue el conjunto instalado; no demuestra por sí solo qué parser es accesible desde una request. Se cruzaron contratos de importador, Server Actions, configuración Next, uso de imágenes y scripts. Una cadena `via` no constituye otra vulnerabilidad independiente: toolchain propaga braces/globs/YAML/browser targeting. Sin entradas públicas identificadas no se afirma seguridad absoluta ni explotación confirmada.

| Dependency / grupo | Producción y plausibilidad | Actualización / riesgo |
| --- | --- | --- |
| Next 16.2.7 (crítica) | Framework y Server Actions reales; riesgo condicionado por cada advisory. | 16.3.8 disponible, Node >=20.9 y peers React ^19 compatibles con runtime local; cambio de minor/pin y framework requiere revisión y tests. No afirmar compatibilidad funcional probada. |
| xlsx 0.18.5 (alta) | Importador admin parsea archivos externos, guard + límite 5 MB no eliminan ReDoS/prototype pollution. | Latest npm sigue 0.18.5; fix >=0.20.2 no disponible como update del registro consultado. Evaluar origen/distribución/API. Alto riesgo de cambio del parser. |
| sharp 0.34.5 (alta) | Cadena nativa de optimizador; imagen malformada es condicional a configuración/input efectivo. | 0.35.5 disponible, cruza línea 0.34 del parent; actualización soportada de Next, sin overrides. |
| postcss 8.4.31/8.5.15 (alta) | CSS/maps de build; no parser público de CSS identificado. | 8.5.29 disponible; Next fija 8.4.31 y requiere parent upgrade; Tailwind admite línea ^8.5.10, output sin verificar. |
| source-map-js / nanoid / baseline mapping | Instaladas en conjunto prod, pero uso identificado de tooling/targeting/IDs; no inputs web directos al parser identificados. | 1.2.2 / 3.3.20 / 2.11.28 disponibles; candidatas semver, no resolución integral probada. |
| brace-expansion, browserslist, js-yaml | Toolchain dev; rutas requieren patrones/stats/YAML externos maliciosos. | 1.1.21 y 5.0.12 / 4.29.3 / 4.3.2 verificadas; preservar rangos de parents y todas las instancias. |
| braces y propagación micromatch/fast-glob | Toolchain dev; DoS de patrones anidados, no API web de globs identificada. | Última major3 sigue 3.0.3 afectada; sin fix compatible verificado en esa línea. |
| ESLint/Babel/TypeScript-ESLint y plugins | Entradas dev propagadas por causas anteriores; no exploits adicionales independientes demostrados. | eslint wanted 9.39.5 frente latest10.12.0; Tailwind wanted4.3.3. Actualizar parents con tests, evitar majors/force innecesarios. |

Consultas read-only: `npm outdated --json`, `npm view next@16.3.8 version engines peerDependencies`, `npm view xlsx version` y versiones/engines de 13 specs transitivas. Se usó cache temporal en /tmp: primer intento sin cache explícita falló por ENOENT de cache fuera del workspace, segundo intento corrigió esa ruta y completó. `npm outdated` exit1 indica versiones desactualizadas, no fallo del registro. No hubo instalaciones ni audit fix.

## Desglose de advisories Next

La existencia de una condición en main no prueba explotación en hosting activo. No se inspeccionaron Production ni su OS/runtime.

| Advisory / condición | Evidencia local / exposición plausible |
| --- | --- |
| Middleware/proxy + locale bypass | No middleware/proxy ni i18n configurados identificados; admin usa getUser/allowlist por página/acción. Ruta descrita no demostrada aquí. |
| DoS Server Actions | Hay Server Actions, incluido login público; superficie plausible, límite 8 MB de body no demuestra mitigación del advisory. |
| SSRF actions en custom server | Scripts usan next dev/start y no custom server identificado; condición adicional no demostrada. |
| Dos cache confusion por request body/UTF-8 inválido | App Router/cache presentes; validar comportamiento/mitigación del hosting. No se probó poisoning. |
| Payload ilimitado Edge actions | No runtime Edge explícito en handlers/actions identificados; condición Edge no demostrada. |
| SSRF rewrites por hostname | next.config contiene redirect estático, no rewrites identificados; destino manipulable no demostrado. |
| DoS optimizador SVG | Assets SVG existen; optimizador puede estar disponible aunque UI use img. Requiere confirmar rutas/formato efectivo, sin PoC. |
| Disclosure endpoints Server Functions | Server Functions existen; exposición plausible de metadata interna, no significa bypass automático de guards. |
| RCE Windows hosting | OS activo no comprobado; no asumir Windows a partir de comandos históricos del checklist. |
| RCE AVIF optimizer | No assets AVIF identificados; imágenes admin normalizan WebP/JPEG y preview unoptimized. Explotación depende de input/endpoint y hosting, no demostrada. |
| RCE next/og ImageResponse | Metadata OG usa asset estático; no ImageResponse/next/og en código de app identificado. Ruta del advisory no demostrada. |
| Cache poisoning self-hosted SSG/ISR | Hay páginas estáticas; self-host/cache de Production no verificado. |
| Disclosure MCP devserver | Riesgo de desarrollo expuesto, no prueba de exposición en build production; no publicar devserver. |
| Metadata images dynamicParams | No handlers dinámicos de metadata image identificados; OG es URL estática. |
| Cache poisoning SSG/ISR general | Build genera rutas estáticas; riesgo depende de requests/caché; requiere pruebas aisladas y documentación del host. |
| SSRF Image Optimization | remotePatterns no configurado; no fetch remoto libre identificado. Endpoint y controles reales requieren verificación. |

## Decisión de este lote

**Cero actualizaciones de paquetes.** PR #1 modifica package.json y package-lock para el worker/pg; regenerar el lock aquí causa solapamiento previsible. Next/xlsx/sharp requieren revisión fuera del mantenimiento bajo riesgo; otras candidatas semver necesitan resolver la cadena y eliminar ese solapamiento. No se actualizaron Supabase, Mercado Pago ni React por estar outdated: no corresponden a correcciones autorizadas de este lote.

Acción necesaria: acordar orden de integración o encargar una rama de dependencias basada en el lockfile aprobado; para Next/parser, aprobar alcance restringido y validar upgrade con suite/build y fixtures de importación. DEP-01/DEP-02 siguen pendientes; este análisis no inicia su implementación.

## Matriz de las 36 entradas

| Paquete | Severidad | Versión(es) lock | Alcance instalado | Causa via | Decisión |
| --- | --- | --- | --- | --- | --- |
| @babel/core | high | 7.29.7 | dev | @babel/helper-compilation-targets, @babel/helper-module-transforms | Diferida; ver JSON para compatibilidad/riesgo. |
| @babel/helper-compilation-targets | high | 7.29.7 | dev | browserslist | Diferida; ver JSON para compatibilidad/riesgo. |
| @babel/helper-module-transforms | high | 7.29.7 | dev | @babel/core | Diferida; ver JSON para compatibilidad/riesgo. |
| @eslint-community/eslint-utils | high | 4.9.1 | dev | eslint | Diferida; ver JSON para compatibilidad/riesgo. |
| @eslint/config-array | high | 0.21.2 | dev | minimatch | Diferida; ver JSON para compatibilidad/riesgo. |
| @eslint/eslintrc | high | 3.3.5 | dev | js-yaml, minimatch | Diferida; ver JSON para compatibilidad/riesgo. |
| @next/eslint-plugin-next | high | 16.2.7 | dev | fast-glob | Diferida; ver JSON para compatibilidad/riesgo. |
| @tailwindcss/node | high | 4.3.0 | dev | source-map-js | Diferida; ver JSON para compatibilidad/riesgo. |
| @tailwindcss/postcss | high | 4.3.0 | dev | @tailwindcss/node, postcss | Diferida; ver JSON para compatibilidad/riesgo. |
| @typescript-eslint/eslint-plugin | high | 8.60.1 | dev | @typescript-eslint/parser, @typescript-eslint/type-utils, @typescript-eslint/utils, eslint | Diferida; ver JSON para compatibilidad/riesgo. |
| @typescript-eslint/parser | high | 8.60.1 | dev | eslint | Diferida; ver JSON para compatibilidad/riesgo. |
| @typescript-eslint/type-utils | high | 8.60.1 | dev | @typescript-eslint/utils, eslint | Diferida; ver JSON para compatibilidad/riesgo. |
| @typescript-eslint/utils | high | 8.60.1 | dev | @eslint-community/eslint-utils, eslint | Diferida; ver JSON para compatibilidad/riesgo. |
| baseline-browser-mapping | moderate | 2.10.33 | incluida en prod; ver análisis | baseline-browser-mapping | Diferida; ver JSON para compatibilidad/riesgo. |
| brace-expansion | high | 5.0.6/1.1.15 | dev | brace-expansion | Diferida; ver JSON para compatibilidad/riesgo. |
| braces | high | 3.0.3 | dev | braces | Diferida; ver JSON para compatibilidad/riesgo. |
| browserslist | high | 4.28.2 | dev | browserslist, baseline-browser-mapping, update-browserslist-db | Diferida; ver JSON para compatibilidad/riesgo. |
| eslint | high | 9.39.4 | dev | @eslint-community/eslint-utils, @eslint/config-array, @eslint/eslintrc, minimatch | Diferida; ver JSON para compatibilidad/riesgo. |
| eslint-config-next | high | 16.2.7 | dev | @next/eslint-plugin-next, eslint, eslint-import-resolver-typescript, eslint-plugin-import, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, typescript-eslint | Diferida; ver JSON para compatibilidad/riesgo. |
| eslint-import-resolver-typescript | high | 3.10.1 | dev | eslint, eslint-plugin-import | Diferida; ver JSON para compatibilidad/riesgo. |
| eslint-plugin-import | high | 2.32.0 | dev | eslint, minimatch | Diferida; ver JSON para compatibilidad/riesgo. |
| eslint-plugin-jsx-a11y | high | 6.10.2 | dev | eslint, minimatch | Diferida; ver JSON para compatibilidad/riesgo. |
| eslint-plugin-react | high | 7.37.5 | dev | eslint, minimatch | Diferida; ver JSON para compatibilidad/riesgo. |
| eslint-plugin-react-hooks | high | 7.1.1 | dev | @babel/core, eslint | Diferida; ver JSON para compatibilidad/riesgo. |
| fast-glob | high | 3.3.1 | dev | micromatch | Diferida; ver JSON para compatibilidad/riesgo. |
| js-yaml | high | 4.2.0 | dev | js-yaml | Diferida; ver JSON para compatibilidad/riesgo. |
| micromatch | high | 4.0.8 | dev | braces | Diferida; ver JSON para compatibilidad/riesgo. |
| minimatch | high | 10.2.5/3.1.5 | dev | brace-expansion | Diferida; ver JSON para compatibilidad/riesgo. |
| nanoid | high | 3.3.12 | incluida en prod; ver análisis | nanoid | Diferida; ver JSON para compatibilidad/riesgo. |
| next | critical | 16.2.7 | incluida en prod; ver análisis | next, baseline-browser-mapping, postcss, sharp | Diferida; ver JSON para compatibilidad/riesgo. |
| postcss | high | 8.4.31/8.5.15 | incluida en prod; ver análisis | postcss, nanoid, source-map-js | Diferida; ver JSON para compatibilidad/riesgo. |
| sharp | high | 0.34.5 | incluida en prod; ver análisis | sharp | Diferida; ver JSON para compatibilidad/riesgo. |
| source-map-js | high | 1.2.1 | incluida en prod; ver análisis | source-map-js | Diferida; ver JSON para compatibilidad/riesgo. |
| typescript-eslint | high | 8.60.1 | dev | @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/utils, eslint | Diferida; ver JSON para compatibilidad/riesgo. |
| update-browserslist-db | high | 1.2.3 | dev | browserslist | Diferida; ver JSON para compatibilidad/riesgo. |
| xlsx | high | 0.18.5 | incluida en prod; ver análisis | xlsx | Diferida; ver JSON para compatibilidad/riesgo. |
