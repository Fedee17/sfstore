# Variantes — preparación de publicación (2026-10-18)

## Estado

APTO CON CONDICIONES. Esta preparación no autoriza SQL, deploy, push ni activación de variantes reales. Rama `codex/product-variants-release-20261018`, base exacta `e1fa0de237c3dec1e246a71f4a72793e2f5848ed`. El SHA definitivo se obtiene del commit de esta rama y se registra en la evidencia privada posterior al commit, evitando una referencia circular dentro del propio commit.

El dominio `sfstore-ten.vercel.app` fue consultado en Vercel: sigue asignado a `dpl_Bwbcb7aiHqLszeEgjGYs4b5ueCLf`, READY, proyecto `prj_XSoey2X2Oyqr8O5rBT8FBidxMrKV`. La consulta de deployments filtrada por el SHA base devolvió ese mismo ID; el registro privado de la publicación anterior también certifica ese SHA. No se confundió con el deployment más reciente de otra rama.

Production de Supabase: `xspvoicelbxlmtqoiolc` (con la e). No se reutilizarán credenciales privilegiadas para nuevas consultas automáticas. El propietario abrió sesión y se ejecutó el preflight puntual en SQL Editor del proyecto confirmado. Resultado: all_checks_passed=true, dependency_mismatches=[], read_only=true y commercial_rows_read=false. Se comprobaron los diez controles de la consulta; no se ejecutó SQL de escritura. Esta lectura tiene vigencia puntual y debe revalidarse inmediatamente antes de aplicar SQL si cambia el esquema o pasa un tiempo relevante.

## Artefactos exactos

Orden estricto, sin replay del historial de migraciones:

1. `supabase/migrations/202610180001_product_families_variants.sql` — SHA-256 de bytes locales `9c4fb12a61338303e39c6e43d1966c89c2d1c2ac4ca96f10266ce9f6f73832ca`.
2. `supabase/migrations/202610180002_variant_commercial_integration.sql` — SHA-256 de bytes locales `bfa31ef392a2fc1ea16b7caaafee0ae27935433880f2ac055b318ddc494bef04`.
3. `reports/product-variants-release-postcheck-catalog-only.sql` — lectura posterior, no DDL/DML.

El manifest de staging usa hashes normalizados a LF; no confundirlos con el hash exacto del archivo aprobado. El commit guarda el contenido de Git, que puede usar LF; antes de autorizar ejecución se deberá comprobar el hash de los bytes del archivo efectivamente utilizado. No modificar silenciosamente saltos de línea de un SQL ya aprobado.

## 1. Precondiciones antes de solicitar aplicación

- Confirmar que dominio, proyecto y SHA base continúan siendo los anteriores. Si cambiaron, detener y reconciliar el diff; no incorporar main.
- Ejecutar `reports/product-variants-release-preflight-catalog-only.sql` en el SQL Editor del proyecto confirmado. Usa BEGIN READ ONLY, timeout de 10 segundos, lock_timeout de 2 segundos y ROLLBACK. Devuelve sólo checks y nombres de contratos divergentes, sin filas comerciales ni cuerpos de funciones.
- Exigir `all_checks_passed=true`: firmas/definiciones normalizadas, tablas/columnas/constraints/índices/triggers, propietarios, RLS/políticas, ACL y permisos efectivos del conjunto dependiente. Verifica roles públicos sin privilegios elevados ni membresías privilegiadas y service_role con bypass RLS esperado. Los objetos nuevos deben estar ausentes. Un project_label es una etiqueta esperada, no una prueba independiente de destino.
- La referencia se construyó con el esquema público capturado y certificado, SQL 01/04a ya aprobados y el contrato de ventas físicas publicado. No contiene datos reales. Si el preflight detecta diferencias, investigarlas, sin adaptar las migraciones para pasar una guarda.
- Confirmar que nadie creará familias, asociará SKU ni editará el catálogo durante la ventana. No activar variantes en el SQL Editor. Las ventas de productos simples pueden continuar; se recomienda baja actividad y pausa operativa breve de edición/importación de productos.
- Revisar el candidato limpio, diff exclusivamente de variantes, hashes, pruebas y scan de secretos. No publicar archivos staging/runtime, .env, respaldos o capturas privadas.

## 2. Respaldo previo (requiere autorización de lectura y acceso seguro)

Existe `STORE_SALES_POSTGRES_20261017T174322068Z`, certificado COMPLETE_SCOPED_RECOVERABLE el 17/10, con restauración transaccional aislada y hash del dump comprobado nuevamente durante esta fase. No es una certificación de los datos actuales ni de recuperación de todo Supabase.

Antes de aplicar los deltas obtener un NUEVO dump PostgreSQL con el auxiliar privado existente; contraseña sólo en entrada oculta/memoria, TLS verify-full, destino privado nuevo. Comparar integridad y restaurar en un contenedor PostgreSQL aislado; verificar esquema, filas y cantidades sin imprimir datos personales. Conservar el original. No restaurar en Production.

Cobertura necesaria: public completo, funciones, ACL, políticas, propietarios y catálogo de roles recuperable; referencias de esquemas administrados documentadas. Excluye credenciales/sesiones de Auth, Vault, contraseñas de roles y configuración externa. No equivale a restaurar todo el proyecto. Estos deltas no modifican Storage ni sus archivos; no requieren redescargar imágenes para revertir un DDL aditivo. La recuperación de archivos frente a otra clase de incidente necesita su copia separada, y no queda certificada por el dump.

Si el catálogo sigue cambiando después del respaldo, no restaurar un snapshot viejo sobre nuevas ventas: el plan normal de incidente es mantener datos y reparar hacia adelante. Evaluar la antigüedad y cambios posteriores inmediatamente antes del SQL. Detener si no hay cobertura adecuada.

## 3. Aplicación autorizada y transición

Preparar primero el build del SHA candidato, sin promover ni exponer un Preview conectado a Production para pruebas de escritura. Toda creación de deployment, protección y promoción requiere autorización aparte.

Elegida: esquema aditivo con productos simples, seguido de despliegue, SIN versión puente ni activación de familias durante la ventana. Los dos deltas añaden tablas/columnas/triggers/vista, pero no agrupan productos existentes. La vista nueva requiere 002 antes de promover el código nuevo.

Tras autorización explícita aplicar íntegramente 001 una sola vez y confirmar COMMIT. Luego 002 una sola vez y confirmar COMMIT. Cada archivo usa transacción, lock_timeout=5s y statement_timeout=30s. ALTER TABLE requiere locks que pueden demorar consultas hasta el timeout: ejecutar con baja actividad. Un fallo revierte ESE archivo, no el archivo anterior ya confirmado. No unirlos mediante un wrapper que altere sus transacciones ni reintentar automáticamente.

Si 001 falla: detener, comprobar que no hay instalación parcial. Si 002 falla después de 001: no desplegar el código nuevo; el código anterior sigue compatible con 001 para productos simples. Investigar antes de autorizar un reintento. No borrar columnas o funciones para improvisar un rollback.

La etiqueta comercial de 002 sólo se recalcula para SKU ya asociados. Dado que en esta transición no habrá familias previamente activadas, no afectará productos simples. No se actualizan precios, costos ni stock, ni se reasignan pedidos o compras históricas. No existen nuevos movimientos de inventario por migrar.

## 4. Postcheck y despliegue

Ejecutar el postcheck de lectura y exigir `all_checks_passed=true`. Compara definiciones, ACL, propietarios, RLS y permisos efectivos contra el resultado ensayado, incluidos helpers, tablas privadas y vista pública. No ejecuta RPC ni consulta filas comerciales.

Promover sólo el SHA candidato revisado cuando ambos deltas y el postcheck hayan aprobado. Verificar el ID del deployment y su asignación real al dominio. No hacer merge a main como atajo ni activar workflows de auditoría/Cron.

Verificar mediante navegación y lectura, sin crear operaciones ficticias en Production: catálogo de simples, ficha, búsqueda, carrito anterior, checkout sin enviar compra, login/admin autorizado, formularios de compras y ventas sin confirmar, historia y Analytics, y administrador de familias vacío. La prueba comercial de variantes de esta fase ya se hizo con datos sintéticos locales.

## 5. Productos reales y conciliación

NINGÚN producto se convierte automáticamente en familia. products.id sigue siendo inventario y referencias históricas. No se distribuye stock. Todos los productos que se deseen agrupar requieren una decisión explícita de opciones y conciliación si el stock existente no está separado por SKU. En particular, el Termo Stanley 1L — Pico MateSystem real queda pendiente de conciliación por color; no se presume su composición ni cantidades.

La activación de familias reales es una etapa posterior autorizada: definir opciones, conciliar SKU existentes/nuevos, conservar costos/stock/referencias y precio de cada SKU como excepción al asociarlo, decidir luego herencia explícita. Los nuevos SKU nacen en borrador, stock 0 y costo NULL. No sustituir historia sin snapshots por datos actuales.

## 6. Recuperación segura

- Antes de crear/asociar variantes reales, el deployment previo e1fa0de es compatible con el esquema aditivo: se puede solicitar rollback de Vercel conservando SQL y datos. Debe confirmarse que no se activaron familias ni flags de visibilidad/bloqueo; el código viejo no entiende esos flags.
- Después de activar variantes reales, NO volver directamente al catálogo viejo: podría duplicar publicaciones e ignorar visibilidad. Conservar versión compatible, detener edición de familias y corregir hacia adelante. Si se necesita pausar compras, requiere la autorización operativa correspondiente y el mecanismo existente; esta preparación no ejecuta SQL 06.
- No restaurar toda la base ni borrar snapshots como respuesta automática a un fallo de UI. Una restauración es último recurso, con autorización y reconciliación de operaciones posteriores al dump.
- Ante error o resultado incierto detener promoción/aplicación, conservar evidencia sanitizada y verificar estado real antes de reintentar.

## Pruebas y decisiones pendientes

Rehearsal específico PostgreSQL 17.6: 7/7 aprobado sobre metadatos productivos y datos sintéticos; permisos/grants y RLS previos se mantienen, catálogo y payloads de venta/checkout anteriores funcionan, reservas previas liberan exactamente una vez, lock timeout y fallos antes de COMMIT no dejan cambios parciales. Las pruebas de Fases 1/2 cubren herencia/excepciones, SKU bloqueados, concurrencia por última unidad, carritos e historia.

La lectura productiva puntual quedó aprobada. Pendientes para autorizar publicación: respaldo reciente certificado y aprobación explícita de ambos SQL y del SHA candidato. No son necesarias nuevas funcionalidades ni reservas. El inventario real por color requiere conciliación antes de su activación, no bloquea publicar el soporte con catálogo simple.


### Controles del candidato

Instalación limpia con npm ci aprobada, sin cambios de dependencias. Suite general: 864 PASS, 0 FAIL, 13 SKIP opt-in; rehearsal productivo sintético específico: 7/7 PASS. Build, TypeScript y ESLint aprobados (nueve advertencias de imágenes, cero errores). La validación final del SHA y el arnés UI se registran en evidencia privada, fuera de Git. El preflight productivo aprobó mediante SQL Editor del proyecto confirmado, sin datos comerciales ni cuerpos de funciones en el resultado.


### Cierre de lectura productiva y corrección de referencia

El primer preflight señaló únicamente get_product_save_version(uuid) y save_purchase_draft(uuid,uuid,date,numeric,text,uuid,jsonb). La lectura puntual de hashes, propietarios, configuración y ACL demostró que la copia local del esquema tenía CRCRLF en los cuerpos de esas dos funciones (8 y 177 caracteres CR duplicados), mientras Production tiene CRLF. El hash tras quitar CR coincide para cada definición; el hash local después de normalizar una vez CRLF coincide con el hash RAW de Production. No se detectó diferencia de lógica ni de permisos.

Se preservó el original y se corrigió únicamente una copia privada del bloque CREATE FUNCTION de esas dos definiciones, quitando el CR duplicado. No se cambió ninguna función productiva ni el algoritmo de guardas para ignorar diferencias. El rehearsal 7/7 volvió a aprobar con la referencia corregida y regeneró sólo las huellas esperadas de pre/postcheck. El segundo preflight productivo completo aprobó todos los controles, incluidas tablas/ACL/roles/membresías/permisos efectivos.

Evidencia privada en staging/runtime/variants-release/production-preflight-private.json y reference-correction-private.json. Las migraciones 001 y 002 conservan exactamente los SHA-256 indicados arriba. El soporte de variantes todavía no fue publicado ni activado.
