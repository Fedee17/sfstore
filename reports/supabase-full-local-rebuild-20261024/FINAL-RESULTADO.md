# Validación final de reconstrucción Supabase local

24/10/2026. Candidato basado en `7aacef23538375d6b26f05df3da0e7aae53db68b`. **APROBADO para reconstrucción local de bases vacías.** No es una migración de actualización productiva.

## Resultados

Se conservan las [73 pruebas PostgreSQL y la comprobación estática aprobadas](../explicit-grants-rebuild-20261023/RESULTADO.md), sin repetirlas. La validación adicional con servicios reales aprobó siete comprobaciones de integración (ocho tests Node contando el principal), sin fallos ni omisiones:

1. Salud de Auth y servicios, con la API publicada exclusivamente en localhost.
2. Usuario ficticio example.invalid y sesión real mediante OTP administrativo, con identidad verificada por Auth.
3. Catálogo público por PostgREST para anon y authenticated; proyección de SKU correcta y ofertas vacías en este seed.
4. Acceso denegado a pedidos, clientes, pagos, compras, configuración, recetas, costos y RPC de expiración para roles públicos.
5. Configuración legible por service_role y RPC create_checkout_atomic alcanzable: entrada inválida rechazada por el contrato, sin crear pedidos.
6. Storage real: subida/descarga de PDF sintético con contenido idéntico; acceso y listado privados denegados a anon/authenticated; URL firmada válida accesible; ausencia de firma o firma inválida rechazadas.
7. Catálogo disponible después de las operaciones Auth/Storage.

Sintaxis Node y ESLint del ejecutor aprobados. No se requiere build Next.js: no hay cambios de aplicación. No se repiten compras, pagos, concurrencia ni stock ya validados.

## Aislamiento reproducible

El [ejecutor Compose](../../tests/supabase-rebuild-compose-local.test.mjs) es opt-in. Reutiliza imágenes oficiales locales de public.ecr.aws/supabase: postgres 17.11.0.004, gotrue v2.197.0, postgrest v16.4, storage-api v1.79.36 y kong 2.8.1. No descarga imágenes (pull_policy: never), ejecuta CLI ni lee configuración o credenciales productivas.

Genera un proyecto UUID, configuración y claves exclusivamente sintéticas bajo staging/runtime ignorado por Git. Antes de arrancar valida docker compose config y crea los cinco contenedores detenidos: inspecciona sus bindings y redes; cualquier puerto distinto de 127.0.0.1 detiene el ensayo. No hay modo host, privilegios adicionales ni socket Docker montado.

PostgreSQL, Auth, PostgREST y Storage no publican puertos y comparten una red interna propia. Kong utiliza además un puente propio y publica un único puerto aleatorio explícitamente en 127.0.0.1. Verifica el binding efectivo antes de las pruebas HTTP. Esto garantiza acceso entrante por localhost; no se afirma aislamiento de salida a Internet del gateway. No se modifican Docker Desktop global, firewall o contenedores anteriores.

Los 37 archivos de staging se aplican con hashes verificados y seed sintético existente. Las fuentes SQL canónicas y schema.sql permanecen idénticos a main; no se añaden grants comerciales para aprobar. Auth y Storage inicializan sus propios esquemas internos. La disponibilidad de PostgreSQL se espera por TCP dentro del contenedor, evitando confundir su servidor temporal initdb con el arranque final. Las contraseñas de roles internos se inicializan sólo dentro de la base nueva sintética.

Storage utiliza su propia validación de JWT/firmas; su ruta Kong sigue el criterio de la plantilla oficial, sin exigir API key adicional a las URLs firmadas. No se cambia RLS ni la matriz de permisos para esa adaptación.

Al terminar, down --volumes --remove-orphans elimina sólo su proyecto. Limpieza comprobada: cero recursos sfstore-rebuild restantes; diez contenedores previos continúan funcionando. El [resultado agregado](compose-results.json) no contiene claves, DSN, datos personales ni registros comerciales.

## Reproducción

En PowerShell, desde la raíz del candidato, usando Docker existente:

```powershell
$env:SFSTORE_COMPOSE_LOCAL_REBUILD = 'true'
$env:SFSTORE_TEST_DOCKER = (Get-Command docker).Source
node --test tests/supabase-rebuild-compose-local.test.mjs
```

Requiere Docker Desktop con Compose y las cinco imágenes indicadas ya descargadas. El ejecutor está limitado al motor local de Windows; no acepta conexión remota ni reinicia el stack existente. No se necesita supabase db reset, enlace a proyecto, credenciales productivas ni cambio de configuración global.

## Límites y publicación de esta corrección

Esta validación comprueba la reconstrucción y sus permisos vía Auth/PostgREST/Storage. No certifica Turnstile real, correo externo, login administrativo Next.js ni una nueva compra comercial completa. CAPTCHA queda configurado; la sesión de prueba se obtiene mediante OTP administrativo sintético. Los escenarios comerciales PostgreSQL previamente aprobados siguen siendo evidencia separada.

No incorporar el ejecutor CLI fallido ni sus logs/configuración; la vía reproducible es Compose. Los intentos anteriores se conservan sólo localmente. El historial separado supabase/rebuild es exclusivo de bases vacías; no aplicar sobre Production, restauraciones o proyectos existentes, ni reparar sus versiones aplicadas. La colisión canónica permanece resuelta únicamente en las copias de staging mediante su alias documentado.

La rama tiene deploymentEnabled=false en vercel.json para impedir la Preview automática al publicarla. No se integra main ni se promueve una aplicación por este PR. Sin push de migraciones remotas, cambios de Production, precios, inventario, datos reales ni credenciales existentes.

Fuentes primarias de la adaptación:
- https://supabase.com/docs/guides/self-hosting/docker
- https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/commands/start/templates/kong.yml.ts
- https://github.com/supabase/cli/blob/v2.120.0/apps/cli-go/internal/db/start/start.go
