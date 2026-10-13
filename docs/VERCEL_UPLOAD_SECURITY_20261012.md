# Cargas compatibles con Vercel — validación local 2026-10-12

Rama: `codex/vercel-upload-security-20261012`. Base: PR #6, commit `4035d3d0d0653c076881ca4ecdc167e60af22187`. Worktree independiente dentro de staging. No se modificaron Production, main, el proyecto original, dependencias ni migraciones SQL. La validación no requiere merge, despliegue, activación de Cron ni sincronización con ClickUp. La publicación de esta rama y su PR independiente fue autorizada posteriormente.

## Diagnóstico y alcance

Vercel documenta un máximo de 4.5 MB para el cuerpo de solicitud o respuesta de una Function: https://vercel.com/docs/functions/limitations. La configuración anterior de Server Actions (8 MB) y el presupuesto de comprobantes (5 MiB) podían permitir archivos que la plataforma rechazara antes de ejecutar la validación de SFSTORE. La inspección de las guías incluidas en Next.js 16.3.8 precedió a los cambios de configuración.

Inventario de rutas que reciben archivos:

| Entrada | Recorrido | Validaciones conservadas / nuevas |
| --- | --- | --- |
| POST `/api/checkout/payment-report/[orderId]` | Cuerpo binario por Function, servidor a Storage privado | Auth, origen, propietario, idempotencia, firma PDF/PNG/JPEG y MIME; máximo 3 MiB por lectura incremental |
| `previewProductImport` en `/admin/productos/importar` | FormData por Server Action; parser local | Allowlist administrativa previa, XLSX/XLS/CSV, MIME y contenido, presupuestos de formulario y recursos |
| `createProduct` / `updateProduct` | FormData por Server Action; servidor a Storage de productos | Autorización administrativa, validaciones existentes de imágenes y operaciones; presupuesto agregado de archivos |
| GET `/api/checkout/payment-proof/[orderId]` | Descarga protegida por Function | Propietario o administrador, auditoría y bucket privado; respuesta de nuevos archivos menor al límite |

`confirmProductImport` recibe la selección de una previsualización, no un archivo. La previsualización de Google Sheets tampoco recibe archivos; su política comercial no se cambió. Los servicios internos de guardado de imágenes reciben los archivos ya validados por las acciones administrativas.

## Corrección

Se eligió reducir el límite efectivo a 3 MiB (3,145,728 bytes), manteniendo el recorrido existente y las verificaciones privadas. No se agregaron tokens de carga ni URLs firmadas para subir archivos, políticas de Storage o credenciales en el navegador.

El comprobante conserva PDF, PNG y JPEG. El servidor rechaza Content-Length excesivo y aplica el límite a los bytes realmente leídos, independientemente del encabezado. La interfaz comunica el límite y trata un 413 de forma clara. El aviso continúa pendiente de verificación: cargar un comprobante no acredita un pago. Se conserva la comprobación del digest y la protección ante reintentos.

Server Actions se limita a 4 MiB. El presupuesto de aplicación permite archivos por un total de 3 MiB por formulario, texto de hasta 128 KiB, 128 entradas y nombres de hasta 256 caracteres, dejando margen para multipart y metadatos de Next.js. Cliente y servidor aplican esos presupuestos. Las imágenes optimizadas se cargan en tandas si su suma excede el máximo; la conversión y compresión previas permanecen. La interfaz permite corregir una selección que excedió el presupuesto sin reutilizar un intento fallido.

El parser de Excel se ejecuta en un Worker con entorno vacío, heap antiguo de 128 MiB, generación joven de 16 MiB, stack de 4 MiB y plazo de 5 segundos. Se termina el worker antes de liberar el control de concurrencia. Solo se admite un parser simultáneo por proceso, sin cola ilimitada; otro intento recibe un mensaje para reintentar. Este límite no constituye un control global entre instancias de Vercel.

Para XLSX se valida el ZIP antes de SheetJS: hasta 256 entradas, 8 MiB expandidos por entrada y 16 MiB totales, métodos store/deflate, directorio y encabezados coherentes, sin cifrado, duplicados o rutas peligrosas. Se limita la descompresión real con maxOutputLength, incluso cuando los tamaños declarados son falsos. No se extraen archivos al sistema de archivos. Se rechazan ZIP multidisco y estructuras ZIP64 no soportadas.

Se preservan XLS y CSV, códigos de página, CSV UTF-8/UTF-16/Windows-1252, selección de hoja y seriales numéricos de fechas usados por el importador. Se limitan 32 hojas, 2,000 filas de datos, 64 columnas y 100,000 posiciones por hoja. Las filas serializadas se limitan a 1 MiB y la previsualización completa a 2 MiB. Se conservan validaciones, aliases, clasificación, comparación de precios y confirmación administrativa.

El build incluye explícitamente el worker y SheetJS en el trazado de archivos de la ruta administrativa. Las importaciones estáticas del worker corrigen un fallo reproducido con Turbopack: la resolución dinámica que pasaba en Node aislado fallaba en el Server Action compilado. Se verificó la inclusión del worker y de los archivos de SheetJS en el trazado local. La nueva rama figura con despliegues automáticos deshabilitados en vercel.json.

## Pruebas ejecutadas

| Verificación | Resultado |
| --- | --- |
| Instalación limpia `npm ci --no-audit --no-fund` | Aprobada; 386 paquetes |
| TypeScript `tsc --noEmit` | Aprobada |
| ESLint | 0 errores; 10 advertencias heredadas |
| Build de producción Next.js | Aprobado después de la corrección del worker |
| Suite sintética final | 711 aprobadas, 0 fallidas, 0 omitidas |
| Suite general final | 729 total: 720 aprobadas, 0 fallidas, 9 omitidas |
| Integración real con Supabase local y aplicación compilada | 11 aprobadas, 0 fallidas, 0 omitidas |
| Gitleaks sobre archivos completos modificados y nuevos | Aprobado: 19 archivos completos, sin secretos detectados; salida redactada |
| `git diff --check` | Aprobado |

Las suites se superponen: no deben sumarse sus conteos. Las nueve omisiones de la suite general corresponden a pruebas opt-in; la suite específica de cargas reales se ejecutó separadamente con su habilitación local.

Las regresiones de recursos incluyen archivo excesivo, contenido corrupto, descompresión real y tamaños ZIP falsos, dimensiones excesivas, límites de salida, codificación CSV, recuperación tras rechazo concurrente, formulario agregado, CPU que excede el plazo y fallo de heap del worker. Se verificaron los presupuestos y mensajes coherentes en comprobantes e imágenes.

La prueba administrativa usa un usuario efímero exclusivo y archivos generados en memoria. Inicia sesión con Supabase local, cookies SSR y allowlist administrativa; CAPTCHA permanece habilitado con la clave oficial de prueba que siempre aprueba. No certifica Cloudflare productivo ni CAPTCHA negativo real. Previsualiza XLSX, XLS y CSV mediante el Server Action compilado; comprueba errores visibles de archivo grande y corrupto. Un snapshot confirma que precios, costos, stock y timestamps de productos no cambian por previsualizar. No se confirmó ninguna importación sobre datos reales.

La integración también crea un comprador anónimo y producto sintéticos locales, compra por transferencia con retiro, comprueba acceso denegado de otro comprador y rechazo de comprobantes excesivos antes de Storage. Un PDF sintético de exactamente 3 MiB se carga dos veces con la misma clave: permanece pendiente de revisión y no duplica la operación. Bucket privado, acceso público denegado, descarga ajena denegada y descarga propia exitosa. El usuario administrativo efímero se elimina mediante su identificador propio al terminar. Los pedidos/productos sintéticos quedan únicamente en la base local; no se publican fixtures privados ni credenciales.

Hubo fallos intermedios: resolución dinámica del worker en Turbopack, sincronización de hidratación/redirección del harness y una interrupción externa de Docker. Se corrigieron la integración del worker y la sincronización de la prueba; se reanudó Docker sin borrar ni reinicializar datos. Las corridas finales no presentan fallos. Los logs locales están en staging/runtime/upload-validation, ignorados por Git.

## Riesgos y validaciones pendientes

- No se desplegó en Vercel: el límite de aplicación está por debajo del documentado, pero el empaquetado Linux, Worker, overhead real de Server Actions, memoria RSS y tiempos fríos deben comprobarse en infraestructura gestionada antes de producción.
- resourceLimits restringe el motor JavaScript; no limita toda la RSS ni los buffers externos y no convierte al Worker en sandbox: https://nodejs.org/api/worker_threads.html. Los presupuestos de entrada, expansión, salida y plazo son complementarios. XLS/OLE no recibe la preinspección ZIP; queda sujeto a tamaño de entrada, worker y dimensiones. Un aislamiento de proceso más fuerte puede ser necesario si las mediciones gestionadas lo justifican.
- Los límites pueden rechazar libros legítimos muy grandes o complejos. Dividirlos es la alternativa comunicada; ampliar el presupuesto requiere reevaluar plataforma y recursos.
- El bucket y esquema históricos conservan su techo de 5 MiB. Nuevas cargas web aceptan 3 MiB. Comprobantes antiguos entre 3 MiB y 5 MiB podrían superar el máximo de respuesta de Vercel al descargarse por Function. Antes de integrar, determinar mediante una revisión autorizada si existen y, de corresponder, diseñar descarga temporal protegida. No se consultó Production ni se migraron objetos.
- Esta tarea no corrige los avisos residuales de dependencias ni los bloqueos de infraestructura señalados en la revisión previa de lanzamiento.
- El control de concurrencia del parser es por proceso. Auth administrativa limita exposición; revisar métricas y capacidad en Vercel antes de ampliar concurrencia.

## Integración recomendada

Preparar una PR independiente hacia codex/nightly-audit-clickup, conservando el stack existente. No mezclar cambios SQL, pagos o inventario. Actualizar los filtros de CI para validar esta rama cuando se autorice su publicación. Antes de producción, ejecutar instalación/build en Linux y una validación gestionada autorizada con archivos sintéticos: límite exacto y excedido, XLS/XLSX/CSV, disponibilidad del worker y consumo de recursos. Mantener la rama sin despliegue automático y las auditorías/Cron desactivados. Los resultados locales permiten revisar el cambio; no certifican el checkout completo para producción.
## Revalidación para publicación

Se revisaron los 17 archivos originales y se agregaron exclusivamente `.github/workflows/upload-security-linux.yml` y `scripts/validate-upload-compiled-worker.mjs`: 19 archivos en total. La base remota de PR #6 sigue siendo 4035d3d. No se alteraron workflows nocturnos ni gates de ClickUp.

Windows: integración con Supabase local repetida: 11/11 aprobadas sin omisiones. Instalación limpia repetida (386 paquetes), 711/711 regresiones sintéticas y suite general 720 aprobadas/9 omitidas/0 fallos. ESLint: 0 errores/10 advertencias heredadas. Build y TypeScript aprobados. El smoke ejecuta el Worker emitido por Turbopack desde el trazado de la página; valida XLSX, XLS, CSV UTF-8, archivo corrupto y dimensiones excesivas, además de la existencia de los archivos trazados y módulos SheetJS/códigos de página. Aprobado localmente.

La primera repetición del build encontró copias locales del escaneo de secretos dentro del alcance TypeScript. Eran artefactos ignorados, no cambios de producto. Se cambiaron sus extensiones para excluirlas de compilación; el build y TypeScript posteriores pasaron. Ninguno de esos artefactos se versiona.

Ubuntu: workflow exclusivo de PR hacia codex/nightly-audit-clickup y ejecución manual, Node 24, timeout 20 minutos, concurrencia con cancelación de duplicados, acciones fijadas por SHA y permiso contents:read. Incluye instalación limpia, suites sintéticas y generales, lint, build, TypeScript y el mismo smoke del Worker compilado. No usa secretos, servicios reales, SQL ejecutable, despliegues, schedules ni ClickUp. El resultado gestionado se registrará en la descripción de la PR; preparar el workflow no equivale a certificar Linux.

La instalación emitió la advertencia previa de aprobación de postinstall de unrs-resolver; no se autorizaron scripts adicionales ni se cambió el lockfile. Los límites del Worker son por proceso y heap, no una garantía de RSS total ni un sandbox de seguridad. La validación Linux del artefacto tampoco certifica la infraestructura Vercel, cuyas pruebas continúan pendientes.