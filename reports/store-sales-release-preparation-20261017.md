# Ventas físicas — Fase 1C: preparación de integración y publicación

**Conclusión: APTO CON CONDICIONES. No autoriza ejecución productiva.**

## Estado verificado el 2026-10-17

- `main` local y remoto: `7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`. La consulta remota fue git ls-remote, sin actualizar ni modificar main.
- El alias público sfstore-ten.vercel.app continúa asignado a `dpl_3uT3C5PGCizsSYzRC2MMRRGDXnVs`, READY, commit `360b6d9ffd789775ee4f0014c6dffc7dcb80a262`, verificado con Vercel read-only.
- Rama de trabajo `codex/store-sales-full-payment-20261017`, base exactamente ese commit. Los cambios de las fases 1/1B/1C todavía están sin commit: no existe un SHA de publicación de esta funcionalidad.
- Hay 215 archivos heredados de diferencia entre main y el commit ya publicado. No son cambios nuevos de ventas físicas. No tratar main como una copia de Production ni mezclar la regularización de esa pila con este corte.
- Diff propio desde la base: sólo ventas físicas, migración nueva, pruebas, manifiesto local y documentación. Sin cambios de dependencias, checkout online, Auth, Storage, Cron o configuración Vercel. Ningún env, respaldo, CSV privado o artefacto runtime forma parte del diff.

## Compatibilidad de base de datos

Se restauró sólo el esquema público de Production respaldado, sin sus datos, en un PostgreSQL **17.6 descartable**. Se compusieron allí las versiones exactas aprobadas de SQL01 y SQL04a, ya confirmadas como aplicadas en Production. Los roles de plataforma son identidades sintéticas NOLOGIN y Storage es un fixture vacío. No se reprodujo automáticamente el historial de migraciones ausente ni se aplicaron las migraciones históricas del repositorio a Production.

**11/11 comprobaciones aprobadas:**

1. Preflight exacto de catálogo pasa en el modelo y confirma READ ONLY.
2. Un lector que retiene ACCESS SHARE hace abortar el DDL por lock_timeout (~2 segundos), sin columnas/RPC/filas parcialmente cambiadas.
3. Fallo inyectado después de añadir columnas revierte todo el DDL y mantiene la RPC anterior y las filas sintéticas.
4. Fallo inyectado antes de COMMIT, después de sustituir la RPC y sus grants, revierte columnas, función, ACL y datos conjuntamente.
5. La migración exacta se aplica en el modelo productivo conocido y conserva filas anteriores. relfilenode no cambió: no se observó reescritura de heap en este ensayo.
6. Sólo cambia la definición de create_store_sale_atomic. Todas las demás funciones, ACL de tablas/funciones, políticas RLS y propietarios son idénticos antes/después.
7. Postcheck exacto de catálogo pasa y confirma READ ONLY.
8. Payload del formulario publicado con transferencia almacenada 80 se rechaza con PRICE_CHANGED; medio genérico card se rechaza con PAYMENT_INVALID, sin registros parciales.
9. Reintento de una venta pagada anterior a la migración se rechaza con IDEMPOTENCY_CONFLICT, sin duplicarla ni cambiar sus importes.
10. Payload del nuevo formulario funciona usando las funciones auxiliares realmente capturadas de Production; precio, pagos y snapshots correctos.
11. La RPC online del contrato publicado sigue creando reservas y admite reintentos sin duplicación.

Se reutilizan los resultados anteriores: 30 casos PostgreSQL 17.6 de Fase 1 y 12 pruebas UI/Auth/PostgREST/RPC reales locales de Fase 1B. No se repitió una auditoría general ni se hicieron nuevas operaciones productivas.

### Límite de la evidencia actual

El modelo es compatible con el esquema capturado más los cambios productivos confirmados. **No se ha realizado una lectura nueva del catálogo de Production en esta fase**: no hay una conexión PostgreSQL de sólo lectura certificada disponible y no se crearon accesos ni se reutilizaron credenciales administrativas para automatizarla.

Se prepararon y probaron dos consultas acotadas:

- `store-sales-release-preflight-catalog-only.sql`: antes de solicitar la ejecución.
- `store-sales-release-postcheck-catalog-only.sql`: después de ejecutar la migración autorizada.

Ambas usan BEGIN READ ONLY, timeouts y ROLLBACK; consultan catálogos/configuración, no filas comerciales ni RPC de negocio. Devuelven una sola fila con booleanos y nombres de objetos que no coincidan, sin cuerpos de funciones, defaults legibles, secretos o datos personales. Las referencias usan identidades completas y SHA-256 normalizado LF; no etiquetas truncadas ni huellas sensibles a CRLF.

El project_label es una etiqueta esperada, **no prueba del proyecto conectado**. El propietario debe verificar por separado el proyecto del Dashboard `xspvoicelbxlmtqoiolc`. SQL Editor conserva privilegios de escritura aunque esta transacción sea READ ONLY. Si no hay canal de lectura autorizado, la intervención mínima será ejecutar únicamente el preflight desde ese Dashboard; el resultado puede procesarse localmente sin exportar capturas completas.

Los checks comparan seis tablas y ocho funciones dependientes (incluida la RPC física anterior y las online críticas), propietarios, permisos efectivos, roles/membresías, columnas nuevas ausentes/presentes y configuración online vigente. Cualquier diferencia debe investigarse; no ajustar automáticamente huellas ni alterar la migración para aprobarla. Los tamaños estimados y transacciones visibles son metadatos orientativos, no un snapshot global ni una certificación de ausencia de tráfico.

## Compatibilidad durante la transición

La adición de columnas es compatible con lecturas e inserts explícitos anteriores: quedan NULL y no se recalculan ventas, pagos ni movimientos históricos. Las RPC/guardas online y sus permisos no cambian.

**La sustitución de la RPC física no es una actualización rolling transparente.** El código publicado permite precios acordados/transfer_price y card genérico, mientras el nuevo contrato exige lista/25%, medios detallados y cobro completo. Tampoco se debe repetir desde una pestaña vieja una venta ya confirmada: conserva su registro, pero el fingerprint anterior no satisface la política nueva.

Condición operativa: todos los operadores deben dejar de confirmar nuevas ventas físicas, resolver cualquier solicitud en curso y cerrar/recargar los formularios antes de reabrir el mostrador. Es una pausa operativa, no una nueva barrera técnica global. No suponer que evita toda llamada de una integración desconocida; cualquier consumidor directo de create_store_sale_atomic debe actualizar su payload. Los rechazos previstos son seguros para datos, pero pueden interrumpir una operación de mostrador.

El catálogo y las compras online pueden continuar, salvo la espera breve de locks del DDL. No se ejecuta SQL05/06 para gestionar la pausa física y no se altera checkout_configuration. Si no se puede coordinar a los operadores/consumidores físicos, **no aplicar todavía el contrato actual**.

## Bloqueos y duración

ALTER TABLE usa ACCESS EXCLUSIVE para estos cambios: puede esperar o bloquear lectores/escritores de order_items y order_payments. El lock se mantiene hasta terminar la transacción. Nullable sin default no implica por sí solo ausencia de escaneo: los CHECK pueden requerir validación de filas. No prometer cero latencia al checkout online.

El archivo limita la espera por lock a 2 segundos y cada sentencia a 20 segundos; statement_timeout **no es un límite global de toda la transacción**. Los valores locales del ensayo con pocas filas no predicen tiempos productivos. Preparar una ventana de baja actividad, observar tamaños/locks del preflight y detenerse ante timeout, conflicto o una espera no prevista. No matar sesiones comerciales ni reintentar automáticamente.

Documentación oficial: [ALTER TABLE PostgreSQL 17](https://www.postgresql.org/docs/17/sql-altertable.html) y [timeouts PostgreSQL 17](https://www.postgresql.org/docs/17/runtime-config-client.html).

## Respaldo y recuperación disponible

El respaldo `POSTGRES_20261014T211741Z` sigue presente; SHA-256 del dump coincide con su certificado COMPLETE_SCOPED_RECOVERABLE y su restauración aislada había aprobado. No equivale a un respaldo actual: es anterior al lanzamiento y a nuevas altas/cambios posteriores. El manifiesto inicial conserva un estado histórico pendiente, superado por el certificado de recuperación; no confundir ambos.

**Antes del corte se necesita un dump PostgreSQL reciente, íntegro y restaurado en un entorno aislado**, incluyendo el esquema público actual, datos de ventas/items/pagos/inventario/productos y compras/costos relacionados, configuración y dependencias, funciones, ACL y políticas. Usar snapshot consistente del dump y registrar su instante; la tienda puede seguir cambiando después, por lo que no es una vía para sobrescribir Production y perder pedidos posteriores.

Reutilizar el auxiliar existente con destino privado nuevo y credenciales sólo por entrada oculta/memoria cuando se autorice. No crear nuevos accesos ni repetir respaldos ahora. Auth/roles-passwords/Vault/operación gestionada y configuraciones externas siguen fuera de una recuperación integral certificada. La migración no afecta Auth ni Storage: no requiere redescargar por sí misma los comprobantes o imágenes para recuperar el alcance de este cambio. Eso no certifica actualidad del respaldo global de Storage.

## Runbook propuesto — no ejecutar sin autorización

1. **Fijar el candidato.** Revisar el diff contra 360b6d9 y crear un commit aprobado de esta rama. Volver a fijar los hashes por bytes del manifiesto. Las normalizaciones LF sirven para comparar estructura, no reemplazan la aprobación del archivo exacto. No hacer un merge/push indiscriminado a main. La rama nueva no figura en deploymentEnabled=false: un push podría crear una Preview; no publicar hasta controlar o autorizar expresamente esa vía.
2. **Preparación local/artefacto.** Reutilizar build, TypeScript, pruebas y controles ya aprobados. Preparar el artefacto del commit exacto y un mecanismo autorizado de deployment protegido sin dominio (por ejemplo el flujo --prod --skip-domain usado previamente), antes de la pausa operativa si está aprobado. No permitir tráfico a un candidato sin certificar protección; no probar escrituras productivas por una Preview.
3. **Respaldo reciente.** Autorizar por separado su captura/restauración aislada y verificar cobertura/hashes. Guardar fuera de Git. Preservar el anterior.
4. **Verificaciones inmediatas.** Confirmar alias y commit vigente, proyecto Supabase exacto, preflight aprobado, backup certificado, operadores preparados y ausencia de migraciones concurrentes. Si hay diferencias, parar. No ejecutar db push, migration repair ni la pila histórica; la colisión 202609180002 no se resuelve con esta publicación.
5. **Pausa física.** Acordar una ventana breve; no confirmar nuevas ventas de mostrador y resolver resultados inciertos antes de continuar. Mantener sin cambios las compras online. Con candidato ya READY, prever varios minutos para SQL, promoción y comprobaciones; no garantizar un plazo exacto.
6. **Contrato SQL, con autorización específica.** Ejecutar una sola vez el archivo completo `202610170001_store_sales_full_payment.sql`, una conexión y transacción, con el hash exacto del manifiesto. No editarlo, dividirlo por sentencias ni omitir guardas. Si hay error/timeout, detener; en la misma conexión abortada hacer ROLLBACK cuando corresponda y verificar catálogo. Nunca reintentar a ciegas tras perder la respuesta: puede haber alcanzado COMMIT.
7. **Postcheck de catálogo.** Verificar tres columnas, nuevo hash de la RPC física, todas las otras dependencias intactas, propietarios/permisos/RLS y checkout online habilitado sin variación. Si falla, conservar la pausa física y no promover.
8. **Código, con autorización específica.** Promover exclusivamente el deployment READY del nuevo commit; verificar alias -> deployment -> SHA. Mantener a los operadores sin confirmar desde pestañas antiguas. No activar Cron/auditorías ni modificar Auth, Storage, precios o permisos fuera del contrato.
9. **Comprobaciones posteriores.** Sin generar ventas: catálogo/carrito/checkout disponibles, admin con sesión autorizado, venta anterior consultable, nuevo formulario calcula lista/25% y no confirma con saldo. Acordar por separado la observación de la primera venta legítima del propietario o una prueba sintética productiva explícitamente autorizada; nunca crear datos productivos de prueba por defecto. Verificar ID único, suma de pagos, snapshots, stock y un movimiento por línea mediante consultas acotadas. Reabrir el registro físico sólo después de las comprobaciones acordadas.
10. **Supervisión inicial.** Ante errores, mantener/detener el alta física y corregir hacia adelante. Si el incidente afecta también compras online, detenerse y solicitar/usar únicamente la autorización explícita de contingencia de SQL06; esta preparación no lo ejecuta ni concede esa autorización. Se conserva la gestión manual de reservas ya aceptada por el propietario.

## Recuperación por punto de fallo

- Antes de COMMIT: la transacción revierte columnas/RPC/grants conjuntamente; el ensayo verificó el rollback. Confirmar con catálogo antes de permitir reintento.
- Estado incierto por corte de conexión: inspeccionar con pre/postcheck, no deducir el estado del mensaje del cliente ni volver a ejecutar automáticamente. Si el esquema se ve intermedio, tratarlo como incidente y pedir nueva autorización.
- SQL confirmado, despliegue/promoción fallidos: mantener pausa física; el checkout online conserva su contrato. Corregir y promover el artefacto compatible. Puede conservarse la versión publicada para consultas/web, pero su formulario físico no es compatible para todas las operaciones.
- Código nuevo con fallo: rollback de Vercel a 360b6d9 sólo mantiene web/lecturas y **no restaura el contrato físico anterior**. Dejar pausado el registro físico hasta una corrección compatible. No bajar la RPC a reglas permisivas, borrar snapshots, reabrir permisos públicos ni restaurar el dump sobre Production.
- Pedidos/pagos ya confirmados se preservan. No borrar ni reconstruir movimientos; corregir con un procedimiento específico revisado si existiera un defecto de datos.

## Condiciones aún abiertas

- Una lectura productiva acotada reciente debe confirmar que el esquema no cambió respecto del modelo ensayado.
- Falta respaldo actualizado y recuperación aislada de esa copia.
- Falta un commit inmutable, revisión de integración y autorización concreta de SQL/deployment.
- Falta acordar la pausa física y recarga de operadores; no hay compatibilidad transparente para pestañas viejas.

No hay modificaciones productivas, merge ni despliegue realizados durante esta fase.

## Fase 1D — candidato y corte del mostrador

La rama de publicación `codex/store-sales-release-20261017` se prepara directamente sobre `360b6d9ffd789775ee4f0014c6dffc7dcb80a262`, sin integrar main. El commit definitivo se identifica con `git rev-parse codex/store-sales-release-20261017`; su evidencia posterior queda separada para no introducir una referencia circular al propio commit. No hay push ni despliegue autorizado en esta fase.

Antes del SQL, el responsable del mostrador debe confirmar que todos los operadores dejaron de registrar ventas y que no hay formularios enviándose. Esperar las respuestas de solicitudes iniciadas. Si una respuesta se pierde, conservar la clave de idempotencia y resolver primero si la venta ya existe mediante el administrador/consulta autorizada acotada; no repetir con una clave nueva. Después de aplicar el nuevo contrato, un reintento de una venta anterior puede rechazarse por política, sin demostrar que la venta haya fallado. Un resultado incierto bloquea el corte hasta aclararlo. Los metadatos de actividad son complementarios y dependen de la visibilidad del rol; no prueban por sí solos ausencia de solicitudes.

Preparar y comprobar READY del artefacto protegido antes de pausar el mostrador, únicamente cuando se autorice su creación. Aplicar SQL, postcheck y promoción en la misma ventana coordinada. Cerrar las pestañas de ventas anteriores y abrir el formulario nuevo tras verificar el SHA publicado. El checkout online conserva su configuración; no se usan SQL05/06 para esta transición.

El respaldo de esta fase utiliza el auxiliar existente sólo en modo dump PostgreSQL y restauración aislada sin red. No descarga Storage, crea usuarios remotos ni aplica SQL. Se excluyen datos de Auth, secretos y operación administrada; los bytes de archivos Storage no forman parte del respaldo. El dump sí conserva el esquema/ACL y los datos incluidos por el alcance existente, con comparación de COPY y estructura al restaurar. Estos límites son compatibles con el alcance de esta migración, que no modifica Auth ni Storage; no equivalen a recuperación de todo Supabase.

No dar por satisfechos respaldo ni preflight hasta obtener sus resultados reales. Una sesión administrativa para obtener un backup autorizado no se presenta como una cuenta técnicamente limitada a lectura. La verificación puntual de catálogo se ejecutará desde la sesión del propietario en SQL Editor, con el bloque READ ONLY ya preparado, sin crear una credencial de auditoría nueva.
