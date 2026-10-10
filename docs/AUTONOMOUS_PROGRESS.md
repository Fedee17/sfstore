# SFSTORE — maintenance checkpoint

Fecha: 2026-10-10. Repositorio: Fedee17/sfstore.

Base de trabajo: codex/autonomous-maintenance en 824b555182bc44da724050572c22b9b70771eaa9.
Rama aislada de entrega: codex/storage-p1-safe-retention. Main observado: 7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6.

## Alcance continuado desde los tres checkpoints

Se trataron como contexto y evidencia los checkpoints review_actual, admin_delete_P1 y P1_followup del 2026-10-10. Se continuaron sus P1 de Storage y sus validaciones/P2 de lint; no se repitieron auditorías anteriores, pagos ni catálogo.

Se reprodujo antes del parche la carrera administrativa con un fixture: storageDeleted=true y deletedWhileReferenced=true al crear una referencia después del último lookup. No hay evidencia de un incidente real en Production.

## Cambio P1

- Sin borrados incondicionales: el procesador y el gateway compartido ya no llaman a Storage.remove. También se cerró el camino legacy DELETE_STORAGE/DELETE_BOTH.
- Objetos existentes siempre retenidos; las tareas legacy sin identidad dan STORAGE_IDENTITY_REQUIRED. Una identidad coincidente no autoriza borrado sin condición atómica de versión.
- CLI --apply deshabilitado antes de credenciales/conexiones, incluyendo hosts Production etiquetados como staging por el operador. Dry-run continúa READ ONLY.
- Eliminación administrativa de metadatos más reconcile en una transacción mediante nuevo RPC service-only. Un fallo de cola revierte también orden/principal; una repetición no duplica tareas. El archivo se conserva y la UI lo informa.
- create_product_atomic/update_product_atomic, uploads upsert:false, rutas por contenido, prepared y reintentos del guardado actual conservados.
- Revisión independiente de frontera y del candidato completada: no se encontró un bypass destructivo concreto en el parche. Las pruebas PostgreSQL del padre sí se ejecutaron con runtime local.

## P2 confirmado y corregido

El lint inicial reprodujo 9 errores y 11 warnings. Se corrigieron ocho enlaces internos a inicio mediante next/link con prefetch=false y la redirección de Mercado Pago mediante window.location.assign. Se conservaron textos/destinos, lógica de pagos y reglas comerciales. Consultadas las guías locales Next.js requeridas por AGENTS.md y la guía React para los cambios TSX. Los 11 warnings existentes quedan fuera del alcance (imágenes HTML y variables sin usar).

## Validación de esta ejecución

Resultados nuevos sobre este checkout; no se reutilizan como evidencia los 620 tests de la implementación histórica.

- Reproducción original: pérdida sintética antes del parche; después, la prueba concurrente verifica cero llamadas a borrado y objeto conservado.
- Pruebas focalizadas: 60 aprobadas, 0 fallidas; después se amplió la comprobación de orden/principal, rollback y allowlist etiquetada como staging.
- Suite final completa con PostgreSQL efímero y Playwright/Chromium local: 629 aprobadas, 0 fallidas y 0 omitidas. Incluye formulario React con HEIC, reintentos, doble submit y versión obsoleta.
- TypeScript y build aprobados. Lint posterior: 0 errores, 11 warnings. git diff --check aprobado.

## Migraciones y límites pendientes

- 202610100001_product_storage_task_results.sql: agrega result jsonb; estado real de Production no consultado ni asumido.
- Nueva 202610100002_durable_admin_image_delete.sql: agrega el RPC de encolado; no reemplaza funciones ni modifica filas al aplicar el DDL. Pruebas solo en PostgreSQL sintético.
- DATA_WRITE_APPROVAL_REQUIRED: aplicación manual en SQL Editor, con revisión/autorización separada, antes de desplegar el nuevo llamador. No supabase db push.
- Sin ambas garantías (destino confiable independiente y borrado condicionado a versión/inmutabilidad de todos los escritores), la limpieza física permanece deshabilitada. Retener objetos puede aumentar el uso de Storage; es una limitación explícita, no una habilitación de Production.
- No se ejecutaron migraciones, escrituras, pagos o borrados reales. No hubo merge ni despliegue.
- Los documentos locales previos de preparación de Production en /workspace/sfstore quedaron intactos; la rama de mantenimiento original tampoco fue modificada.

## Próximo paso

Revisar una sola draft PR a main de esta rama aislada. No hacer merge ni desplegar. La habilitación de borrados reales es una tarea separada que necesita resolver las garantías anteriores; no basta con autorizar la migración result jsonb.
