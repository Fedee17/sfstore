# SFSTORE: diagnóstico de checkout y red

Fecha: 11 de octubre de 2026, America/Buenos_Aires. Revisión sin cambios de código, arranque de servicios, nuevas descargas de imágenes, migraciones ni publicación.

## Resultado

Hay dos problemas distintos: este entorno contiene el checkout antiguo de main, no el trabajo local de PAY01/staging, y el proxy bloquea el CDN al que ECR redirige la descarga. Las referencias activas a Mercado Pago son heredadas; no se comprobó una regresión de PAY01. Antes de continuar hay que recuperar el workspace correcto y resolver el acceso al CDN o elegir un registro oficial alternativo permitido.

## Rama, commit y comparación

Estado local comprobado mediante Git:

- Directorio: `/workspace/sfstore`.
- Rama: `work`.
- HEAD: `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`, `feat: integrate atomic product saves`.
- `origin/main` local y `main` anunciado actualmente por GitHub apuntan al mismo commit.
- Solo hay un worktree disponible aquí. PAY01 y los worktrees de staging no existen en este filesystem.
- `git ls-remote --heads origin` no anuncia `codex/pay01-guest-national-shipping` ni las ramas de preparación de staging. El refspec local también está limitado a main. No se hizo fetch ni checkout.

Se consultó, en modo lectura, el historial del chat **Desarrollo SFSTORE**, ID `01a124d4-4e0b-779c-9a4e-116a198fa031`. Sus salidas Git e informes muestran lo siguiente; son evidencia histórica de otro workspace, no una inspección actual de esos archivos:

| Trabajo | Base registrada | Estado registrado y diferencia frente a este checkout |
| --- | --- | --- |
| `codex/sec01-pay01-integration-readiness` | `69049e2`, baseline de integración/QA | SEC-01 y checkout PAY01, cambios modificados/no versionados, migraciones 001–005. |
| `codex/pay01-guest-national-shipping` | `69049e2` | Worktree `/workspace/sfstore-guest-shipping`, creado desde integration-readiness y con copia de su diff/archivos nuevos. Añadió compra invitada con Auth anónimo, envío nacional/cotización, migración 006 y pagos manuales. Informe: 749 pruebas. |
| `codex/sec01-pay01-staging-preparation` | `69049e2` | Worktree `/workspace/sfstore-staging-preparation`; paquete de migraciones aislado, fixtures y configuración Auth/CAPTCHA. Informe: 758 pruebas y endpoints MP con 410. Launcher y comprobaciones posteriores de red permanecían locales. |

Las ramas compartían HEAD base y transportaban implementación sin commit; comparar únicamente hashes no recupera ese trabajo. Sus archivos tampoco se pueden obtener de una rama remota que no fue publicada. No hay objetos de `69049e2` disponibles en este clon para establecer distancia o ascendencia mediante Git. No se presenta un diff byte a byte actual ni se certifica que esos worktrees históricos sigan intactos.

### Mercado Pago

En el checkout actual, `app/checkout/page.tsx` y `app/api/mercadopago/create-preference/route.ts` no tienen diferencias respecto del commit inicial `fe509bc` del 15 de julio de 2026. Ya aceptaban `payment=mercadopago`, usaban el SDK y dependían del access token. El webhook sí recibió cambios posteriores de integración con el libro de pagos; eso no evidencia una reversión de los bloqueos PAY01.

En el historial de PAY01/staging se registraron handlers GET/POST que devuelven `410 / AUTOMATIC_PAYMENTS_DISABLED`, sin llamadas al proveedor, y comprobaciones HTTP locales posteriores con ese resultado. Aquí falta esa implementación, así como el nuevo checkout, sus migraciones y su configuración.

Conclusión: el aviso previo sobre MP describe código heredado de este checkout. No demuestra una regresión de PAY01 ni el estado de Production. Debe recuperarse el trabajo local del chat original antes de probar el staging solicitado.

## Imagen y URL exactas del intento previo

Intento documentado en este entorno: CLI 2.76.16, proyecto temporal `/workspace/scratch/sfstore-staging`, `db.major_version = 17`.

- Imagen: `public.ecr.aws/supabase/postgres:17.6.1.093`.
- Manifiesto: `https://public.ecr.aws/v2/supabase/postgres/manifests/17.6.1.093`.
- Manifiesto Linux/amd64: `sha256:4dc38ee83142120eb02ed76d07f07c83c3391d59efcd1e89cfc69d445166c18e`.
- Configuración: `sha256:84b4750a504b6fb99a1d310fcb83a6c0a4e9d7c0b79d923ba0789afc44759467`.
- URL de configuración: `https://public.ecr.aws/v2/supabase/postgres/blobs/sha256:84b4750a504b6fb99a1d310fcb83a6c0a4e9d7c0b79d923ba0789afc44759467`.
- ECR responde 307 y redirige al host `d5l0dvt14r5h8.cloudfront.net`. La ruta observada, sin parámetros de firma, fue `/v2/6ba379-897729127604-1cc9a8a6-7523-90dd-e6f5-6e28346ece12/3274b3d4-7b0e-40b6-bd0c-3227aa14a39c`. La URL firmada es efímera y no se imprime ni guarda.

La URL `http://%2Fvar%2Frun%2Fdocker.sock/v1.51/images/create?...` del log es la API local del daemon, no el origen de descarga.

Importante: el staging histórico estaba preparado con CLI **2.75.0**, `db.major_version = 15`, proyecto `sfstore-checkout-synthetic-staging`, API 54331 y DB 54332. La imagen 17 indicada arriba pertenece al intento temporal de este chat, no al proyecto original. No se puede afirmar el tag exacto de PG15 del proyecto original a partir de este log. No cambiarlo a PG17 por inferencia.

## Causa comprobada de Forbidden

Sin ejecutar `docker pull` ni descargar capas, se consultaron token, manifiestos y metadatos de configuración:

1. Token anónimo ECR: HTTP 200; valor mantenido en memoria y omitido de la evidencia.
2. Manifiesto del tag y manifiesto amd64: HTTP 200.
3. GET del objeto de configuración: ECR responde 307 hacia el CDN indicado.
4. El túnel HTTPS al CDN falla: `curl: (56) CONNECT tunnel failed, response 403`, respuesta `HTTP/1.1 403 Forbidden`, `server: envoy`.
5. La política actual es restringida, su estado ahora es `enforced` y permite `public.ecr.aws`; no incluye `d5l0dvt14r5h8.cloudfront.net`.

El rechazo comprobado procede del **proxy de salida**, antes de establecer TLS con el CDN. No es un 403 emitido por ECR ni una respuesta del CDN, y no hay evidencia de tag inexistente, rate limit o fallo de autenticación como causa de este bloqueo. El log previo de Docker no registra cada URL, pero falla al descargar configuración; el diagnóstico reproduce el bloqueo sobre el objeto de configuración del mismo tag/plataforma.

HEAD de ese blob devolvió 401 desde ECR; por eso no se lo usó para concluir que la descarga estaba disponible. GET de metadatos reveló la redirección. Permitir únicamente el dominio del registro no permite automáticamente sus destinos CDN.

Evidencia local: `/workspace/scratch/sfstore-staging/start.log`, `registry-diagnostic.json` y `cdn-connect-diagnostic.txt`. No se cambió la política, se omitieron firmas/tokens y se mantuvieron proxy y TLS.

## Alternativas oficiales

| Alternativa | Evaluación |
| --- | --- |
| CLI Docker con ECR y CDN permitido | Opción preferida para conservar el proyecto, runtime y versiones preparados. Añadir el host CDN exacto mediante configuración soportada del entorno; no editar el JSON de política. Puede haber otros destinos de capas: diagnosticarlos una vez si aparecen. |
| CLI Docker con GHCR | La CLI 2.76.16 admite `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io`; genera `ghcr.io/supabase/<imagen>:<tag>`. La acción oficial setup-cli también usa GHCR. Mantener el tag/versiones, comprobar manifiestos y destinos antes de un único inicio. Es selección de registro admitida, sin desactivar ni eludir el proxy. No fue probado aquí. |
| CLI Docker con Docker Hub | La misma CLI admite `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` y conserva `supabase/postgres:<tag>`. Requiere comprobar disponibilidad del tag, cuota y CDN de Docker Hub. No garantiza que todos los servicios o descargas sean accesibles. No fue probado. |
| Runtime nativo de Supabase | La documentación actual ofrece un runtime experimental para Linux amd64/arm64 mediante stack. Usa archivos oficiales de servicios y verifica checksums; necesita acceso a GitHub/release-assets o al fallback S3. Requiere CLI compatible, nuevo proyecto local y `SUPABASE_HOME` en un directorio escribible. No es una opción de CLI 2.75.0/2.76.16 y requiere revisar compatibilidad antes de adoptarla. |
| Compose oficial de self-hosting | Permite ejecutar el stack completo localmente, con configuración propia. Sigue necesitando imágenes y agrega más preparación que el CLI; no soluciona por sí solo el bloqueo de red. |
| PostgreSQL aislado sin Supabase | Sirve para SQL, reservas, descuentos y pagos manuales con fixtures, como en pruebas históricas. No sustituye las pruebas reales de GoTrue, CAPTCHA, PostgREST/RLS y Storage. |

Fuentes oficiales: [selección de registro en CLI 2.76.16](https://github.com/supabase/cli/blob/v2.76.16/internal/utils/docker.go), [acción setup-cli](https://github.com/supabase/setup-cli/blob/main/src/main.ts), [Docker y runtime nativo](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes), [Compose de self-hosting](https://supabase.com/docs/guides/self-hosting/docker).

## Procedimiento recomendado para reanudar

1. Volver al workspace del chat **Desarrollo SFSTORE** y recuperar el worktree `codex/sec01-pay01-staging-preparation`, incluyendo modificados y no versionados. Si no está disponible, obtener una copia local revisable de ese trabajo y del paquete de staging. No reemplazarlo con main ni esperar que un checkout remoto recupere cambios no publicados.
2. Verificar rama, HEAD, diff, archivos nuevos, manifest de migraciones y handlers MP 410. Preservar la configuración PG15 y puertos 54331/54332 del proyecto original. Revisar `staging/README.md` y el launcher seguro; el proyecto temporal PG17 de este chat no es su sustituto.
3. Resolver la salida al CDN ECR mediante configuración soportada, conservando `public.ecr.aws` y `challenges.cloudflare.com`. Como alternativa oficial, seleccionar GHCR para esa ejecución tras confirmar sus manifiestos y destinos de descarga. Ninguna de estas modificaciones se aplicó durante el diagnóstico.
4. Comprobar Docker por socket local y el preflight del launcher. Usar solo claves locales generadas y claves públicas de prueba Turnstile autorizadas. Confirmar que no exista project-ref vinculado ni URL/credenciales de Production; restringir servicios a loopback y usar datos sintéticos.
5. Ejecutar una sola vez el launcher en el worktree recuperado. Si falla con otro destino, detenerse y registrar URL/etapa/código, sin una serie de pulls. No usar `--ignore-health-check` para declarar el entorno operativo.
6. Solo con servicios sanos, aplicar el paquete local de migraciones verificado, que ya resolvía la colisión de versiones mediante alias. Usar explícitamente destino local (`--local` en los comandos que lo admitan); no `link`, `db push`, migraciones remotas ni credenciales productivas. Confirmar antes de cualquier reset que se trata del proyecto sintético aislado.
7. Ejecutar pruebas reales de Auth anónimo/CAPTCHA de prueba, ownership/RLS/PostgREST, Storage y checkout. Probar reserva de 24h, descuento único de 25%, envío con/sin tarifa y pagos manuales autorizados. Comprobar GET/POST de ambos endpoints MP con 410 sin llamadas al proveedor; después ejecutar la suite pertinente y documentar resultados nuevos, sin reutilizar cifras históricas como certificación actual.

Este diagnóstico modifica únicamente documentación y guarda evidencia de lectura en scratch. No modifica código, Production, configuración de red ni remotos. Sin push, merge, despliegue, migraciones o nuevos intentos de descarga de imágenes.
