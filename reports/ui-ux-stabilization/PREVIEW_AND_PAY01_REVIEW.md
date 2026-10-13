# Preview, resolución del encabezado y PAY-01

## Preview inspeccionado sin escrituras

Deployment `dpl_4hFw2vWoXWZeufiUnv5CELyF6T33`, SHA `d46b6832baeac50d9ffc00c2978fb5cf20babc5d`, rama `codex/ui-ux-stabilization`, estado READY y target Preview (`null` en API). La consulta se hizo por el conector Vercel autenticado, no navegando al checkout.

Las siete variables del proyecto están limitadas a Production: `NEXT_PUBLIC_SITE_URL`, `ADMIN_ALLOWED_EMAILS`, `MERCADO_PAGO_ACCESS_TOKEN`, `GOOGLE_SHEETS_SYNC_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SUPABASE_URL`. No hay variables de Preview ni overrides para esta rama. Sus fechas de configuración preceden al deployment. Se consultaron únicamente metadatos con `decrypt=false`; no se imprimieron valores ni se descargaron secretos o archivos de entorno. El commit no incorpora `.env` ni valores en `next.config.ts` que conecten Supabase.

**Conclusión limitada:** no se identificó una conexión a Supabase Production asignada al Preview en la configuración actual. Los clientes existentes fallan localmente antes de conectar cuando falta la URL/clave; esa condición fue probada con el entorno del proceso eliminado y URL ficticia. El Preview puede mostrar demos por el fallback ya documentado, aunque no tenga backend funcional. Eso no certifica compras.

**Límite pendiente:** el conector entrega la configuración actual, no el snapshot completo de variables del deployment histórico. La API de archivos del deployment respondió 404 por falta de árbol de archivos de esa publicación Git. No se puede certificar de forma absoluta el aislamiento histórico sólo con estos metadatos. No se ejecutó compra, registro, login, modificación de productos, pedido, API de escritura, RPC ni prueba de permisos contra Preview o Production. No se intentó demostrar seguridad escribiendo y esperando que RLS rechazara la operación.

El código desplegado conserva el checkout antiguo, que llama al cliente público para insertar clientes, pedidos e ítems. También existen funciones administrativas con service role. Si se asignaran credenciales Production a Preview, habría un riesgo real de escrituras; el target Preview y la protección de acceso de Vercel no lo impiden por sí mismos. La protección SSO observada está habilitada para deployments salvo dominios personalizados; limita acceso, pero no equivale a aislar la base.

## Prevención preparada y acotada

`vercel.json` deshabilita despliegues automáticos Git **únicamente** para `codex/ui-ux-stabilization`. Las demás ramas conservan el comportamiento predeterminado. No se cambian variables, dominios, permisos ni configuración productiva del proyecto. Referencia oficial: https://vercel.com/docs/project-configuration/git-configuration.

Esta medida previene nuevos Previews automáticos de la rama; **no retira ni modifica el deployment READY existente ni impide un deploy manual autorizado por otra persona**. La opción más sencilla para eliminar el riesgo residual de acceso a ese Preview es retirarlo desde su deployment concreto en el dashboard, previa coordinación, sin borrar el proyecto ni tocar Production. No se hace esa eliminación aquí. Si se necesita un Preview funcional, usar variables de Preview para un backend sintético separado; nunca copiar las claves Production. No se prepara ni ejecuta una migración o un proyecto Supabase desde esta tarea.

El push de `f19abe0b0a68498c649518a247af8c8e7a067f60` se verificó por API: cero deployments asociados a ese SHA y sin checks de Preview en PR #8 al consultar. El deployment antiguo sigue READY; no se declara retirado.

## Encabezado: resolución concreta sin merge

Se incorporan a la versión de UI los dos `Link` a inicio con `prefetch={false}` de PR #2 y se mantiene un único import de Link/useState. Se preservan búsqueda GET, categorías vigentes, botones táctiles/teclado, responsive, ARIA y `/ayuda`.

`site-header-pr2-resolution.patch` transforma exclusivamente el encabezado del HEAD de checkout indicado en `header-resolution-check.json` a la versión combinada. `git apply --check` aprobó sobre una copia temporal exacta de ese archivo. No se modificaron archivos del worktree del checkout ni se realizó merge. Reproducir con `node scripts/prepare-ui-header-resolution.mjs` después de refrescar la referencia de PR #2. El agente principal debe revisar y aplicar en su worktree de integración, considerando posibles nuevos cambios posteriores al SHA verificado; no sustituir a ciegas el archivo entero.

La coordinación se envió a `LOCAL SFSTORE` por solicitud explícita del usuario. Se comunicaron el patch preparado, el fallback a demos y la discrepancia de precios. No se interpreta un mensaje enviado como aprobación recibida de reglas comerciales.

La nueva simulación sobre `f19abe0` conserva conflictos textuales de encabezado y añade `vercel.json` por creación en ambas ramas. La PR #2 ya bloquea `codex/sec01-pay01-staging-preparation` y `codex/integration-sec01-pay01-storage-20261011`. `vercel-pr2-resolution.patch` conserva esas dos reglas y agrega sólo `codex/ui-ux-stabilization`; no reemplazar el archivo completo por la versión de UI. Ambos patches pasan `git apply --check` contra los archivos exactos de PR #2. No se aplican al worktree del agente principal ni a `main`.

## PAY-01: coincidencia parcial y bloqueo comercial

Los tests de PR #2 fijan precio lista **100,01**, campo legado `transferPrice` **80,03**, precio unitario PAY-01 **75,01**, dos unidades con subtotal **200,02**, descuento **50**, envío sintético **7,25** y total **157,27**. Se revisó esa evidencia de código, sin ejecutar sus migraciones ni pruebas de escritura contra Supabase.

La UI actual usa el `transferPrice` del catálogo. El caso sintético lista 100/transferencia 80 se muestra como 80, mientras PAY-01 indica 75: **no hay coincidencia general**. Corregirlo exige la decisión del agente principal sobre el contrato y la presentación del catálogo. No se cambia la política, no se sobrescriben precios y no se añade un cálculo de 25% a UI para ocultar el desacuerdo. En `component-results.json` se registra el contraejemplo como bloqueado por coordinación.

Otro problema independiente sí se corrigió: `maximumFractionDigits: 0` mostraba importes decimales redondeados. Inicio y tarjetas ahora conservan hasta dos decimales, sin modificar valores ni cálculos. El fixture donde el precio publicado ya es 75,01 muestra exactamente **$75,01**, coincidente con el precio unitario del fixture PAY-01. Este test valida presentación, no creación de pedido ni el contrato integrado completo. La ficha principal y el resumen del checkout usan archivos del agente principal: quedan señalados para revisar el mismo formato durante la integración.

## Continuidad P1 y pruebas

Fotos fallidas en tarjetas y galería ahora muestran una alternativa accesible de tamaño estable; la galería permite elegir otra foto válida. La detección incluye imágenes cuyo error ya terminó cuando React adjunta la referencia, además de `onError`. Se prueba con SVG sintético y 404 local a 320/1440 px, junto con centavos y selección de miniaturas. No se usa Storage remoto ni se cambian filas de imágenes.

Ver `component-results.json`, los logs de continuidad y `header-resolution-check.json`. El lint global sigue con sus siete errores heredados; no se ocultan reglas ni se modifican sus archivos. El código de backend, precios, inventario y pedidos permanece intacto. La integración y la validación comercial completa siguen pendientes del agente principal; mantener PR #8 en draft.
