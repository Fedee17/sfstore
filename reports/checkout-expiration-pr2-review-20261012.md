# Revisión del ejecutor de reservas para PR #2 — 2026-10-12

Alcance: ejecutor SQL de reservas, supervisión administrativa, autorización, migraciones y regresiones. Validación exclusivamente con Supabase real local y datos sintéticos. Este informe es un resumen público: no contiene exportaciones, identificadores generados, comprobantes, credenciales ni evidencias privadas.

## Cambios revisados

- 202610120003_checkout_expiration_executor.sql: rol NOLOGIN/NOINHERIT sin privilegios administrativos, función privada de capacidad fija, auditoría transaccional, backlog y heartbeat. Reutiliza el liberador manual; sólo añade SQLSTATE sanitizado a sus fallos. Lote de hasta 100, SKIP LOCKED, serialización de workers y resultado idempotente por UUID.
- 202610120004_checkout_expiration_search_path.sql: corrección aditiva encontrada en esta auditoría. Mantiene 003 intacta y coloca pg_temp explícitamente al final del search_path del ejecutor, sus consultas y el trigger histórico de inventario.
- Panel administrativo y servicio de salud de sólo lectura con verificación administrativa antes de crear el cliente privilegiado; conserva liberación manual.
- Payload transaccional de cinco minutos y script separado de preparación de un job inactivo. El test sólo comprueba su rechazo antes del registro; no se creó ni activó un job.
- Manifiesto local y harnesses de regresión actualizados para 28 migraciones. Las migraciones 001/002 y los antecedentes del manifiesto se conservan.

## Hallazgo corregido y autorización efectiva

La regresión reprodujo un lote partial/42703 al crear una tabla temporal orders en la sesión ejecutora: el trigger prevent_historical_inventory_movement resolvía relaciones sin calificar con precedencia implícita de pg_temp. Esto permitía alterar una consulta que corre dentro de la frontera privilegiada. La migración 004 corrige la resolución sin reescribir SQL aplicado, cambiar reglas comerciales ni ampliar ACL. La misma regresión pasa después de la corrección.

Permisos efectivos locales: el ejecutor sólo puede invocar run_checkout_expiration entre las funciones de los esquemas public y sfstore_maintenance. No tiene privilegios de tabla o columna sobre public, auth, storage o mantenimiento; no puede crear objetos en esos esquemas. No recibe membresía de roles privilegiados. La membresía del ejecutor corresponde al DBA postgres; los principales sintéticos temporales del test se retiraron al cerrar sus conexiones.

Se probó con un login sintético sin privilegios de DBA: SET ROLE postgres/service_role/authenticator/supabase_admin, consultas privadas, escrituras arbitrarias, acreditación, transición directa y cambio de dueño de función son denegados. Se prueban search_path del caller y tablas temporales sin redirigir la liberación. Anon/authenticated/service_role no pueden ejecutar la capacidad privada; invitados no consultan la salud administrativa.

SECURITY DEFINER conserva propietario postgres. El mínimo privilegio corresponde al ejecutor, no al dueño DBA: la frontera depende de SQL confiable, objetos con nombre explícito y ausencia de CREATE para roles no confiables. No acepta SQL dinámico, destinos de función, IDs arbitrarios de pedidos ni identidad administrativa del caller. No se expone service_role en un endpoint ejecutor.

## Resultados finales

| Verificación | Resultado |
| --- | --- |
| Ejecutor con Supabase real local | 17 aprobadas, 0 fallidas, 0 omitidas |
| Liberador manual y panel, Supabase real/navegador | 10 aprobadas, 0 fallidas |
| Reglas comerciales, Supabase real/navegador | 16 aprobadas, 0 fallidas |
| Checkout invitado, Supabase real/navegador | 9 aprobadas, 0 fallidas |
| Suite general | 651 aprobadas, 0 fallidas, 6 pruebas y 6 suites optativas omitidas |
| Frontera administrativa de supervisión (incluida en general) | 3 aprobadas |
| Build Next.js y TypeScript --noEmit | Aprobados |
| Lint global | 0 errores; 10 advertencias preexistentes fuera de los archivos cambiados |
| Lint focal | 0 errores, 0 advertencias |
| Gitleaks | Fuentes completas (164 KB), índice e historial de la rama sin hallazgos |
| Credenciales locales en fuentes | 0 coincidencias; archivos de entorno y evidencias privadas excluidos |
| git diff --check | Aprobado |

Escenarios: vigentes no liberadas, vencidas sin aviso liberadas, pagadas y avisos oportunos protegidos; pago concurrente confirmable; workers manual/automático; reintentos mismo UUID y nuevos UUID; bloqueo de pedidos y productos; fallo parcial, cancelación de lote, rollback exterior y reintento. También compra de stock 1/2 sin sobreventa, CAPTCHA real de prueba, descuento único del 25%, privacidad de comprobantes, rechazo y acreditación completa, aislamiento de compradores y Mercado Pago deshabilitado.

Invariantes finales locales: cero restituciones duplicadas, cero restituciones de pedidos pagados, cero stocks negativos y cero principales temporales restantes. Monitor desarmado; pg_cron no instalado. Las suites reales se ejecutaron por separado; los runners optativos omitidos en la suite general no se presentan como pases.

Durante la preparación del test ampliado, SET SESSION AUTHORIZATION fue denegado al rol postgres gestionado; se cambió a un principal sintético temporal para probar una identidad sin privilegios. El primer intento de shadowing falló y reveló el defecto corregido; la ejecución final completa del ejecutor pasa. Los fallos deliberados de timeout/rollback son escenarios aprobados.

## Pendientes y límites

Sin cambios en Production/main, migraciones remotas, reinicialización, merge, despliegue ni scheduler real. Publicación limitada a commit/push normal de la rama de integración y actualización de PR #2 en borrador. vercel.json mantiene deshabilitados los despliegues Git de esta rama.

Activar Cron requiere autorización posterior, revisión de permisos del Supabase gestionado, aplicación ordenada de 003 y 004, registro inactivo, revisión del payload y activación con supervisión. Pendientes ticks reales, alertas externas, retención de auditoría y pruebas de capacidad sostenida. Una reversión exterior o caída de conexión puede revertir también el registro transaccional; se requiere historial de cron y monitoreo de ausencia de actividad. Los avisos pendientes permanecen protegidos hasta revisión administrativa.

Runbook: [operación preparada](../docs/CHECKOUT_RESERVATION_EXECUTOR.md). La validación local no certifica Production ni equivale a activar el ejecutor.
