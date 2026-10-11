# SFSTORE: preparación de staging local detenida

Fecha: 11 de octubre de 2026 (America/Buenos_Aires).
Checkout inspeccionado: rama `work`, commit `7a8a105`.

## Conectividad comprobada

Las solicitudes usaron el proxy heredado del entorno y validación TLS activa.

| Recurso | Resultado | Alcance |
| --- | --- | --- |
| `https://public.ecr.aws/v2/` | HTTP 401, cabecera `WWW-Authenticate: Bearer` | El endpoint del registro es accesible; el desafío de autenticación es esperado. No demuestra acceso a las descargas de imágenes. |
| `https://challenges.cloudflare.com/turnstile/v0/api.js` | HTTP 302 y, siguiendo la redirección, HTTP 200; 86.732 bytes | El script de Turnstile es accesible. No demuestra validación de CAPTCHA ni integración con Auth. |

La configuración del entorno incluye ambos dominios entre los permitidos. La herramienta de estado informa `observations_current: true`, pero el estado de aplicación de la política HTTP es `unknown`; no se considera evidencia de política aplicada.

## Intento de Supabase local

Docker local respondió en `unix:///var/run/docker.sock` (versión 28.4.0); inicialmente no había contenedores en ejecución.

Se utilizó Supabase CLI 2.76.16 y se creó un proyecto independiente en `/workspace/scratch/sfstore-staging`. La CLI más reciente falló al intentar escribir en el directorio de usuario de solo lectura; se recurrió al binario oficial de la versión indicada, descargado en `/tmp`.

Configuración aislada: identificador `sfstore-staging`, puertos locales predeterminados, inicio anónimo habilitado y seed deshabilitado. No se copiaron ni ejecutaron migraciones, datos de negocio ni credenciales remotas. El CAPTCHA todavía no se configuró.

Comando intentado:

```sh
env -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  DOCKER_HOST=unix:///var/run/docker.sock \
  /tmp/sfstore-supabase-cli/supabase start \
  --workdir /workspace/scratch/sfstore-staging \
  --exclude realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

La descarga de PostgreSQL falló y la CLI intentó repetirla:

```text
failed to display json stream: error pulling image configuration: download failed after attempts=6: Forbidden
Retrying after 4s: public.ecr.aws/supabase/postgres:17.6.1.093
```

Registro completo: `/workspace/scratch/sfstore-staging/start.log`.

Esto constituye un bloqueo de la descarga necesaria para iniciar Supabase. El mensaje no identifica el host final rechazado ni permite atribuir con certeza el rechazo al proxy o al registro. Se detuvo el proceso con SIGINT, siguiendo la instrucción de detener la ejecución si persistía un bloqueo de red. No se intentó eludir el proxy ni cambiar la política.

## Verificaciones pendientes

- Migraciones: no ejecutadas; no hubo una base local operativa.
- Auth anónimo, CAPTCHA, RLS y Storage: no verificados funcionalmente.
- Checkout, pedidos, reservas, descuentos y pagos manuales: no probados contra la base local.
- Pruebas automatizadas: no ejecutadas, por la instrucción de detenerse ante el bloqueo de red.
- Mercado Pago: no se proporcionó ni configuró un token durante esta tarea. No puede confirmarse su deshabilitación en la aplicación: el checkout acepta `payment=mercadopago` y la ruta de creación de preferencias comprueba `MERCADO_PAGO_ACCESS_TOKEN`. En este checkout no se encontró un interruptor explícito que deshabilite el proveedor. Requiere verificación o preparación posterior; no se inspeccionó ni modificó Production.

El checkout tampoco contiene `supabase/config.toml` ni una integración identificable de CAPTCHA/Auth anónimo en el código inspeccionado. El esquema inicial está separado de las migraciones y hay dos archivos con prefijo `202609180002`; antes de aplicarlos localmente debe revisarse su orden y compatibilidad con la CLI. No se alteraron estos archivos.

## Condición para reanudar

Restablecer la descarga de la imagen `public.ecr.aws/supabase/postgres:17.6.1.093` mediante la configuración de red admitida por el entorno y verificar que finalice sin `Forbidden`. Luego iniciar la instancia aislada, comprobar que todos los destinos de base de datos sean locales y continuar las migraciones y verificaciones pendientes.

No se modificó Production ni se realizaron push, merge o despliegues.
