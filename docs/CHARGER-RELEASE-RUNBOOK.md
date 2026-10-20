# Publicación acotada de cargadores y combos — revisión

Estado: preparación local del 20/10/2026, **sin autorización de ejecución productiva**. Rama `codex/charger-components-release-20261020`. No se realizó push, merge, despliegue ni cambio productivo.

## Base y alcance

Se consultó el alias real `sfstore-ten.vercel.app`: deployment activo `dpl_6rrP8EnsEJbYmHvKH1kua8zRgBHU`, estado READY, commit `a097ba7af78d55f55bf1fa06636119f9daa4e4a5`. No se dedujo desde la lista de deployments recientes.

El `main` remoto y local está en `a892129e25132e261bf9e7d0831410e82abe7769`; sus archivos funcionales coinciden con esa versión productiva y las diferencias son documentación aprobada. La rama candidata parte del siguiente commit documental `a2ba2b3` y aplica únicamente los cuatro cambios de cargadores `053aebf`, `e429ab7`, `259d83e`, `08f2a28`, excluyendo las dos entregas de rentabilidad `f2de281` y `348281e`. Se conservan los tres documentos maestros y sus referencias; no se cambian las pantallas/formularios por mejoras de rentabilidad.

Los cambios funcionales abarcan Compras (simulación/recepción por conector), selección en mostrador, oferta pública, carrito/checkout, detalle de pedido y servicios correspondientes. Se añaden las dos migraciones de componentes/precios, pruebas y documentación de ese alcance. La ruta Productos solo añade el enlace a componentes; el editor de producto y los paneles de rentabilidad no se incorporan. El listado exacto se entrega en `reports/charger-release-files.txt`.

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

El actor de configuración es obligatorio: UUID real del operador autorizado, suministrado en la sesión mediante `sfstore.charger_actor`. No se adivina, no se usa el creador histórico como si fuera el ejecutor y no es una contraseña. Las copias de revisión se niegan a operar si no se suministra. Antes de autorizar la ejecución debe vincularse ese operador y fijarse el modo de suministro; no falta una decisión comercial de precios o costos.

Las copias privadas contienen la captura aprobada como manifiesto y el mismo cuerpo SQL parametrizado ensayado con fixtures sintéticos. El ensayo no utiliza ni modifica registros reales: valida la transacción y sus guardas, no certifica que la captura siga vigente indefinidamente. No ejecutar las plantillas sin el renderizador: carecen deliberadamente del manifiesto.

## Orden de ejecución futuro — requiere autorización específica

1. Confirmar el alias/commit, candidato y hashes; preparar integración a main sin build automático no autorizado. Releer solo las precondiciones inmediatas si hubo actividad desde el preflight; si cambió el inventario, detenerse. Verificar integridad y vigencia del respaldo certificado, sin sobrescribirlo.
2. Aplicar únicamente la migración de componentes. Ejecutar `component-combo-pricing-preflight-read-only.sql` y comprobar cinco contratos y permisos efectivos. Si una guarda falla, detenerse. Aplicar únicamente la migración de precios.
3. Verificar nuevos objetos/ACL/RLS y publicar el código compatible mediante el protocolo aprobado de main/Vercel. **No publicar antes de ambas migraciones:** los lectores nuevos necesitan las tablas/vista. Con recetas vacías los productos simples conservan sus contratos; no activar la oferta de combo con la interfaz anterior.
4. Confirmar pausa operativa de recepción/edición de los SKU afectados y ejecutar la copia exacta de bloqueo aprobada. Comprobar `commercial_blocked=true` en los cinco SKU. Pestañas antiguas y RPC se rechazan por las guardas existentes; ocultar un botón no es la protección. No pausar globalmente el checkout ni los SKU ajenos.
5. Ejecutar una vez la copia de configuración con actor y hashes revisados. Usa advisory lock por compra, locks ordenados de productos y precondiciones de compra, líneas, costos, precios, movimientos, reservas y pedidos posteriores. Crea solo dos cables en cero/borrador, registra la receta, convierte con huella verificada y aplica precios/aprobaciones. Falla todo o confirma todo. La compra, líneas y movimientos originales se conservan; los ajustes y residuales son auditables.
6. Antes del COMMIT se exige fuente 0, cabezal 21, C/C 10, Lightning 10, cable histórico 0, presentación 0 y otro lote 9. El cabezal conserva la apertura/costo histórico y recibe el costo vigente ponderado; no se inventa costo cero ni se duplica envío. El cable USB-A/C y el otro cargador ajeno se preservan.
7. En esa misma confirmación se fijan lista/transferencia: cabezal 22.000/16.500; cables 15.800/11.850; regla de combo 30.666,67/23.000. Se registran aprobaciones idempotentes y se liberan solo los bloqueos correspondientes; fuente/presentación/cable histórico quedan sin venta simple. No hay stock independiente de combo, ni suma de precios individuales ni segundo 25%.
8. Verificar mediante lectura el resultado, IDs devueltos, auditoría única, precios calculados, stocks, compra original y oferta de ambos conectores. No crear pedidos reales de prueba sin otra autorización. Reanudar operaciones afectadas después de verificar.

No se copian fotografías del cable genérico a conectores no comprobados. Los cables nuevos no tienen imágenes heredadas; se usa la presentación de ausencia de foto existente. No se certifica visualmente esa experiencia sin una revisión segura.

## Detención y recuperación

- Error, timeout o conexión incierta: detenerse; comprobar operación por ID de compra, receta y auditorías antes de cualquier reintento. El reintento confirmado devuelve IDs existentes y **no restablece stock/precios**, incluso después de ventas.
- Falla de configuración: se revierte creación de cables, receta, conversión, costos, precios y auditorías de esa transacción. El bloqueo separado permanece. El resto del negocio sigue funcionando; no reparar a mano ni ejecutar de nuevo sin comprobar el estado.
- Antes de convertir, la copia de recuperación puede restaurar únicamente los flags originales si todos los valores críticos coinciden y no existe receta/conversión. Requiere aprobación; si hay deriva se mantiene el bloqueo.
- Después de convertir o vender, no utilizar esa recuperación ni volver ciegamente al código anterior. Mantener esquema/código compatibles y pausar las ofertas afectadas; corregir hacia adelante con revisión. `reverse_component_conversion` mantiene sus restricciones de ausencia de actividad posterior y autorización aparte; no es un rollback automático del lanzamiento ni restaura precios por sí solo.
- El rollback de Vercel no revierte PostgreSQL. No eliminar tablas/columnas nuevas ni restaurar datos actuales desde el respaldo como atajo.

## Verificación visual

Sigue bloqueada la automatización de navegador/escritorio por el incidente de Windows. No se solicitó ni utilizó ese control. El renderizado y los contratos de interacción tienen la evidencia anterior; queda pendiente validar visualmente selección de conector, precio, foto ausente, stock y mensajes en celular/notebook antes de declarar la publicación completamente aprobada.

## Resultados del candidato limpio

- Instalación desde lockfile con `npm ci --no-audit --no-fund`; package.json y package-lock.json sin cambios. No se aprobaron scripts adicionales ni se cambió configuración global.
- `npm run build`, `npx tsc --noEmit`, ESLint focalizado y `git diff --check`: aprobados. La primera compilación no pudo resolver un enlace local de node_modules fuera de la raíz de Turbopack; se retiró solo ese enlace del nuevo worktree y se hizo la instalación limpia.
- **9/9 pruebas PostgreSQL17.6 específicas del corte**, sin fallos ni omisiones: bloqueo de mostrador y carrito antiguo, creación y conservación, reintento después de una venta, actor/bloqueo obligatorios, deriva de stock/colisión, rollback posterior a conversión, recuperación de bloqueo, rechazo de recuperación después de convertir y dos ejecutores concurrentes. Los fixtures son sintéticos; no se omitieron guardas para hacerlos pasar.
- La suite general previa no se repitió. La revisión visual sigue pendiente. Los contenedores propios del ensayo se retiraron.
- Configuración de Vercel consultada por lectura: Ignored Build Step `Automatic` (valor null). No se modificó; antes de un futuro push/integración debe autorizarse y verificarse el bloqueo necesario para impedir despliegues automáticos.

### Hashes de revisión (bytes LF)

- `supabase/migrations/202610190001_component_inventory.sql`: `3b65067ecb22003431606f7a667863d91c68068632c71134c96c96ea2bb2c394`.
- `supabase/migrations/202610200001_component_combo_pricing.sql`: `b8cf692d065d3fd593e232c6d6ce04f06759201e2cd01418e61deadb20d727ea`.
- `reports/charger-release-hold-review.sql`: `aa44c7d40a3150a05c63ec06fb1a7350ddd4aa6580fa6e4e02aa4c25763c041b`.
- `reports/charger-release-configure-review.sql`: `c5d5e1a10043644ca15725221c606b1d698276e3958d32e409786918ab4f4018`.
- `reports/charger-release-release-hold-review.sql`: `c8517263038fd5d6abb84da004cba8de45206ba6fedca66688359d9f58f4888f`.

Los hashes de las tres copias privadas vinculadas al manifiesto del preflight están en `staging/runtime/charger-release-private/artifact-hashes-private.json`. No confundirlos con las plantillas: ejecutar solo un archivo exacto, revisado y autorizado, con el actor real identificado. No se afirma que la copia productiva con sus valores particulares se haya ejecutado contra Production; se ejecutó el mismo cuerpo parametrizado con fixtures sintéticos.

Cierre de revisión: 57 archivos respecto de main (incluye documentos maestros aprobados y el inventario de archivos); rentabilidad excluida, editores de producto/familia iguales a Production. Los tres SQL privados conservan exactamente los cuerpos de plantilla ensayados, con el manifiesto privado vinculado. Gitleaks sobre el diff: sin secretos detectados. Las dos migraciones conservan los bytes LF del commit de desarrollo validado.
