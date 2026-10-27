# SFSTORE — Publicación controlada

## Reglas vigentes de integración y publicación

Leer esta sección al preparar push, integración, migración o despliegue, no en tareas documentales locales rutinarias. El estado activo está en [PROJECT_CONTEXT](PROJECT_CONTEXT.md); no inferirlo del checklist histórico inferior.

La rama `main` debe representar siempre la versión de código aprobada para Production y conservar todas las funcionalidades productivas vigentes.

Antes de preparar una integración o publicación:

- Identificar el commit exacto que sirve el dominio productivo y compararlo con `main` y con el candidato. No asumir que el último deployment registrado es el activo.
- Si Production contiene cambios ausentes en `main`, preparar primero su integración, conservando las funcionalidades productivas y las directrices documentales aprobadas. No incorporar diferencias históricas que eliminen esas funcionalidades.
- Verificar el diff y ejecutar las pruebas pertinentes antes de integrar. Resolver conflictos sin descartar código productivo.
- No publicar desde una rama independiente dejando funcionalidades productivas fuera de `main` sin un procedimiento explícito de sincronización, autorizado por el propietario, que identifique commits, orden de integración, verificaciones y recuperación.
- Comprobar los disparadores automáticos de despliegue antes de publicar ramas o integrar cambios. Preparar el bloqueo temporal necesario para evitar un despliegue accidental; modificar Vercel, integrar a `main` o desplegar requiere la autorización correspondiente.
- Registrar el commit aprobado, el commit efectivamente publicado y el estado de sincronización de `main` al cerrar una publicación. No declarar completada la sincronización mientras sólo exista una rama candidata local.

Esta política no autoriza por sí sola merges, pushes, despliegues ni cambios en servicios o datos productivos.

### Corte y recuperación

Usar el runbook específico aprobado para el candidato exacto. Registrar configuración original de Ignored Build Step y deployment activo; confirmar ausencia de builds pendientes. Si el procedimiento requiere bloquear builds, hacerlo sólo con autorización específica, verificar el bloqueo antes de push/migraciones y conservar el deployment vigente. Crear/verificar el deployment sin asignar aún el dominio y promover sólo tras los controles aprobados. Restaurar el valor original (habitualmente Automatic) y comprobarlo; no asumirlo por historial.

Si falla un control, detenerse y priorizar restaurar la configuración original de Vercel; informar el estado real. Nunca improvisar SQL, repetir una transacción incierta o restaurar inventario/DB sobre ventas posteriores. Las pausas operativas, respaldo, hashes y permisos de cada corte se revalidan cuando corresponda; no se heredan como vigentes de otro corte. No crear compras/pedidos reales ni alterar stock para verificar.

Los commits puramente documentales pueden activar Vercel: sin autorización para controlarlo, conservarlos locales. Ni el commit ni un texto de continuidad constituyen autorización de push, main o despliegue.

## Checklist histórico — referencia por tema

Los ejemplos, variables, rutas, PR y pendientes siguientes son históricos. Consultar contratos/entorno vigentes antes de usarlos; no activar integraciones porque aparezcan en esta referencia.

# Checklist de produccion SFSTORE

Este documento conserva la referencia histórica de deploy y registra correcciones de documentación. No confirma la configuración activa ni autoriza cambios en Vercel/Supabase, pagos, push, merge o deploy. Esas operaciones requieren aprobación explícita; consultar [contexto](PROJECT_CONTEXT.md) y [seguridad](SECURITY_RULES.md).

## Referencia histórica de despliegue desde GitHub

- Repositorio: `Fedee17/sfstore`.
- Proyecto Vercel existente: `sfstore`.
- Rama de produccion: `main`.
- Dominio estable: `https://sfstore-ten.vercel.app`.
- Solo después de un push/deploy explícitamente autorizado, verificar la configuración activa de deployment y las respuestas GET: `/` devuelve 200 y `/api/integrations/google-sheets/product-sync` devuelve 405.
- Mantener `.env.local`, `.vercel` y los logs locales fuera de Git.

## Variables de entorno

| Variable | Requerida | Publica/privada | Donde se usa | Ejemplo de formato | Configurar en hosting |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Si | Publica | `app/layout.tsx`, `app/sitemap.ts`, `app/robots.ts`, back URLs de Mercado Pago | `https://dominio-final.com` | Si |
| `NEXT_PUBLIC_SUPABASE_URL` | Si | Publica | clientes Supabase anon, auth server, service role server | `https://xxxx.supabase.co` | Si |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Si | Publica | cliente publico Supabase y Supabase Auth | `eyJ...` | Si |
| `SUPABASE_SERVICE_ROLE_KEY` | Si | Privada | lecturas/admin server-side, ordenes, stock, Mercado Pago API routes | `eyJ...` | Si, solo server |
| `MERCADO_PAGO_ACCESS_TOKEN` | Si para Mercado Pago | Privada | crear preferencia y consultar pagos en webhook | `APP_USR-...` o token test | Si, solo server |
| `ADMIN_ALLOWED_EMAILS` | Si | Privada/config | restringe emails autorizados para `/admin` | `dueño@dominio.com,otro@dominio.com` | Si |
| `ADMIN_EMAIL` | No | Privada/config | No utilizada por la autorización actual; no es fallback | No aplica | No requerida; usar `ADMIN_ALLOWED_EMAILS` |
| `GOOGLE_SHEETS_SYNC_SECRET` | Si para sync automática | Privada | autentica `/api/integrations/google-sheets/product-sync` | cadena aleatoria extensa | Si, solo server |

Notas:
- No usar `NEXT_PUBLIC_` para secrets privados.
- `SUPABASE_SERVICE_ROLE_KEY` y `MERCADO_PAGO_ACCESS_TOKEN` nunca deben aparecer en codigo cliente.
- `GOOGLE_SHEETS_SYNC_SECRET` debe coincidir con `SFSTORE_SYNC_SECRET` en Script Properties de Apps Script y nunca usar prefijo `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_SITE_URL` debe quedar sin slash final, por ejemplo `https://sfstore.com.ar`.

## NEXT_PUBLIC_SITE_URL

Se usa para:
- `metadataBase` global.
- `/sitemap.xml`.
- `/robots.txt`.
- `back_urls` de Mercado Pago.

En produccion debe ser la URL publica final con HTTPS:

```text
https://dominio-final.com
```

## Supabase

Verificaciones:
- `lib/supabase/client.ts` usa `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `lib/supabase/auth-server.ts` usa anon key para Supabase Auth del admin.
- `lib/supabase/server.ts` usa `SUPABASE_SERVICE_ROLE_KEY` solo del lado servidor.
- El admin se protege con sesion y `ADMIN_ALLOWED_EMAILS`.
- RLS publica debe permitir leer categorias activas, productos `status = 'active'`, imagenes y atributos.
- El checkout actual intenta inserts anon en `customers`, `orders` y `order_items`; esto describe una dependencia del flujo, no una recomendación de abrir permisos. PAY-01/SEC-01 requieren revisión autoritativa y de RLS. No cambiar grants/policies desde este checklist.
- No agregar SELECT publico a datos privados de clientes.

Pendiente recomendado:
- SEC-02 en la rama de mantenimiento local elimina logs temporales de correo/allowlist y detalles libres de Auth; conserva eventos/códigos diagnósticos acotados. Está pendiente de integración y despliegue autorizados, por lo que no demuestra el estado de logs de Production.

## Mercado Pago

Verificaciones:
- `app/api/mercadopago/create-preference/route.ts` usa `MERCADO_PAGO_ACCESS_TOKEN`.
- Las `back_urls` usan `NEXT_PUBLIC_SITE_URL`.
- `app/api/mercadopago/webhook/route.ts` consulta pagos con `MERCADO_PAGO_ACCESS_TOKEN`.
- El webhook publico a configurar en Mercado Pago Developers es:

```text
https://dominio-final.com/api/mercadopago/webhook
```

Notas:
- Localhost no recibe webhooks de Mercado Pago salvo usando tunel publico, por ejemplo ngrok.
- No marcar pedidos como pagados desde el frontend.
- No descontar stock en checkout; el descuento ocurre al confirmar pago/orden segun flujo server-side.

## SEO y Open Graph

Verificaciones:
- Metadata global en `app/layout.tsx`.
- Metadata especifica en home, perfumes, mates y producto dinamico.
- `/sitemap.xml` incluye home, categorias y productos activos.
- `/robots.txt` permite tienda publica y bloquea admin, checkout, carrito y API.
- OG/Twitter usan `/logo-sfstore-horizontal.png` como fallback.

Pendiente recomendado:
- Crear una imagen OG dedicada `public/og-sfstore.png` de 1200x630 para previews mas prolijas. Hoy se usa el logo horizontal.

## Imagenes

Verificaciones:
- Logo publico: `public/logo-sfstore-horizontal.png`.
- Productos usan `product_images.url` desde Supabase Storage cuando existe.
- Placeholder visual se mantiene si no hay imagen.
- Upload admin usa bucket `product-images`.

Checklist Supabase Storage:
- Bucket `product-images` creado.
- Bucket publico si las imagenes se muestran en la tienda.
- URLs guardadas en `product_images` deben ser publicas y validas.

## Admin

Verificaciones:
- `/admin` sin sesion redirige a `/admin/login`.
- `/admin/login` funciona con Supabase Auth.
- `ADMIN_ALLOWED_EMAILS` contiene solo emails autorizados.
- Logout disponible en navegacion admin.
- No usar token por URL para acceso admin.
- No depender de `ADMIN_DEV_TOKEN`.

## Seguridad basica

Antecedente de una búsqueda anterior; no constituye una nueva verificación de secretos de Production.

Busqueda realizada sobre el codigo, excluyendo `.env*`, `node_modules` y `.next`:
- No se detectaron valores literales obvios de `SUPABASE_SERVICE_ROLE_KEY`.
- No se detectaron valores literales obvios de `MERCADO_PAGO_ACCESS_TOKEN`.
- No se detectaron patrones `sk_` hardcodeados.
- Apariciones de `password` corresponden al formulario/login admin, no a secretos hardcodeados.

Pendiente recomendado:
- No commitear `.env.local`.
- Revisar que el hosting marque secrets privados como server-only.
- Rotar claves si alguna vez se compartieron fuera del entorno seguro.

## Validacion antes de deploy

Ejecutar:

```bash
node --test tests/*.test.mjs
npm run lint
npm run build
npx tsc --noEmit
```

Registrar skips y baseline de lint; los errores corregidos en draft PR #1 aún no están integrados. Para tests completos ver los runtimes locales en PROJECT_AUDIT_2026-10-10.md. Validar aquí no autoriza desplegar.

Validar rutas:
- `/`
- `/perfumes`
- `/mates`
- `/producto/lattafa-asad`
- `/carrito`
- `/checkout?payment=transfer`
- `/checkout?payment=mercadopago`
- `/checkout/exito?order=test&number=TEST-001`
- `/checkout/pendiente`
- `/checkout/fallo`
- `/admin/login`
- `/sitemap.xml`
- `/robots.txt`

## Pendientes antes de publicar

- Configurar `NEXT_PUBLIC_SITE_URL` con dominio real HTTPS.
- Configurar webhook en Mercado Pago Developers.
- Confirmar bucket `product-images` publico.
- Revisar permisos públicos y diseño seguro del checkout mediante SEC-01/PAY-01, sin ampliar RLS unilateralmente.
- Revisar la integración pendiente de SEC-02 y confirmar política de logs antes de publicar.
- Crear `public/og-sfstore.png` 1200x630 si se quiere una preview social mas cuidada.
