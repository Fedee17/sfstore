# Actualización de dependencias de seguridad — SFSTORE — 2026-10-12

## Alcance y aislamiento

Rama local: codex/dependency-security-20261012. Worktree: C:/dev/sfstore-staging/staging/runtime/dependency-security-worktree. Base: f1378298a9309ea82e22842b8c8445b171e7ec44, último head remoto de la rama de PR #2 comprobado mediante git fetch y git ls-remote. El trabajo previo de codex/nightly-audit-clickup permanece en el checkout padre. Sin cambios en C:/dev/sfstore, main, Production, PR #2, SQL/migraciones o código comercial. La publicación posterior fue autorizada exclusivamente como PR independiente en borrador hacia codex/integration-sec01-pay01-storage-20261011; merge, despliegue y Cron siguen prohibidos.

## Versiones finales y motivo

| Paquete | Antes | Después | Decisión |
| --- | --- | --- | --- |
| next | 16.2.7 | 16.3.8 | Versión menor corregida; React/React DOM 19.2.4 conservados |
| eslint-config-next | 16.2.7 | 16.3.8 | Alineación con Next; ESLint/TypeScript conservados |
| postcss de Tailwind | 8.5.15 | 8.5.29 | devDependency directa exacta: estabiliza el compilador configurado; sin override |
| postcss de Next | 8.4.31 | 8.5.23 | Versión exacta declarada por Next nuevo; ambas instancias seguras |
| nanoid | 3.3.12 | 3.3.20 | Parche disponible posterior a 3.3.19; conserva major 3 y CommonJS/non-secure, transitivo |
| sharp | 0.34.5 | 0.35.5 | Resolución de la dependencia optional ^0.35.4 exigida por Next; sin pin/override adicional |
| source-map-js | 1.2.1 | 1.2.2 | Resolución requerida por PostCSS 8.5.29; parche transitivo |

Cambios restantes del lockfile: familia @next/SWC, @swc/helpers y binarios/libvips/plataformas de Sharp, incluido su semver anidado. Se conservó fastq 1.20.1 para evitar un avance no relacionado. No hay overrides, actualizaciones de React/Tailwind/Supabase ni nuevas formas de pago. Se consultaron las guías locales de actualización de Next antes de escribir pruebas.

Fuentes: [Next release 16.3.8](https://github.com/vercel/next.js/releases/tag/v16.3.8), [PostCSS 8.5.29](https://registry.npmjs.org/postcss/8.5.29), [nanoid 3.3.20](https://registry.npmjs.org/nanoid/3.3.20).

## Evidencia de corrección

Los 23 advisories objetivo se contrastaron con cada instancia instalada y los rangos GitHub normalizados a semver: cero coincidencias afectadas. No se da por corregido un defecto solo por desaparecer de npm audit. Se verificaron además comportamiento de nanoid, aislamiento de sourcemaps, validación de offsets y bibliotecas nativas de Sharp.

| Advisory original | Paquete | Severidad publicada | Versión final | Resultado |
| --- | --- | --- | --- | --- |
| [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) | nanoid | high | 3.3.20 | Corregido por versión; rango contrastado |
| [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | nanoid | high | 3.3.20 | Corregido por versión; rango contrastado |
| [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24) | next | high | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) | next | high | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x) | next | high | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-68g3-v927-f742](https://github.com/advisories/GHSA-68g3-v927-f742) | next | medium | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-4633-3j49-mh5q](https://github.com/advisories/GHSA-4633-3j49-mh5q) | next | medium | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-4c39-4ccg-62r3](https://github.com/advisories/GHSA-4c39-4ccg-62r3) | next | medium | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) | next | high | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-q8wf-6r8g-63ch](https://github.com/advisories/GHSA-q8wf-6r8g-63ch) | next | medium | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-955p-x3mx-jcvp](https://github.com/advisories/GHSA-955p-x3mx-jcvp) | next | medium | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) | next | critical | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) | next | critical | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) | next | critical | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) | next | medium | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) | next | low | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) | next | medium | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | next | medium | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) | next | high | 16.3.8 | Corregido por versión; rango contrastado |
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | postcss | medium | 8.5.29 y 8.5.23 | Corregido por versión; rango contrastado |
| [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | postcss | high | 8.5.29 y 8.5.23 | Corregido por versión; rango contrastado |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | postcss | medium | 8.5.29 y 8.5.23 | Corregido por versión; rango contrastado |
| [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | postcss | high | 8.5.29 y 8.5.23 | Corregido por versión; rango contrastado |

## Los siete avisos previamente pendientes

| Advisory | Instancia final | Severidad | Clasificación | Evidencia e impacto residual |
| --- | --- | --- | --- | --- |
| [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | baseline-browser-mapping 2.10.33 | medium | Pendiente, condicional; exposición web no identificada | Next y Babel/Browserslist usan configuración de targets en build. No hay API que pase opciones del comprador al generador. Un parámetro inválido puede terminar el proceso; no es un falso positivo de versión. Candidato 2.11.0 o posterior, en tarea de toolchain separada. |
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | sharp 0.35.5 | high | Corregido; riesgo previo condicional | Biblioteca nativa libvips 8.18.7 verificada, superior a 8.18.3 indicada por el advisory. Sin entrada GIF/TIFF/VIPS de compradores identificada. Prueba funcional de imagen sintética exitosa. |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | sharp 0.35.5 | high | Corregido; riesgo previo condicional | libheif 1.23.5 verificado, superior a 1.23.2. Riesgo previo por imágenes AVIF maliciosas y condiciones de plataforma; no se identificó entrada AVIF optimizada de comprador. |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | sharp 0.35.5 | high | Corregido; riesgo previo condicional | librsvg 2.63.2 verificado, parche indicado por el advisory. SVG sintético convertido a PNG correctamente; no se ejecutó RCE ni payload malicioso. Linux/glibc productivo no inspeccionado. |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | source-map-js 1.2.2 | high | Corregido; riesgo previo de build condicional | Prueba verifica rechazo inmediato de offsets enormes en sourcemaps indexados. No hay endpoint de sourcemaps del comprador. No se ejecutó el payload sobre la versión vulnerable. |
| [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) | xlsx 0.18.5 | high | Pendiente; parser vulnerable efectivamente utilizado | Importador administrativo invoca XLSX.read sobre archivos XLS/XLSX/CSV tras requireAdminActionSession y límite 5 MB. Archivo malicioso o administrador comprometido puede exponer el proceso; exportar sin leer archivos sería un flujo no afectado, pero no es el uso de SFSTORE. Sin exploit ejecutado. Corrección upstream ≥0.19.3; paquete npm no tiene fix. |
| [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | xlsx 0.18.5 | high | Pendiente; parser vulnerable efectivamente utilizado | Mismo flujo de importación, riesgo ReDoS. Auth restringe el actor; tamaño 5 MB no prueba inmunidad a CPU DoS. Corrección conjunta requiere SheetJS CE ≥0.20.2 desde distribución oficial, o sustitución con contrato y pruebas, en cambio separado. |

Balance de las 30 asociaciones iniciales: 27 corregidas por versiones y evidencia complementaria; 3 pendientes (baseline-browser-mapping y dos SheetJS). No equivale a 27 exploits reproducidos. Tampoco absuelve toda dependencia del proyecto.

## npm audit residual

Auditoría completa: 10 entradas de paquetes (9 altas, 1 moderada, 0 críticas). Auditoría --omit=dev: 2 paquetes (xlsx alta y baseline-browser-mapping moderada), que representan los tres avisos originales aún pendientes. Las entradas de paquetes, los avisos únicos y la propagación por dependencias son métricas distintas. npm audit continúa devolviendo un resultado no limpio.

Las otras entradas completas están en desarrollo: brace-expansion, braces, browserslist y js-yaml, con propagación a fast-glob, micromatch, @next/eslint-plugin-next y eslint-config-next. No son un nuevo defecto del runtime Next 16.3.8. Sus entradas provienen de patrones/configuraciones de herramientas y no se identificó control de esos parámetros por compradores. Riesgo condicional de CI/configuración no confiable; no afirmar que la versión está sana. Se dejaron fuera del cambio acotado. No se aceptó la propuesta automática de bajar eslint-config-next a 14.2.35 ni se ejecutó audit fix --force.

## Validaciones realizadas

| Validación | Resultado | Alcance |
| --- | --- | --- |
| npm ci final | PASS | Instalación limpia Windows, 394 paquetes; lockfile aceptado |
| npm ls | PASS | Instancias/versiones verificadas, sin invalid/peer conflict |
| TypeScript --noEmit | PASS | Antes y después del build |
| ESLint | PASS con 10 warnings | Cero errores; nueva prueba también validada. Warnings principalmente no-img-element y deuda existente |
| Next production build | PASS | Next 16.3.8 Turbopack, generación y tipado completos |
| Suites sin servicios reales | PASS 644/644 | 50 archivos; autenticación, acciones, pagos, precios, stock y cotizaciones, entre otras |
| Nuevas pruebas de seguridad | PASS 4/4 | nanoid aislado con timeout; ambas copias PostCSS; offsets source-map-js; SVG→PNG nativo Sharp |
| Supabase local: checkout invitado | PASS 9/9 | CAPTCHA oficial de prueba, cookies, Auth, RLS, descuento 25%, plazo 24 h, reintentos, recibos privados y Server Action de acreditación |
| Supabase local: reglas de transferencia | PASS 16/16 | Pago íntegro, informe/comprobante privado, rechazo, stock 1/2, abuso y concurrencia |
| Supabase local: vencimientos | PASS 10/10 | No liberación temprana/pagados; exactamente una restitución; locks, timeout, rollback y reintento |
| Supabase local: ejecutor | PASS 17/17 | Privilegios efectivos, SECURITY DEFINER, no escalamiento, pagos concurrentes, SKIP LOCKED, errores parciales y auditoría; ningún Cron instalado |
| Supabase local: comercio aprobado | PASS 11/11 | Copia de alias, retiro gratis, envío cotizado sin pedido previo, importe inalterable y aceptación concurrente única |
| Visual checkout/Tailwind | PASS | Comparación baseline 16.2.7 vs 16.3.8 en 1365×900 y 390×844, mismos estilos/dimensiones en main, título, input y botón; sin overflow horizontal; capturas inspeccionadas |
| Gitleaks de fuentes | PASS | Cero hallazgos tras excluir exclusivamente .next, node_modules y staging/runtime |
| git diff --check | PASS | Sin whitespace inválido; warnings de conversión LF/CRLF de Git sin defecto de contenido |

Total de tests: 711 aprobados (644 existentes sin servicios + 4 nuevos + 63 con servicios locales), cero fallidos finales y cero omitidos en las suites ejecutadas. No se ejecutaron todos los archivos tests del repositorio: suites ajenas al alcance o que necesitan otro harness quedaron excluidas explícitamente.

El stack Docker local Auth/Storage/DB estaba saludable; vector se observó reiniciando, sin incidencia en estos flujos. Tests validaron URL loopback y sentinel SFSTORE_SYNTHETIC_STAGING, con 29 migraciones ya existentes. No se aplicó ninguna migration ni se borró/resetó la base. Nuevos pedidos/comprobantes son sintéticos, conservados solo localmente; invariantes finales verificaron cero restituciones duplicadas, cero restituciones de pagados y cero stock negativo. No se debilitó CAPTCHA/Auth/RLS.

La prueba de PostCSS además se contrastó con la copia antigua 8.4.31 sobre un fixture propio: la antigua leyó un .map fuera del directorio CSS y la nueva lo ignoró. Ningún archivo privado fue objeto de ese ensayo. Los casos potencialmente bloqueantes nanoid se ejecutaron solo con versión nueva en subprocess con timeout.

## Fallos intermedios y tratamiento

- Primer build con Node --env-file falló por ERR_WORKER_INVALID_EXEC_ARGV: el worker de Next no acepta ese argumento heredado. Se cargó el archivo local existente en memoria y se lanzó Node sin --env-file; build final PASS. No hubo cambio de checkout ni de seguridad.
- Primera nueva prueba PostCSS asumía map.text presente: el parche elimina el mapa rechazado. Se ajustó la aserción a ausencia de mapa, manteniendo control positivo de un mapa legítimo; 4/4 PASS. Primera comprobación visual seleccionaba input[type=text] mientras el formulario usa tipo implícito; selector corregido, comparación final PASS.
- Un primer comando de audit no encontró el directorio de logs en una carrera del harness. Se creó y repitió la auditoría: los avisos residuales son reales, no un error de ejecución final.
- Gitleaks sobre todo el worktree detectó 21 elementos en .next (material de caché/framework y clave anon pública local). No son archivos a integrar. Comparación en memoria: cero archivos detectados con la service_role local y cero archivos .next/static con esa clave. El scan de fuentes terminó sin hallazgos; no se publicó ningún valor.
- npm ci advirtió que el postinstall de unrs-resolver no estaba aprobado por allowScripts. No se habilitaron scripts extra; ESLint, build y pruebas funcionaron. Revisar política de instalación en CI Linux antes de integrar.
- La revisión automática rechazó duplicar las credenciales a un nuevo .env.local. Se usó el archivo privado existente en memoria, validando destino local, sin copiar secretos. No queda una solicitud de autorización pendiente por esta alternativa.

## Archivos del cambio y evidencias privadas

- package.json: Next/eslint-config-next y pin dev de PostCSS.
- package-lock.json: resolución reproducible de la familia afectada.
- tests/dependency-security-regression.test.mjs: cuatro regresiones aisladas.
- docs/DEPENDENCY_SECURITY_UPDATE_20261012.md: este informe sanitizado.
- scripts/validate-dependency-security.mjs: ejecución de las 648 pruebas sintéticas, sin opt-ins a servicios.
- .github/workflows/dependency-security-linux.yml: npm ci, regresiones, lint, build sin credenciales y TypeScript en Ubuntu 24.04 / Node 24; token contents:read, acciones fijadas por SHA, timeout y concurrencia.
- vercel.json: excluir únicamente codex/dependency-security-20261012 de los despliegues Git automáticos antes del push.

Logs, JSON npm audit, fixtures, capturas y harness de ejecución se mantienen ignorados bajo staging/runtime; .env no copiado ni incluido. Los JSON de evidencia comercial generados por las suites están excluidos por .gitignore. Ningún dato sintético o credencial entra en el diff candidato.

## Recomendación para integrar a PR #2

El cambio acotado es candidato a revisión e integración por sus resultados locales, sin modificar código comercial ni SQL. Antes de publicar/integrar: revisar el diff, repetir npm ci/build/tests en Linux con su política de scripts y binarios, y decidir explícitamente el tratamiento del riesgo SheetJS y de toolchain. SheetJS merece un cambio dedicado de distribución/migración, con importaciones válidas/malformadas, límites y aislamiento del parser. Baseline-browser-mapping puede actualizarse de forma acotada a la rama corregida y probar build/targets. No declarar el proyecto libre de vulnerabilidades ni listo para Production.

La validación de Linux se ejecutará en el check Dependency security Linux validation de la PR; su resultado efectivo debe comprobarse en GitHub Actions. No se realizaron pruebas en Vercel o Production, exploits RCE/SSRF ni una auditoría visual de todas las páginas. La validación comercial local no confirma credenciales, tarifas o configuración productiva.

El servidor local de port 3107 queda ejecutando el build nuevo desde este worktree. El servidor temporal de comparación port 3108 se cerró.

package.json SHA-256: 25dcc441b1bbb70650e37a7621fc25923d0d5a954ee292d3a273832ed38fe18a

package-lock.json SHA-256: 358fc35b430b88c591a725b6f75d5b9c01ff607d08e0678c9f043b11d52f739f

## Revalidación para publicación independiente

Base y merge-base con integración: f1378298a9309ea82e22842b8c8445b171e7ec44. Se repitieron npm ci, 648 pruebas sintéticas, build sin credenciales y TypeScript. Un primer npm ci encontró EPERM en SWC porque el servidor local estaba usando el binario; se detuvo el proceso y la instalación limpia pasó. Se preparó CI Linux de lectura, sin secretos de servicios y sin publicar artefactos. Las cinco suites reales locales se repitieron contra el build nuevo: 63/63 PASS, sin skips. Total de la revalidación: 711 tests PASS; ESLint cero errores/10 warnings, build con configuración local y build sin credenciales PASS, TypeScript posterior PASS, Gitleaks del diff preparado PASS. El resultado de Linux se informa mediante checks y descripción de la PR, sin afirmar que el workflow preparado ya se ejecutó.

La exclusión Vercel es un control de seguridad de publicación necesario: la configuración anterior deshabilitaba solo las ramas previas, y el nuevo push podría provocar un preview automático. No se modifican comandos ni configuración de Production.
