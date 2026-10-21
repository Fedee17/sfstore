# Publicación acotada de cargadores y combos — revisión

Estado: procedimiento actualizado el 21/10/2026, **sin autorización de ejecución productiva**. Rama `codex/charger-components-release-20261020`. Candidato funcional aprobado: `9b2ebb06a2765d8e35a13a84bd35b83ab4c8fd6e`, que incorpora las cinco presentaciones sobre la base `84651ee`. El paquete final parte de `3dc2e92fefd992cdea304c78c65262b557e463c5` e incorpora la corrección conjunta versionada de seguridad; su commit final se registra al entregar. Requiere autorización específica del candidato final y de la tercera migración antes de publicar. No se realizó push, merge, despliegue ni cambio productivo.

## Base y alcance

Se consultó el alias real `sfstore-ten.vercel.app`: deployment activo `dpl_6rrP8EnsEJbYmHvKH1kua8zRgBHU`, estado READY, commit `a097ba7af78d55f55bf1fa06636119f9daa4e4a5`. No se dedujo desde la lista de deployments recientes.

El `main` remoto y local está en `a892129e25132e261bf9e7d0831410e82abe7769`; sus archivos funcionales coinciden con esa versión productiva y las diferencias son documentación aprobada. La rama candidata parte del siguiente commit documental `a2ba2b3` y aplica únicamente los cuatro cambios de cargadores `053aebf`, `e429ab7`, `259d83e`, `08f2a28`, excluyendo las dos entregas de rentabilidad `f2de281` y `348281e`. Se conservan los tres documentos maestros y sus referencias; no se cambian las pantallas/formularios por mejoras de rentabilidad.

Los cambios funcionales abarcan Compras (simulación/recepción por conector), selección en mostrador, oferta pública, carrito/checkout, detalle de pedido y servicios correspondientes. Se añaden las dos migraciones de componentes/precios y la tercera migración conjunta de seguridad, pruebas y documentación de ese alcance. La ruta Productos solo añade el enlace a componentes; el editor de producto y los paneles de rentabilidad no se incorporan. El listado exacto se entrega en `reports/charger-release-files.txt`.

## Evidencia reutilizada

El preflight del 20/10 a las 10:19 de Argentina y el respaldo `CHARGERS_POSTGRES_20261020T131514368Z` están aprobados. Proyecto: `xspvoicelbxlmtqoiolc`. El respaldo privado está fuera del repositorio y certificado como COMPLETE_SCOPED_RECOVERABLE: 32 tablas COPY, 2.502 filas y 895 entradas estructurales; no es copia integral de Supabase/Auth/archivos Storage. Las cinco funciones base coinciden con la migración preparada. No se repiten capturas generales ni esas pruebas.

Las 865 pruebas de aplicación, 56 PostgreSQL y 12 del circuito Auth/PostgREST previamente aprobadas se conservan como evidencia de desarrollo. Para este candidato se ensayan específicamente los SQL de corte y recuperación, y la compilación/tipos tras separar rentabilidad. No se presentan pruebas omitidas como aprobadas.

## Artefactos de revisión y parámetros

- `202610190001_component_inventory.sql` y `202610200001_component_combo_pricing.sql`: contratos ya ensayados, sin semillas ni configuración real automática.
- `reports/charger-release-hold-review.sql`: bloqueo comercial temporal de cinco identidades afectadas (fuente, cabezal, presentación, cable histórico y otro artículo de la compra cuyo costo se reclasifica). No modifica stock, precios ni permisos; el resto del negocio continúa. El otro artículo debe bloquearse para impedir movimientos que invaliden el prorrateo aprobado de las 49 piezas.
- `reports/charger-release-configure-review.sql`: configuración, conversión y precios en una sola transacción; solo al confirmar se vuelve visible el estado coherente.
- `reports/charger-release-release-hold-review.sql`: recuperación del bloqueo **únicamente antes de una conversión** y con stock/costos/precios originales intactos. Después de convertir, se detiene y requiere revisión.
- `scripts/prepare-charger-release.mjs`: renderiza offline, no abre conexiones. Exige manifiesto, mapeo, siete productos y salida en runtime ignorado; no sobrescribe archivos. Las copias vinculadas a Production y sus hashes quedan en `staging/runtime/charger-release-private/`, con ACL restringida al usuario y SYSTEM, fuera de Git.

Los cuatro IDs existentes (fuente, cabezal, presentación, cable histórico) y la compra provienen de la captura aprobada. Los **dos nuevos IDs de cables y el ID de receta se generan mediante INSERT RETURNING en PostgreSQL**. Los códigos nuevos propuestos `SFSTORE-CHARGER-CC` y `SFSTORE-CHARGER-LIGHTNING` son altas futuras, no identidades supuestamente existentes. Una colisión de código, slug o nombre exacto detiene la operación; no se reutiliza un producto ambiguo.

El actor de configuración es obligatorio: UUID real del operador autorizado, suministrado en la misma sesión de ejecución mediante `sfstore.charger_actor`. La identidad ya se verificó mediante lectura de Auth y coincidencia única con la allowlist administrativa; la evidencia y el UUID se conservan en privado. No se usa el creador histórico como si fuera el ejecutor. Las copias de revisión se niegan a operar si no se suministra. El manifiesto sigue indicando `operatorBound=false`: falta suministrar ese parámetro al ejecutar, sin editar los bytes de los SQL aprobados; no falta una decisión comercial de precios o costos.

Las copias privadas contienen la captura aprobada como manifiesto y el mismo cuerpo SQL parametrizado ensayado con fixtures sintéticos. El ensayo no utiliza ni modifica registros reales: valida la transacción y sus guardas, no certifica que la captura siga vigente indefinidamente. No ejecutar las plantillas sin el renderizador: carecen deliberadamente del manifiesto.

## Orden de ejecución futuro — requiere autorización específica

1. Confirmar el alias/commit, candidato y hashes; preparar integración a main sin build automático no autorizado, mediante el control de Vercel descrito abajo. Revalidar las precondiciones inmediatas antes de ejecutar; si cambió el inventario, detenerse. Verificar integridad y vigencia del respaldo certificado, sin sobrescribirlo. Una captura del 20/10 no demuestra por sí sola la vigencia productiva del 21/10.
2. Aplicar únicamente la migración de componentes. Ejecutar `component-combo-pricing-preflight-read-only.sql` y comprobar cinco contratos y permisos efectivos. Si una guarda falla, detenerse. Aplicar únicamente la migración de precios.
3. Antes de publicar código, verificar las huellas de ambas vistas y los metadatos normalizados contra la evidencia aprobada; aplicar una sola vez `supabase/migrations/202610210001_public_catalog_component_security.sql`, con el hash exacto indicado abajo. Ejecutar `reports/catalog-component-security-postcheck-read-only.sql`: todos los booleanos deben ser verdaderos; cero ofertas es correcto antes de configurar. Detenerse ante cualquier diferencia. No aplicar el antiguo SQL de catálogo por separado ni omitir guardas. Verificar nuevos objetos/ACL/RLS y publicar únicamente el código compatible del candidato final autorizado mediante el protocolo aprobado de main/Vercel, conservando en main las funcionalidades productivas y los documentos maestros. **No publicar antes de las tres migraciones y su postcheck:** los lectores nuevos necesitan las tablas/vista. Con recetas vacías los productos simples conservan sus contratos; no activar la oferta de combo con la interfaz anterior. Las dos fichas virtuales aparecerán después de la configuración del paso 5: su ausencia antes de configurar no autoriza crear otros productos, recetas o stock.
4. Confirmar pausa operativa de recepción/edición de los SKU afectados y ejecutar la copia exacta de bloqueo aprobada. Comprobar `commercial_blocked=true` en los cinco SKU. Pestañas antiguas y RPC se rechazan por las guardas existentes; ocultar un botón no es la protección. No pausar globalmente el checkout ni los SKU ajenos.
5. Ejecutar una vez la copia de configuración con actor y hashes revisados. Usa advisory lock por compra, locks ordenados de productos y precondiciones de compra, líneas, costos, precios, movimientos, reservas y pedidos posteriores. Crea solo dos cables en cero/borrador, registra la receta, convierte con huella verificada y aplica precios/aprobaciones. Falla todo o confirma todo. La compra, líneas y movimientos originales se conservan; los ajustes y residuales son auditables.
6. Antes del COMMIT se exige fuente 0, cabezal 21, C/C 10, Lightning 10, cable histórico 0, presentación 0 y otro lote 9. El cabezal conserva la apertura/costo histórico y recibe el costo vigente ponderado; no se inventa costo cero ni se duplica envío. El cable USB-A/C y el otro cargador ajeno se preservan.
7. En esa misma confirmación se fijan lista/transferencia: cabezal 22.000/16.500; cables 15.800/11.850; regla de combo 30.666,67/23.000. Se registran aprobaciones idempotentes y se liberan solo los bloqueos correspondientes; fuente/presentación/cable histórico quedan sin venta simple. No hay stock independiente de combo, ni suma de precios individuales ni segundo 25%.
8. Repetir `reports/catalog-component-security-postcheck-read-only.sql` y confirmar dos ofertas de la receta retornada. Verificar mediante lectura el resultado, IDs devueltos, auditoría única, precios calculados, stocks, compra original y oferta de ambos conectores. Completar la lista de ambas publicaciones descrita abajo. No crear pedidos de prueba sin otra autorización. Reanudar operaciones afectadas después de verificar y restaurar Vercel según su procedimiento.

No se copian fotografías del cable genérico a conectores no comprobados. Los cables nuevos y las publicaciones virtuales usan la presentación honesta de ausencia de foto hasta disponer de material verificado. Esta experiencia ya fue revisada localmente; no equivale a certificar fotografías reales todavía no aportadas.

## Control de despliegues y restauración de Vercel

La consulta visual autorizada del 20/10/2026 a las 23:36:19 UTC confirmó **Ignored Build Step: Automatic**, en el proyecto `sfstore`. La evidencia está en el registro privado `vercel-control-readonly-20261020T233619735Z.json`. La API consultada omitía ese campo: no se interpreta su ausencia como valor `null`. El deployment y el dominio indicados en Base son la última evidencia, no una nueva comprobación de este cambio documental.

Antes de cualquier push o integración, con autorización específica:

1. Registrar nuevamente el valor visible, el deployment servido por el dominio y los builds pendientes. Si el original ya no es `Automatic` o existe una diferencia no aprobada, detenerse.
2. En Settings → Build and Deployment → Ignored Build Step, seleccionar **Don't build anything**, guardar y comprobar el valor persistido antes de continuar. No cambiar dominios ni alias. Este bloqueo afecta nuevos builds automáticos; no cancela builds en curso ni impide despliegues manuales o promociones. Resolver cualquier cola inesperada antes del corte.
3. Mantener el bloqueo durante las migraciones y la integración autorizadas. Publicar únicamente el candidato autorizado por el mecanismo explícito acordado; no usar la restauración de Automatic como disparador implícito del lanzamiento.
4. Cuando hayan terminado los pushes/integración y no quede una cola inesperada, restaurar exactamente **Automatic**, guardar y releer el valor. No sustituirlo por un comando personalizado. Comprobar que el dominio conserve el deployment aprobado y que no haya sido reemplazado por un build automático inesperado.
5. Ante un fallo, detener la integración y priorizar restaurar la configuración original; no improvisar despliegues. El cambio de Ignored Build Step por sí mismo no reemplaza el deployment que sirve el dominio.

No se modificó esta configuración durante la preparación local.

## Verificaciones posteriores: cinco presentaciones y dos URL

El ID comercial existente de la presentación es `1e6c42e4-08af-4ed7-ad01-95fb22e13c4a`. Las siguientes rutas son proyecciones de ese ID y del conector, no nuevos SKU físicos. Comprobarlas **después** de desplegar el código y confirmar la configuración/conversión:

| Presentación | URL esperada | Lista | Efectivo/transferencia |
|---|---|---:|---:|
| Cargador completo USB-C a USB-C | https://sfstore-ten.vercel.app/producto/combo-1e6c42e4-08af-4ed7-ad01-95fb22e13c4a-cc | $30.666,67 | $23.000 |
| Cargador completo USB-C a Lightning | https://sfstore-ten.vercel.app/producto/combo-1e6c42e4-08af-4ed7-ad01-95fb22e13c4a-lightning | $30.666,67 | $23.000 |

- Catálogo y búsqueda: dos tarjetas con nombres y enlaces propios, junto con cabezal ($22.000 / $16.500) y los dos cables ($15.800 / $11.850 cada uno). Cinco presentaciones; no duplicar físicamente el cabezal o los cables ni crear otra receta. La presentación anterior no puede venderse como un producto simple con stock propio.
- Cada URL debe cargar su conector explícito, precio, disponibilidad derivada del cabezal y cable elegidos y placeholder correcto si falta foto. No exigir elegir nuevamente el conector para saber qué producto se compra. Revisar en móvil y notebook, sin publicar imágenes no verificadas.
- Carrito y resumen de checkout: agregar una unidad desde cada ficha conserva dos líneas diferenciadas y sus enlaces, total de referencia por transferencia **$46.000**; no aparecen componentes como cargos extra ni otro 25% de descuento. No enviar el formulario, crear sesiones de invitado ni pedidos sin autorización de prueba específica. Si una comprobación exige esos efectos, documentarla como pendiente; no eludir Auth/CAPTCHA. Retirar únicamente esos artículos del carrito de revisión al terminar.
- Mostrador: búsqueda de ambos nombres, previsualización de una unidad a $23.000 en efectivo/transferencia y $30.666,67 con débito/crédito/QR/otros, sin confirmar una venta. Compras: composición por conector disponible, sin confirmar recepciones de prueba.
- Base de datos, solo lectura: una receta, dos ofertas por conector, aprobación de precio vigente, trazabilidad única y saldos de la conversión 21 cabezales / 10 C/C / 10 Lightning al confirmar. Los movimientos legítimos posteriores pueden cambiar esos saldos: investigar cualquier diferencia, nunca restablecerlos manualmente. Los dos combos comparten cabezales; sus disponibilidades no se suman como stock independiente.
- Compra original, movimientos originales e historial intactos; stock propio del combo en cero. Los carritos anteriores de componentes separados siguen cobrando sus precios individuales: no convertirlos ni aplicarles un descuento de combo automáticamente.
- Si falla una URL, aparece un conector/precio incorrecto o una inconsistencia de disponibilidad, detener la habilitación de los artículos afectados y utilizar la recuperación según el estado de conversión. No volver a ejecutar la conversión ni reabrir permisos como solución. Cualquier bloqueo o corrección productiva requiere su autorización correspondiente.

## Detención y recuperación

- Error, timeout o conexión incierta: detenerse; comprobar operación por ID de compra, receta y auditorías antes de cualquier reintento. El reintento confirmado devuelve IDs existentes y **no restablece stock/precios**, incluso después de ventas.
- Falla de configuración: se revierte creación de cables, receta, conversión, costos, precios y auditorías de esa transacción. El bloqueo separado permanece. El resto del negocio sigue funcionando; no reparar a mano ni ejecutar de nuevo sin comprobar el estado.
- Antes de convertir, la copia de recuperación puede restaurar únicamente los flags originales si todos los valores críticos coinciden y no existe receta/conversión. Requiere aprobación; si hay deriva se mantiene el bloqueo.
- Después de convertir o vender, no utilizar esa recuperación ni volver ciegamente al código anterior. Mantener esquema/código compatibles y pausar las ofertas afectadas; corregir hacia adelante con revisión. `reverse_component_conversion` mantiene sus restricciones de ausencia de actividad posterior y autorización aparte; no es un rollback automático del lanzamiento ni restaura precios por sí solo.
- El rollback de Vercel no revierte PostgreSQL. No eliminar tablas/columnas nuevas ni restaurar datos actuales desde el respaldo como atajo.

## Verificación visual

El incidente de Windows se resolvió y la revisión autorizada se completó en entorno local sintético con Next.js, PostgreSQL 17.6 descartable, PostgREST y Auth. Se verificaron cinco tarjetas, ambas fichas, búsqueda, carrito/checkout con ambos conectores y mostrador, en notebook 1366×900 y móvil 390×844. Las capturas y la integridad de evidencia se conservan en `staging/runtime/charger-release-private/five-presentations/`. No se generaron pedidos durante la revisión visual. Se revisó ausencia honesta de fotografías; las fotos reales verificadas son una mejora pendiente, no una asociación supuesta.

## Resultados del candidato limpio

- Instalación desde lockfile con `npm ci --no-audit --no-fund`; package.json y package-lock.json sin cambios. No se aprobaron scripts adicionales ni se cambió configuración global.
- `npm run build`, `npx tsc --noEmit`, ESLint focalizado y `git diff --check`: aprobados. La primera compilación no pudo resolver un enlace local de node_modules fuera de la raíz de Turbopack; se retiró solo ese enlace del nuevo worktree y se hizo la instalación limpia.
- **9/9 pruebas PostgreSQL17.6 específicas del corte**, sin fallos ni omisiones: bloqueo de mostrador y carrito antiguo, creación y conservación, reintento después de una venta, actor/bloqueo obligatorios, deriva de stock/colisión, rollback posterior a conversión, recuperación de bloqueo, rechazo de recuperación después de convertir y dos ejecutores concurrentes. Los fixtures son sintéticos; no se omitieron guardas para hacerlos pasar.
- La suite general previa no se repitió. La revisión de cinco presentaciones añadió 64/64 pruebas afectadas aprobadas, build y TypeScript aprobados, ESLint sin errores y dos avisos preexistentes de imágenes. Los recursos propios de los ensayos se retiraron. Esta actualización documental no repite esas pruebas.
- Vercel: `Automatic` confirmado visualmente; evidencia y procedimiento de restauración exacta en la sección de control de despliegues. No se modificó.

### Hashes de revisión (bytes LF)

- `supabase/migrations/202610190001_component_inventory.sql`: `3b65067ecb22003431606f7a667863d91c68068632c71134c96c96ea2bb2c394`.
- `supabase/migrations/202610200001_component_combo_pricing.sql`: `b8cf692d065d3fd593e232c6d6ce04f06759201e2cd01418e61deadb20d727ea`.
- `supabase/migrations/202610210001_public_catalog_component_security.sql`: `35621d198d6e1fc6b1a5bf508fe35842cfd2aef1dd5badf41b0715aa69dd4b5e`.
- `reports/catalog-component-security-postcheck-read-only.sql`: `4db4efbdc91768100e30c4edd9a4a5921e9c08cde0cb00a3bc4e14556a5fccd3` (consulta posterior, no migración).
- `reports/charger-release-hold-review.sql`: `aa44c7d40a3150a05c63ec06fb1a7350ddd4aa6580fa6e4e02aa4c25763c041b`.
- `reports/charger-release-configure-review.sql`: `c5d5e1a10043644ca15725221c606b1d698276e3958d32e409786918ab4f4018`.
- `reports/charger-release-release-hold-review.sql`: `c8517263038fd5d6abb84da004cba8de45206ba6fedca66688359d9f58f4888f`.

Los hashes de las tres copias privadas vinculadas al manifiesto del preflight están en `staging/runtime/charger-release-private/artifact-hashes-private.json`. No confundirlos con las plantillas: ejecutar solo un archivo exacto, revisado y autorizado, con el actor real identificado. No se afirma que la copia productiva con sus valores particulares se haya ejecutado contra Production; se ejecutó el mismo cuerpo parametrizado con fixtures sintéticos.

Los cinco hashes originales de componentes/precios/bloqueo/conversión/recuperación corresponden a los blobs Git con bytes LF del candidato aprobado. Algunas copias de trabajo usan CRLF y no tienen el mismo hash bruto: no ejecutarlas como si coincidieran. Preparar la copia de ejecución desde el blob aprobado, sin reformatear ni sobrescribir archivos anteriores, y exigir SHA-256 exacto antes de usarla. La comparación normalizada sirve para detectar diferencias de saltos de línea; no reemplaza la verificación de bytes del archivo ejecutado. Las tres copias privadas se verifican por tamaño y SHA-256 bruto de su manifiesto. Los cinco SQL originales y las tres copias privadas no se modificaron. La corrección conjunta se añade como tercer archivo independiente, con los mismos bytes LF del artefacto validado.

Cierre inicial de `84651ee`: 57 archivos respecto de main. El candidato funcional `9b2ebb0` contiene 67 rutas respecto de ese mismo main, incluidas las publicaciones y pruebas focalizadas; el manifiesto actualizado del paquete final está en `reports/charger-release-files.txt`. Rentabilidad excluida; editores de producto/familia sin las mejoras ajenas. Los tres SQL privados conservan los cuerpos ensayados, con el manifiesto privado vinculado. Gitleaks sobre el diff: sin secretos detectados. Las migraciones conservan los bytes LF del commit validado.


## Actualización comercial del 21/10/2026 — cinco presentaciones

El propietario confirmó tres artículos físicos y dos publicaciones diferenciadas de cargador completo, una por conector. La receta y los contratos SQL anteriores no cambian. Las dos publicaciones virtuales se derivan de las ofertas existentes, con tarjeta, URL, búsqueda y selección de mostrador propias, sin stock independiente. Ver `docs/CHARGER-COMMERCIAL-PRESENTATIONS.md`.

La revisión visual inicialmente bloqueada se completó localmente en notebook y móvil con PostgreSQL descartable, PostgREST y Auth. Las fotografías reales continúan pendientes; se revisó el placeholder honesto. Se incorporaron las dos correcciones de presentación previamente pendientes y el texto mal codificado de relacionados. No se modificó Production. El candidato funcional identificado es `9b2ebb06a2765d8e35a13a84bd35b83ab4c8fd6e`, aprobado funcionalmente por el propietario; `84651ee` es la base y no contiene por sí mismo estas correcciones. La autorización funcional no concede autorización de publicación, migraciones, conversión ni cambios de Vercel.


## Integración conjunta de seguridad — 21/10/2026, local, pendiente de publicar

Orden obligatorio: componentes → preflight de precios → precios → seguridad conjunta → postcheck de lectura → código compatible → bloqueo SKU → conversión/configuración atómica → postcheck y cinco presentaciones → restaurar Automatic. Las autorizaciones anteriores no sustituyen la aprobación de este candidato y del nuevo DDL de seguridad. No se cambió Vercel ni se ejecutó SQL productivo durante esta integración.

Ambas vistas conservan `security_barrier=true` y utilizan `security_invoker=true`. Se mantienen las guardas de definición/propietario/RLS y los timeouts de 15 s / 3 s. Los grants nuevos sobre el catálogo son por columna y las políticas restringen productos visibles/no bloqueados y sus atributos familiares públicos; no habilitan costos, escritura pública ni cambios de RPC comerciales. Las políticas existentes se conservan.

`component_offer_publications` contiene sólo nueve campos de publicación por conector. No es otra fuente de precios comerciales ni un contador de inventario: la regla privada sigue siendo autoritativa y la disponibilidad se calcula desde ambos SKU al consultar. Recetas, reglas, aprobaciones JSON, costos y auditorías no reciben SELECT público. La única política de la proyección oculta cada conector cuyo cabezal o cable no sea publicable, sin filtrar el ID del conector oculto.

Los dos helpers son SECURITY INVOKER, con search_path fijo y EXECUTE revocado a PUBLIC/anon/authenticated. Sólo service_role tiene CRUD sobre la proyección y EXECUTE de mantenimiento; no se le concede TRUNCATE. Seis triggers sincronizan receta/precio/aprobación y su truncado dentro de la misma transacción. No se cambian las RPC existentes ni las actualizaciones ordinarias de stock. Un fallo de sincronización aborta la configuración: nunca corregirlo ampliando grants o desactivando RLS. La proyección es reconstruible desde las fuentes privadas, pero no sustituye su respaldo.

Ante error, timeout o resultado incierto: detenerse y leer el estado antes de reintentar. La tercera migración es una sola transacción y rechaza una segunda aplicación; no silenciar esa guarda. Si ya confirmó, no restaurar vistas en modo propietario ni eliminar RLS como recuperación. Mantener código/esquema compatibles y los SKU afectados bloqueados según el estado de conversión; corregir hacia adelante con autorización. Revalidar vigencia y cobertura del respaldo antes del corte; no restaurarlo sobre operaciones posteriores.

Evidencia reutilizada: las 53 comprobaciones conjuntas aprobadas sobre esquema del respaldo y filas sintéticas en PostgreSQL 17.11. Validación de la integración versionada: 19/19 pruebas focalizadas, cero omisiones, incluidas aplicación de los tres archivos en orden en PostgreSQL 17.6 descartable, postcheck vacío, RPC autorizadas, precios exactos, tres roles, denegaciones, visibilidad por conector, stock dinámico y rechazo de reejecución. Los otros 13 tests validan las cinco publicaciones, URLs, carrito y serialización. El primer intento del fixture necesitó un cast UUID explícito; no se modificó la migración para pasar pruebas. No se repitieron la suite general, build ni revisión visual porque no cambió código de aplicación.

La experiencia comercial se conserva: cabezal $22.000/$16.500, cada cable $15.800/$11.850, cada combo $30.666,67/$23.000. Ambas URL, fotos/placeholder verificados y desglose de conector siguen bajo los controles descritos arriba. No hay segunda lógica de stock, reservas ni descuentos.

Pendientes para ejecución: autorización del nuevo commit y de las tres migraciones exactas; recuperar/verificar el control operativo de Vercel (el último valor conocido era Automatic, no se reconfirmó durante esta tarea); repetir sólo las precondiciones inmediatas de inventario/reservas/esquema, vigencia del respaldo y vinculación del operador en la misma conexión. No hay cambios de precios/costos pendientes de decisión comercial.

El manifiesto final incluye 71 rutas respecto de `a892129e25132e261bf9e7d0831410e82abe7769`; sólo ocho archivos cambian respecto de `3dc2e92`, sin modificaciones de código comercial. `.gitattributes` fija LF exclusivamente para los dos SQL nuevos y evita que un checkout Windows cambie sus hashes.
