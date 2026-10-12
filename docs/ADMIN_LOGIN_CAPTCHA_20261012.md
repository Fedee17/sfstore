# Login administrativo: Turnstile y Supabase Auth

Fecha: 2026-10-12. Rama independiente: `codex/admin-login-captcha-20261012`.
Base: `e6bab4514002600e200b22f5d9aae9a98d8d3efc`, cabeza actualizada de PR #4 al iniciar el trabajo. Publicación autorizada como PR independiente en borrador; sin modificaciones de PR existentes.

## Causa verificada

La página administrativa sólo enviaba email y contraseña. `loginAdmin` llamaba a `signInWithPassword` sin `options.captchaToken`. Supabase Auth local tenía CAPTCHA habilitado con proveedor Turnstile y rechazaba el acceso sin token con HTTP 400 / `captcha_failed`. El problema era la integración ausente en el login; no una pérdida de cookies ni un fallo de la allowlist.

## Corrección y fronteras

- Formulario cliente con Turnstile explícito, site key pública y un único campo controlado `captchaToken`. Expiración, error y timeout invalidan el token; existe renovación manual y renovación tras cada intento. El botón conserva el estado pendiente compartido.
- La Server Action exige exactamente un token de texto no vacío, de hasta 2048 caracteres; rechaza campos duplicados, archivos y configuración incompleta antes de contactar Auth.
- `signInWithPassword({ email, password, options: { captchaToken } })` entrega el token a Supabase Auth. Supabase realiza la validación del proveedor una sola vez. Next no llama adicionalmente a Siteverify y no necesita el secreto de Turnstile.
- Se mantienen el cliente SSR con anon key, cookies existentes, `auth.getUser()` y `ADMIN_ALLOWED_EMAILS`, guards de páginas/acciones y signOut del usuario autenticado no autorizado. Sin service_role en el login, sin cambios de RLS, SQL, checkout, dependencias o permisos.
- Diagnósticos contienen sólo códigos permitidos y status; no credenciales, tokens, cookies, allowlist ni mensajes privados del proveedor.

## Configuración para integrar

Configurar `NEXT_PUBLIC_ADMIN_TURNSTILE_SITE_KEY` o reutilizar `NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY` como fallback, con una site key compatible con el secreto configurado en Supabase Auth y hostnames autorizados para el entorno. La site key es pública; el secreto debe permanecer exclusivamente en la configuración servidor de Supabase Auth. No utilizar claves oficiales de pruebas en un entorno comercial. No se cambiaron las claves ni la configuración del Auth local.

## Validación realizada en Windows

- Instalación limpia `npm ci`: exit 0; versiones/dependencias intactas.
- `npm run build` con Next 16.3.8 y `npx tsc --noEmit` después del build: exit 0. El build de ensayo comercial incluyó únicamente la site key pública oficial de prueba.
- `npm run lint`: exit 0, 10 advertencias previas en archivos ajenos al cambio, ninguna en los archivos de entrega.
- `node scripts/validate-dependency-security.mjs`: 666 pruebas sintéticas aprobadas, 0 fallos, 0 omisiones; incluye checkout, pagos, permisos e inventario. La regresión de botón pendiente fue actualizada para comprobar su nueva ubicación.
- `node --test tests/*.test.mjs`: 683 pruebas contabilizadas, 675 aprobadas y 8 omitidas por opt-in de servicios, 0 fallos. Las suites reales indicadas abajo se ejecutaron por separado.
- `tests/admin-login-real-local.test.mjs`: 6 escenarios más test contenedor, 7/7 aprobados con Supabase local y Next de esta rama en puerto 3109. Widget real oficial de prueba, credenciales válidas, credenciales inválidas y reintento, usuario válido fuera de allowlist, sesión Auth anónima y acceso sin sesión denegados. Tokens ausentes rechazados por la Server Action y directamente por Auth. Los callbacks de expiración/error de UI se simularon explícitamente; no equivalen a rechazo real del proveedor.
- Regresiones existentes `pay01-real-local-approved-commercial` y `pay01-real-local-transfer-rules`: 25 escenarios más 2 contenedores, 27/27 aprobados con Supabase local y Next de esta rama. Se usaron copias ignoradas que ajustan sólo el puerto 3107 a 3109 y la ruta de evidencia local. Incluyen alias/copia, retiro, 25%, plazo de 24 horas, cotización, montos inmutables, aislamiento, comprobantes privados, pago completo, rechazo y liberación única, rollback, cuotas, concurrencia, stock 1/2 y Mercado Pago deshabilitado.
- Primer ensayo comercial fallido por ausencia de `CHECKOUT_GUEST_ENABLED` en el proceso aislado; corregida la configuración del harness local, sin modificar el checkout. Dos fallos iniciales del ensayo de login correspondían al email vaciado por redirección y al botón `aria-disabled`; ajustado el test y repetido con éxito.

Los usuarios Auth del ensayo administrativo fueron sintéticos, creados para cada ejecución y eliminados al finalizar. Las regresiones comerciales conservan sus propios productos, pedidos y comprobantes sintéticos en la base local, conforme a sus suites existentes. No se ejecutaron migraciones, resets, limpiezas de base, importaciones reales ni acceso a Production. Fixtures SQL usados en pruebas estáticas son copias ignoradas, verificadas con el manifest; no fueron ejecutados ni modificaron SQL histórico.

## Límites y pendientes

El Auth local usa el secreto oficial Turnstile que siempre acepta tokens no vacíos. Se verificó expresamente que un token sintético inválido/expirado es aceptado por esa configuración. Por ello NO está certificada la denegación real por el proveedor de tokens inválidos, expirados o reutilizados. El manejo de `captcha_failed` está cubierto con errores simulados y la expiración cliente con callbacks simulados. Antes de integrar para uso comercial, validar esos negativos en un entorno separado con configuración Turnstile real autorizada, sin deshabilitar CAPTCHA.

Una interrupción de Cloudflare, bloqueo del script/CSP o configuración ausente deniega el acceso hasta que se recupere la verificación. No se agregaron MFA ni cambios de límites Auth; están fuera del alcance. El workflow existente se amplió a esta rama con Ubuntu 24.04 y Node 24: npm ci, regresiones sintéticas, suite completa con opt-ins reales omitidos, lint, build y TypeScript. Tiene contents: read, acciones fijadas por SHA, timeout de 15 minutos y cancelación de duplicados. No recibe secretos ni ejecuta SQL. El resultado remoto final se registra en la descripción de la PR.

Publicación: PR independiente en borrador hacia `codex/xlsx-security-20261012`. `vercel.json` excluye también `codex/admin-login-captcha-20261012` de despliegues automáticos. Alcance final de nueve archivos: siete de autenticación/pruebas/documentación, más workflow y exclusión de despliegue. Completar la validación negativa del proveedor antes de considerar listo el login comercial.

## Referencias oficiales

- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://developers.cloudflare.com/turnstile/troubleshooting/testing/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

Revisión final: Gitleaks sobre los nueve archivos de entrega aprobó sin hallazgos (contenido completo, salida redactada). git diff --check aprobó. No hay archivos .env, credenciales, evidencias privadas ni fixtures generados en el diff de entrega.

Revalidación de publicación: las suites sintéticas y generales, build, TypeScript, lint y login real volvieron a aprobar. La suite comercial aprobó sus 10 escenarios. El ensayo de pagos encontró un timeout al buscar el pedido sólo en la página inicial cuando la base sintética superó los 100 pedidos; el harness ignorado se ajustó para navegar a la página calculada con el mismo orden del administrador. No se cambió código comercial ni se eliminaron datos. La descripción de la PR registra el resultado final de esa repetición y de CI Linux.
El siguiente ensayo alcanzó correctamente la alerta en la página correspondiente, pero el matcher de la Server Action seguía exigiendo una URL sin query. Se ajustó sólo el matcher del harness ignorado para aceptar /admin/checkout con su parámetro page. Ambos defectos estaban en el ensayo, sin cambios en las rutas ni acciones comerciales.
