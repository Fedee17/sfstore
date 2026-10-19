# Auditoría de preparación — 2026-10-10

## Alcance y procedencia

Pedido vigente: texto adjunto “SFSTORE — Preparación del desarrollo semiautónomo”. Autoriza inspección, validación y documentación; prohíbe implementar backlog, commits automáticos y operaciones productivas. Los checkpoints anteriores son antecedentes, no encargos nuevos. Se respetó AGENTS y se preservó su bloque de reglas Next.js.

Inspección sobre main `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`, con `origin/main` actualizado por fetch; worktree aislado `/workspace/sfstore-development-preparation`, rama `codex/semiautonomous-development-preparation`. No se cambió main ni se incorporaron otras ramas. Runtime sin secretos configurados; no se cargaron credenciales de Production. No se ejecutó supabase db push, migration remota, borrado de archivos reales, pago, importación real, merge ni deploy.

## Validaciones ejecutadas

| Check | Resultado | Alcance |
| --- | --- | --- |
| `npm ci --cache /tmp/sfstore-npm-cache` | PASS: 391 paquetes instalados | package-lock reproducible en este runtime; package files no modificados. |
| `npx --cache /tmp/sfstore-npm-cache tsc --noEmit` | PASS | Ejecutado también después del build para comprobar tipos generados. |
| `npm run lint` | FAIL: 9 errores, 11 warnings | Errores preexistentes en main; no se silenciaron reglas. |
| `node --test tests/*.test.mjs` con runtimes locales | PASS: 603/603, 0 fallos, 0 skips | PostgreSQL efímero y Chromium incluidos; solo fixtures/mocks. |
| `npm run build` | PASS | Next 16.2.7/Turbopack genera rutas y assets; no confirma servicios reales. |
| `npm ls --all --json` | Exit 0 con 5 entradas extraneous | Integridad no completamente limpia; detalle abajo. |
| `npm audit --json` | 36 entradas: 1 crítica, 34 altas, 1 moderada | 42 URLs de advisory únicas; varias entradas propagan la misma causa. No es una prueba de exploits de Production. |

Node usado: 24.19.0. npm audit es una consulta al registro, sin `audit fix`. Logs temporales de checks quedaron en `/tmp/sfstore-prep-*.log`; el [registro persistente](../reports/development-preparation-validation-20261010.json) conserva resultados, dependencias y advisories públicos sin secretos.

Comando completo de pruebas de esta ejecución:

```bash
SFSTORE_TEST_PG_BIN=/tmp/sfstore-pg-runtime/node_modules/@embedded-postgres/linux-x64/native/bin \
SFSTORE_TEST_PG_MODULE=/workspace/sfstore-storage-p1/node_modules/pg/lib/index.js \
SFSTORE_TEST_PLAYWRIGHT_MODULE=/tmp/sfstore-p1-playwright.cjs \
node --test tests/*.test.mjs
```

Se reutilizó `pg` únicamente como driver de pruebas de un runtime ya disponible; no se cambió main para agregarlo. El wrapper Playwright usa `/usr/bin/chromium`; PostgreSQL usa binarios nativos de un paquete temporal y bases efímeras. Estas rutas describen esta ejecución, no requisitos portables para otro checkout; QA-01 propone el runner reproducible. No se usó SUPABASE_URL ni claves reales para probar.

La suite incluye unidades puras, aserciones de contratos sobre código fuente, tests SQL locales y formulario React real (HEIC, respuesta perdida, doble submit, versión/edición obsoleta). No incluye la operación integral de un checkout/pago desplegado con políticas actuales de Supabase.

## Problemas técnicos concretos

ESLint: ocho `@next/next/no-html-link-for-pages` por enlaces `/` en `app/checkout/exito/page.tsx` (2), fallo (1), pendiente (2), `app/producto/[slug]/page.tsx` (1) y `components/site-header.tsx` (2); un `react-hooks/immutability` por `window.location.href` en `app/checkout/page.tsx:171`. Los 11 warnings son nueve `no-img-element` y dos unused vars (`subtotal`, `brand`). Correcciones de los nueve errores ya existen en draft PR #1; no se repitieron.

`npm ls` informó extraneous `@emnapi/core@1.10.0`, `@emnapi/runtime@1.10.0`, `@emnapi/wasi-threads@1.2.1`, `@napi-rs/wasm-runtime@1.1.4` y `@tybys/wasm-util@0.10.2` después de npm ci. Comando exit 0; no se removieron ni se diagnosticó como lockfile roto sin evidencia. Registrar/reproducir en runner limpio antes de actualizar dependencias.

Dependencias directas marcadas por npm audit: Next.js (crítica), xlsx (alta), @tailwindcss/postcss, eslint y eslint-config-next (altas por cadena transitiva). xlsx 0.18.5 tiene [prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) y [ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9). Next incluye advisories condicionados por runtime/configuración; el registro JSON conserva títulos/rangos para triage. `fixAvailable: false` del audit no demuestra que sea imposible actualizar: exige evaluación manual. No se aplicó fix force ni overrides.

## Riesgos y funcionalidades incompletas

- Checkout público confía en precios del carrito y hace inserts anon de cliente/pedido/items en pasos separados; falla parcial puede dejar datos incompletos. No hay precio/stock autoritativo ni idempotencia integral demostrados. PAY-01.
- Preferencias MP no muestran ownership/rate-limit/idempotencia en handler. Webhook consulta MP, pero firma, asociación/importe/moneda y recuperación de inventario requieren revisión de contrato. PAY-02.
- Políticas/grants efectivos de tablas públicas y Storage no están demostrados por schema/migrations locales. SEC-01. Se identificaron grants service-only en RPC críticas; no se extrapola a toda la DB.
- Catálogo de respaldo puede ocultar error o vacío real; build/render no equivale a catálogo conectado. CAT-01.
- Logs temporales de login incluyen correos/lista autorizada. SEC-02.
- Editor de configuración no existe: solo lectura de brand; recomendaciones son admin/deterministas, no IA pública. CFG-01/REC-01.
- Metadata de `app/layout.tsx` contiene mojibake; public/admin conservan paletas distintas; fuentes y tema no están unificados. TXT-01/UX-01.
- README boilerplate; checklist menciona ADMIN_EMAIL fallback que no existe; guía Storage y pendientes visuales son históricos. DOC-01.
- No se observó workflow CI versionado. Conexión activa de Vercel y Production no verificada. QA-02.

## Evidencia por área

| Área | Fuentes inspeccionadas |
| --- | --- |
| Estructura/stack/rutas | package.json/lock, inventario app/components/lib/services/store/scripts/tests/supabase; salida de build. |
| Auth/permisos | lib/admin-authorization.ts, admin-session.ts, supabase/client.ts, auth-server.ts, server.ts; login/actions; guards en páginas/acciones; schema y grants/RLS de migrations. |
| Productos/catalog | services/products.ts, product-save.ts; lib/products/atomic-save.ts, public-product-visibility.ts; pruebas de guardado/visibilidad/imágenes y migrations de main. |
| Recomendaciones | app/admin/consulta/page.tsx, lib/admin/quick-catalog.ts, lib/catalog/perfume-recommendation.ts, atributo config; suite motor/UI; docs/catalog-data-model.md. |
| Pedidos/pagos/inventario | services/orders.ts, customer-orders.ts, order-payments.ts, inventory.ts, store-sales.ts, purchases.ts; APIs MP, pricing y carrito; tests/RPC relevantes. |
| Importación | API Sheets, límites/token, scripts e importadores disponibles; docs/google-sheets-product-sync.md; tests sintéticos. |
| Diseño/despliegue | globals.css, layout, brand, componentes compartidos, admin config/analytics, next.config, docs/production-checklist y docs visuales. |
| Git/trabajo existente | status/worktree list, fetch main, referencias remotas y consulta directa PR #1: open, draft, merged=false. |

No se hizo una nueva auditoría exhaustiva del procesador Storage: se consultó su estado/trabajo previo y se separó de main, tal como pidió el usuario antes. Las pruebas generales se ejecutaron para el objetivo nuevo de preparación.

## Entrega y plan

AGENTS ampliado y siete documentos nuevos: PROJECT_CONTEXT, ARCHITECTURE, BUSINESS_RULES, DESIGN_SYSTEM, SECURITY_RULES, DEVELOPMENT_BACKLOG y este reporte. Documentación anterior intacta. Registro JSON de validaciones/advisories agregado en reports. No cambios de aplicación/dependencias/configuración ni migration requerida.

Backlog: 16 propuestas con prioridad, complejidad, dependencias, riesgo, autonomía, aceptación y validaciones. P0 concentra framework, checkout/pagos, permisos y revisión Storage; después verificabilidad/estabilidad, UX y funcionalidades opcionales. Todas siguen propuestas, sin ejecución. Decisiones del propietario y plan están en [PROJECT_CONTEXT](PROJECT_CONTEXT.md); límites vinculantes en AGENTS/SECURITY_RULES.

Cambios quedan sin commit y sin push en la rama de preparación. Worktrees previos y sus cambios sin confirmar permanecen preservados. La preparación no tiene bloqueo técnico; verificar Production, probar MP sandbox, corregir áreas restringidas e integrar/desplegar requieren encargos/aprobaciones separados.
