# DEP-02: SheetJS seguro y compatibilidad del importador (2026-10-12)

## Alcance y base

Rama local `codex/xlsx-security-20261012`, worktree `C:/dev/sfstore-staging/staging/runtime/xlsx-security-worktree`, creada desde el head actualizado de PR #3: `312f0e774c91af23b685cb24723feb3c79bcac0c`. Publicación en una PR independiente hacia `codex/dependency-security-20261012` autorizada posteriormente. No se modifican PR #2/#3, SQL canónico, Production ni datos reales. Las pruebas no cargan los scripts históricos completos ni crean clientes Supabase.

## Inventario auditado

| Consumidor | Contratos que se conservan |
| --- | --- |
| `app/admin/productos/importar/actions.ts` | Acción servidor con autorización administrativa previa; archivos XLSX/XLS/CSV, extensión/MIME, 5 MB, hoja admitida/existente; lectura buffer y normalización; comparación de precios, aliases, clasificación y confirmación existentes. |
| `scripts/dry-run-historical-import.ts` | `read`, `readFile`, matrices de Control de ventas/compras, filas vacías/null, formatos almacenados y seriales convertidos con `SSF.parse_date_code`. |
| `scripts/import-historical-data.ts` | Lectura buffer, matriz histórica y fechas; ninguna ejecución del script de aplicación durante esta tarea. |

Google Sheets utiliza su parser JSON de gviz y conserva sus límites/autorización. No existen llamadas a `sheet_to_html`, lectores XLSX públicos ni usos de SheetJS en componentes cliente dentro de app/lib/services.

## Alternativas y decisión

| Alternativa | Compatibilidad | Mantenimiento / costo | Decisión |
| --- | --- | --- | --- |
| SheetJS CE oficial 0.20.3 | Conserva XLSX, XLS, CSV, SSF y API de hojas/matrices. Requiere ajustes comprobados de fechas y filesystem ESM. | Apache-2.0, sin costo de licencia. Distribución oficial por CDN, no registro npm; exige seguimiento explícito de upstream. Tarball fijo con integridad SHA-512. | Seleccionada: menor cambio y mantiene formatos existentes. |
| ExcelJS 4.4.0 | XLSX/CSV; no lector XLS heredado. API asíncrona/modelo de filas distinto, sin reemplazo directo de SSF. | MIT, sin costo de licencia; nueve dependencias directas declaradas. No se instaló ni se afirma que su árbol esté libre de avisos. | Requeriría conversión, adaptadores y posiblemente otro parser XLS. No aporta una migración mínima compatible. |

Fuentes primarias: [instalación oficial SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [CDN oficial](https://cdn.sheetjs.com/), [ExcelJS](https://github.com/exceljs/exceljs), [discusión XLS en ExcelJS](https://github.com/exceljs/exceljs/discussions/2832), [metadatos oficiales ExcelJS](https://registry.npmjs.org/exceljs/latest).

## Vulnerabilidades corregidas y verificación independiente

| Aviso | Rango afectado | Candidato |
| --- | --- | --- |
| [CVE-2023-30533 / GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), contaminación de prototipo, alta | `<0.19.3` | 0.20.3 fuera del rango. |
| [CVE-2024-22363 / GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9), ReDoS, alta | `<0.20.2` | 0.20.3 fuera del rango. |

Consulta actual a la API oficial de GitHub (`/advisories?ecosystem=npm&affects=xlsx&per_page=100`): además aparecen tres avisos de 2021 para versiones `<0.17.0`, que tampoco afectan 0.20.3. La conclusión no depende de la desaparición de npm audit: se verifican origen oficial, versión instalada, rangos y SHA-512 del lockfile mediante una regresión.

URL fijada: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
Integridad: `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`.

No se agregan overrides ni se actualizan otros paquetes. Se retiran ocho nodos externos obsoletos usados solo por xlsx: adler-32, cfb, codepage, crc-32, frac, ssf, wmf y word. Las funcionalidades necesarias vienen dentro de la distribución oficial; menos nodos npm no equivale a ausencia de código de terceros.

## Cambios de compatibilidad indispensables

1. `readRawWorksheetRows` preserva seriales numéricos de fechas. Se reprodujo que 0.20.3 con `cellNF:true` devuelve `Date` al convertir hojas a filas, incluso con `raw:true`/`cellDates:false`. El convertidor histórico original solo admite números. El adaptador copia únicamente celdas numéricas con formato de fecha, omitiendo su formato para esta conversión; conserva el workbook original y su formato/texto. Admite hojas dispersas y densas.
2. Se inicializan codepages para conservar formatos XLS no Unicode cuando el runtime selecciona ESM.
3. El script dry-run inicializa `set_fs` explícitamente: el nuevo entrypoint ESM no carga filesystem automáticamente y un fixture demostró el fallo de `readFile` sin esta inicialización.

No se cambian precios, aliases, clasificación, autenticación, límites de carga, escritura de productos, SQL ni checkout.

## Validaciones finales

| Control | Resultado |
| --- | --- |
| `npm ci --no-audit` | OK: instalación limpia, 386 paquetes; advertencia heredada del postinstall no aprobado de unrs-resolver, sin cambiar autorizaciones. |
| Nuevas regresiones XLSX | 9/9, sin skips: XLSX/XLS BIFF8/CSV, acentos, decimales, vacíos, clasificación/validación de productos, límites de carga, ZIP corrupto/truncado, fechas seriales/formulas cacheadas, filesystem ESM y fixtures hostiles. |
| Regresiones sintéticas completas | 657/657, 52 archivos, cero fallos/skips; incluyen comparación de precios, aliases, clasificación, confirmación de importación y regresiones comerciales existentes. |
| `npm run build` | OK, Next.js 16.3.8/Turbopack, sin variables de servicios reales. |
| `npx tsc --noEmit` después de build | OK. |
| `npm run lint` | OK: cero errores, diez advertencias heredadas. |
| `npm audit --json` | Salida 1 por residuos: nueve entradas (ocho altas, una moderada); base PR #3 tenía diez (nueve altas, una moderada). No queda xlsx. |
| `npm audit --omit=dev --json` | Salida 1 por baseline-browser-mapping, una moderada; no xlsx. |

Los fixtures hostiles son XLSX sintéticos pequeños con encabezados/atributos sensibles, fórmula externa cacheada, markup literal, entidad externa con ruta inexistente y atributo largo de 4096 espacios. Se comprueba que el XML hostil reemplaza efectivamente la entrada del ZIP. El parser corre en un subprocess limitado a 128 MB de heap y cinco segundos: sin cambios del prototipo global, sin resolver la entidad ni ejecutar la fórmula. Son regresiones acotadas, no una certificación de resistencia a cualquier archivo malicioso ni PoCs públicos exactos de ambos CVE.

Inicialmente fallaron la lectura filesystem ESM, un supuesto de exportación de versión, tipado de hojas densas y un nombre de variable restringido por lint; se corrigieron con evidencia y los controles finales pasaron. El fixture ZIP también se corrigió para sustituir la entrada existente en vez de agregar una entrada duplicada.

## Riesgos residuales y pendientes

- Dependencias heredadas: @next/eslint-plugin-next, brace-expansion, braces, browserslist, eslint-config-next, fast-glob, js-yaml y micromatch (análisis/build/lint), y baseline-browser-mapping. No aparecen nuevos paquetes/advisories por este cambio; su mitigación requiere otra tarea, sin audit fix indiscriminado.
- [Upstream agregó validación opcional de protocolos en exportación HTML](https://git.sheetjs.com/sheetjs/sheetjs/commits/branch/master) después de 0.20.3 (issue #3345). SFSTORE no usa esa exportación. No se afirma que todas las APIs de 0.20.3 sean seguras para HTML no confiable; no habilitarla sin sanitización/revisión.
- Se conserva el límite de 5 MB de archivo comprimido. No es un límite de descompresión/CPU; la lectura de producción no se ha aislado en un worker. Un ZIP bomb o dimensiones extremas sigue siendo un riesgo de disponibilidad condicionado a acceso administrativo y archivos no confiables. El timeout del test no es una protección del servidor.
- Dependencia del CDN durante instalaciones sin caché. El lockfile verifica integridad, no disponibilidad. Puede evaluarse vendoring oficial o un mirror interno aprobado posteriormente.
- La validación administrativa local se completó; la validación Linux se ejecutará en la PR independiente y se registrará en su descripción. No se realizaron importaciones reales ni se verificó Production.

Antes de integrar: revisar este diff respecto a PR #3, validar esos pendientes y autorizar publicación por separado. No cambiar PR #2 ni activar despliegue implícitamente.

## Revisión y publicación autorizada

La instalación limpia Windows se repitió: 386 paquetes. Build, TypeScript posterior y ESLint pasaron (cero errores, diez advertencias heredadas). Suite completa de 673 tests: 666 exitosos, cero fallos y siete omitidos por opt-ins de servicios/runtimes no habilitados. La primera ejecución encontró un fixture local ausente; se materializaron 29 copias ignoradas según los hashes del manifiesto existente, sin alterar SQL canónico/manifiesto ni ejecutar SQL. El workflow Linux prepara esas mismas copias con el script existente y ejecuta ambas suites (sintética y completa).

Prueba administrativa real: candidato compilado servido en 127.0.0.1:3108, Supabase local 127.0.0.1:54331 y navegador Edge/Playwright. Usuario administrativo sintético efímero, contraseña aleatoria y claves locales solo en memoria; usuario eliminado al terminar. Ocho verificaciones exitosas: acceso sin sesión denegado; Auth real con CAPTCHA oficial de prueba/cookies SSR/allowlist; previsualización XLSX con acentos, importes exactos, clasificación y fila inválida; XLS heredado; hoja ausente; XLSX corrupto; límite de 5 MB; snapshot del catálogo (precios, costos, stock y timestamps) idéntico antes/después. Cero confirmaciones de importación. Harness y resultados privados permanecen ignorados en staging/runtime.

El formulario administrativo de login existente falla con captcha_failed cuando el Supabase local exige CAPTCHA: no envía ese dato. Se verificó que Auth acepta el CAPTCHA oficial de prueba; se utilizó una sesión real emitida con CAPTCHA para probar la UI del importador. No se cambió el login ni se deshabilitó CAPTCHA. Requiere una tarea separada para el login y no se atribuye a SheetJS.

Revisión de recursos: límite HTTP multipart de 8 MB y archivo de 5 MB; sin presupuesto de CPU, heap, tamaño total descomprimido, entradas ZIP, filas/celdas ni dimensiones extremas del workbook. Parsing síncrono dentro de la acción servidor y copias de celdas/filas: el event loop y la memoria pueden agotarse. Auth/allowlist reduce exposición pública, pero no contiene un archivo administrativo malicioso. La corrección adicional recomendada es parsing en worker/subprocess con deadline y memoria restringida, presupuesto de expansión ZIP y dimensiones/filas, antes de normalizar; requiere diseño compatible con Vercel y prueba específica. Los límites de cinco segundos/128 MB pertenecen solo a los fixtures hostiles del test.

Para publicar sin despliegue, vercel.json deshabilita explícitamente codex/xlsx-security-20261012. El workflow existente se amplía para la PR hacia la rama de PR #3; solo contents:read, checkout sin credenciales persistentes, acciones fijadas por SHA, sin secrets, Cron, SQL ejecutado ni servicios externos. Los dos archivos adicionales de configuración están directamente relacionados con la publicación segura y la validación solicitadas.
