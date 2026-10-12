# SEC-01/PAY-01 — intento de puesta en marcha local

Rama vigente: `codex/sec01-pay01-staging-preparation`. Continúa el trabajo existente; worktrees preservados, sin commit/push/merge/despliegue, Production ni credenciales productivas. Sin recursos externos/pagos y sin migraciones remotas.

## Estado comprobado

- Supabase CLI **2.75.0** operativo (`--version`), instalado con binario oficial Linux amd64 de https://github.com/supabase/cli/releases/tag/v2.75.0. Tarball verificado con `supabase_2.75.0_checksums.txt` del mismo release, antes de extracción. Archivos de instalación fuera del repositorio en `/workspace/sfstore-staging-tools`. Se resolvió la instalación fallida vía npm sin modificar dependencias.
- Docker local 28.4.0 responde a socket `/var/run/docker.sock`; espacio libre suficiente observado (22 GiB workspace antes del reinicio). Sin contenedores del proyecto; status local devuelve exit 1. No se afirma stack operativo.
- Primer intento de `supabase start` (sin Auth mientras se esperaba aprobación CAPTCHA) rechazó pulls de postgres/postgrest/storage/kong por `public.ecr.aws: Forbidden`. Falló antes de levantar DB/aplicar migrations. Después del reinicio, la política sigue sin esos hosts; probes curl confirman **CONNECT 403** para `public.ecr.aws` y `challenges.cloudflare.com`. No se repitió el start ni se eludió el proxy.
- Autorización del propietario registrada en el chat: claves **oficiales públicas de prueba Turnstile solo locales**, sin widget ni recursos externos. Valores obtenidos de documentación oficial Cloudflare en GitHub, sin credenciales reales. Archivo privado 0600/directorio 0700, ignorado por Git. No desactiva CAPTCHA ni representa validación antifraude real.

## Preparación concreta

`scripts/run-local-supabase-staging.py` controla proyecto local/puertos, ausencia de project-ref remoto, Auth anónimo y CAPTCHA activados. Exige el archivo privado de test, sin symlink ni variables ajenas; solo acepta las claves públicas de prueba autorizadas. Arranque usa Docker local y workdir staging, nunca flags remotos. CLI stdout/status se mantienen en memoria; no se imprimen keys/logs crudos. Tras éxito, guarda solo variables del stack local en `staging/runtime/app.env` (0600), verificando API loopback 54331. No sustituye la validación de servicios que aún no arrancaron.

Paquete de 23 migrations/historial único y seed sintético permanece listo. Las migrations canónicas y reglas de negocio no cambiaron en este intento. Descuento 25%, reserva 24h y acreditación manual administrativa siguen sujetos al contrato implementado. No se activó proceso recurrente, limpieza Storage ni cobro.

## Validaciones de esta ejecución

- Checksum oficial tarball CLI y `supabase --version`: correctos.
- Preflight del launcher: correcto, valores ocultos.
- `python3 -m unittest discover -s tests -p staging_runtime_safety_test.py`: **4/4**. Bloquea proyecto vinculado, archivo público/claves no test, CAPTCHA apagado y salida de credenciales en diagnóstico. Se ajustó un fixture para mantener las variables obligatorias al endurecer el parser; sin desactivar controles.
- `node --test tests/pay01-guest-shipping-boundary.test.mjs`: **12/12**, sin omisiones. Auth y backend mock; no prueba de GoTrue real.
- Servidor Next local con build previamente validado: **4/4 requests HTTP reales** GET/POST a `/api/mercadopago/create-preference` y `/api/mercadopago/webhook`, todos 410/AUTOMATIC_PAYMENTS_DISABLED. No usa SDK ni credenciales MP. Servidor detenido al terminar.
- `git diff --check`: correcto.

Las 758 pruebas completas anteriores y el build/TypeScript constan en el informe previo; **no se presentan como una nueva suite ejecutada aquí**. No hubo cambios TS/TSX de producto en este intento.

## Qué falta y acción exacta

**Bloqueo actual:** permisos de red del entorno Codex. Habilitar `public.ecr.aws` y `challenges.cloudflare.com` como destinos HTTPS permitidos mediante configuración soportada del entorno; aplicar y esperar reinicio. No se dispone de herramienta de edición de esa configuración en este chat; acción del propietario. No requiere comprar/crear un proyecto Supabase remoto. Si aparece otro destino de CDN o error TLS al levantar Docker, diagnosticarlo y montar CA según la guía del entorno, sin apagar verificación.

Después ejecutar el launcher y comprobar estado de cada servicio; recién entonces se podrán realizar **Auth anónimo real, PostgREST/RLS, Storage sintético, API de checkout/recibos, pagos manuales, reservas/vencimiento y envío con costo/cotización** descritos en [procedimiento](../staging/README.md). Estos componentes no se certifican desde mocks ni PostgreSQL aislado.

CAPTCHA real con widget propio y un staging remoto necesitarían autorización separada; no son necesarios para iniciar los tests locales con claves públicas ya autorizadas. CAPTCHA con claves de prueba solo comprueba integración con el proveedor en modo test, no protección productiva. Production permanece intacta.

## Archivos de este intento

Nuevos: `scripts/run-local-supabase-staging.py`, `tests/staging_runtime_safety_test.py`, este informe. Modificados: `.gitignore`, `staging/README.md`, enlace de actualización en informe previo. Privado/no versionado: `staging/runtime/captcha-test.env`. Herramientas binarias fuera del repo. Ningún archivo de migración original modificado.

## Revalidación de conectividad solicitada por el propietario

En `codex/sec01-pay01-staging-preparation` se verificaron nuevamente ambos destinos con curl, usando el proxy y la verificación TLS existentes, sin credenciales ni modificación de política:

- `https://public.ecr.aws/v2/`: curl exit 56, `CONNECT tunnel failed, response 403`; HTTP origen 000 porque el túnel no se abrió.
- `https://challenges.cloudflare.com/turnstile/v0/siteverify`: curl exit 56, mismo rechazo CONNECT 403; HTTP origen 000. No se envió token, secret ni solicitud de validación CAPTCHA.

El bloqueo de red persiste. Por instrucción expresa del propietario, **se detuvo la ejecución**: no se inició Supabase/Docker, no se ejecutaron migraciones ni pruebas automatizadas o de integración en esta revalidación. No se modificó Production ni se realizó push, merge o despliegue. Los resultados de pruebas anteriores siguen siendo evidencia histórica, no pruebas nuevas.

Acción necesaria: habilitar estos dos destinos HTTPS en la configuración soportada del entorno Codex, aplicar el cambio y volver a verificar conectividad antes del arranque local. No se eludió el proxy ni se desactivó TLS.

### Nueva comprobación — 2026-10-11T17:10:13-03:00

Ambos destinos (`public.ecr.aws/v2/` y `challenges.cloudflare.com/turnstile/v0/siteverify`) siguen rechazados por el proxy: CONNECT 403, curl exit 56, HTTP origen 000. Sin tokens ni credenciales enviados. Conforme al pedido, ejecución detenida: no se inició Supabase, no se ejecutaron migraciones ni pruebas de integración. Sin cambios en Production, push, merge ni despliegue. Habilitar ambos hosts HTTPS en la configuración soportada del entorno antes de otro intento.
