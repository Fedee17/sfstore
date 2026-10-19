# Ventas físicas — Fase 1D: candidato para publicación coordinada

Conclusión: **APTO CON CONDICIONES OPERATIVAS Y DE AUTORIZACIÓN**. Preparación técnica lista; no se aplicó la migración, no hubo merge, push ni despliegue.

## Candidato

Rama de publicación: `codex/store-sales-release-20261017`, basada directamente en `360b6d9ffd789775ee4f0014c6dffc7dcb80a262`. El SHA definitivo se obtiene con `git rev-parse codex/store-sales-release-20261017`; la evidencia de ejecución posterior se conserva fuera del commit para evitar referencias circulares. No se incorporó ninguna diferencia de main. La rama de implementación original se conserva.

El diff comprende ventas físicas, snapshots y RPC, manifiesto SQL local, pruebas y documentación. Se añadió una corrección mínima de un arnés preexistente: `product-form-atomic-ui.test.mjs` no cargaba la dependencia real `@/lib/uploads/limits`, por lo que el fixture no montaba. Se carga ahora el módulo real; no se modifica el formulario de productos ni sus validaciones. Una primera ejecución también carecía del navegador Chromium esperado: se configuró el canal Edge instalado, sin instalar ni modificar dependencias. La regresión del arnés corregido aprobó.

## Compatibilidad productiva verificada mediante lectura

Proyecto confirmado por URL del Dashboard: `xspvoicelbxlmtqoiolc`. Consulta puntual desde SQL Editor, 2026-10-17 17:49:59 UTC: **13/13 controles aprobados**, `all_checks_passed=true`, `read_only=true`, `commercial_rows_read=false`; sin diferencias de funciones, tablas ni propietarios. Permisos efectivos de service_role y denegaciones públicas correctos; configuración online sin cambios, columnas nuevas todavía ausentes y sin esperas de locks detectadas en esa lectura. No se ejecutaron funciones comerciales. La sesión del propietario conserva privilegios administrativos: READ ONLY describe únicamente la transacción ejecutada.

La primera comparación señaló tres funciones físicas. El respaldo actual permitió demostrar que la referencia local antigua había introducido CRCRLF en lugar de CRLF. Las definiciones completas son idénticas después de corregir exclusivamente ese defecto de transporte. Se preservó la referencia antigua y se creó una copia privada corregida, sin sobrescribir respaldos. Se actualizaron las huellas esperadas del preflight y de las dependencias sin cambios del postcheck; **no se modificó la migración ni se relajaron las comprobaciones**. La referencia corregida volvió a aprobar los once ensayos PostgreSQL 17.6 y luego coincidió con Production. Un intento de sustitución del editor dejó texto residual y recibió error de sintaxis; se vació el editor y se ejecutó correctamente el archivo completo. Ningún intento realizó escrituras comerciales o DDL.

## Respaldo actualizado

Respaldo privado nuevo `STORE_SALES_POSTGRES_20261017T174322068Z`, certificado el 2026-10-17 17:45:28 UTC como **COMPLETE_SCOPED_RECOVERABLE**. TLS verify-full validó cadena y hostname. Contraseña ingresada por el propietario con entrada oculta, sólo en memoria/stdin; no en argumentos, archivos ni logs.

Dump íntegro, SHA-256 verificado, restauración de una sola transacción en contenedor local sin red, comparación de estructura y datos COPY aprobada. Contenedor retirado y siete artefactos comprobados nuevamente por tamaño y SHA-256. Evidencia detallada privada fuera del repositorio.

Alcance: esquema/datos públicos y dependencias incluidas por el auxiliar, ACL/propietarios, metadatos Storage y definición de esquemas relacionados. Excluye datos Auth, contraseñas de roles, Vault y otros secretos/operación administrada, configuraciones externas y bytes de archivos Storage. No certifica recuperación integral del proyecto. No se volvió a descargar Storage porque este cambio no modifica esos archivos ni Auth. El snapshot es el instante del dump, no protege cambios comerciales posteriores contra una restauración destructiva; no restaurar esta copia sobre Production como rollback de rutina.

## Plan listo, sin ejecución

Aplicar el runbook `store-sales-release-preparation-20261017.md`: preparar candidato protegido READY bajo autorización, coordinar pausa sólo del registro de mostrador, drenar solicitudes en curso y resolver respuestas inciertas antes de SQL. Conservar claves de idempotencia; buscar la venta existente antes de repetir y nunca generar una clave nueva para ocultar incertidumbre.

Ejecutar la migración completa una vez y sólo con autorización específica, verificar postcheck, publicar el SHA aprobado y recargar todas las pestañas físicas antes de reabrirlas. Las compras online conservan su configuración; pueden experimentar esperas del DDL. Preflight debe revalidarse inmediatamente si cambia el esquema, hay otra intervención o se posterga el corte. Los hashes por bytes del artefacto usado deben comprobarse nuevamente; los valores LF son comparadores, no sustituyen el archivo autorizado.

El nuevo SQL rechaza ciertos payloads y reintentos del formulario antiguo. No hay compatibilidad transparente para pestañas viejas. Un error antes de COMMIT revierte la transacción; una respuesta perdida obliga a inspeccionar el catálogo, sin reintento automático. Después de COMMIT, si falla el deployment, mantener la pausa física y corregir hacia adelante. Rollback Vercel no revierte PostgreSQL: la versión anterior puede seguir atendiendo web/lecturas, pero no debe reabrirse su formulario físico. No bajar la RPC a reglas permisivas, borrar snapshots, reabrir grants ni sobrescribir datos con el respaldo.

## Pendientes que requieren al propietario

1. Acordar la ventana operativa y confirmar que operadores e integraciones de mostrador suspendieron altas y resolvieron solicitudes pendientes.
2. Autorizar explícitamente el archivo SQL exacto y el deployment del commit definitivo. Esta fase no los ejecuta.
3. Autorizar por separado cualquier escritura productiva de comprobación. La verificación posterior sin escrituras y la observación de una primera venta legítima deben acordarse en el corte.

No se requieren nuevas funciones, cambios comerciales, permisos públicos, Auth, Storage, Cron ni regularización del historial de migraciones para esta fase.

## Sincronización del arnés integrado

Una ejecución local obtuvo 11/12 PASS y agotó el tiempo al buscar el fixture reservado, antes de la solicitud online. El selector esperó sólo un encabezado SSR; se agregó espera de fin de carga de red local antes de escribir en el campo controlado. El caso aislado volvió a aprobar con todas sus aserciones de reserva, stock e idempotencia, sin modificar la aplicación, precios, permisos ni SQL. No se atribuye el timeout a un fallo productivo confirmado. La ejecución completa final sobre el commit se registra en la evidencia privada de Fase 1D.
