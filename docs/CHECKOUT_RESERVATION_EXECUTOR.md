# Liberación automática de reservas: operación preparada

Estado: candidata local en la rama de integración; migraciones 202610120003 y 202610120004 aplicadas sólo al Supabase sintético local. Preparación para revisión en PR #2; ningún job fue creado/activado ni se instaló pg_cron. Sin merge ni despliegue.

## Diseño y frontera de autorización

Supabase Cron debe invocar el payload SQL cada cinco minutos. El proceso trabaja junto a PostgreSQL, independientemente del tráfico y del ciclo de vida de Vercel. No hay endpoint HTTP de ejecución ni secreto service_role nuevo en Vercel. No se agregan cron entries a vercel.json.

Rol sfstore_reservation_executor: NOLOGIN, NOINHERIT, sin SUPERUSER/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS, sin acceso directo a tablas y sin RPC de acreditación, cancelación o creación de pedidos. Sólo USAGE del esquema privado y EXECUTE de sfstore_maintenance.run_checkout_expiration(uuid,integer). Únicamente el DBA postgres recibe membresía para SET LOCAL ROLE. No se concede membresía a authenticator, anon, authenticated o service_role.

La función es SECURITY DEFINER, propiedad del DBA postgres: el ejecutor tiene una capacidad acotada y la implementación confiable eleva privilegios para llamar al liberador existente. El dueño conserva privilegios de DBA; no debe confundirse con el rol ejecutor. Esta frontera requiere revisión humana del SQL/ACL y no aceptar SQL dinámico, funciones de destino o IDs de pedidos del caller. Search_path fijo pg_catalog,public,pg_temp (004), objetos explícitos, lote máximo 100. El trigger histórico de inventario también fija pg_temp al final: sus relaciones sin calificar no pueden resolverse a tablas temporales del caller. El esquema privado no se expone en PostgREST. El cliente web no puede invocarlo.

El RPC público get_checkout_expiration_health() es de sólo lectura y EXECUTE exclusivo de service_role. El servidor verifica getUser más allowlist administrativa antes de construir ese cliente. El panel informa fallo de supervisión explícitamente y conserva la liberación manual.

## Reglas y concurrencia

Se reutiliza expire_checkout_reservations(): pendientes vencidos sin aviso, sin pago aprobado ni acreditación manual. No se cambia la reserva inicial de 24 horas. Un pago informado conserva stock hasta decisión administrativa. Ni pagos confirmados ni avisos pendientes se liberan automáticamente.

Cada candidato se bloquea FOR UPDATE SKIP LOCKED sobre orders; transición, stock y ledger usan los bloqueos existentes y subtransacciones por pedido. Acreditaciones y avisos toman el mismo bloqueo. Una operación que lo mantiene es omitida: se reintenta en otro lote. El estado se revalida al transicionar. Upload en estado uploading no equivale a pago informado; si el plazo vence, su submit ya no puede confirmar ni resucitar el pedido. Avisos aceptados antes del vencimiento sí protegen.

Bloqueo asesor global impide superposición entre ejecutores automáticos; la liberación manual puede operar en paralelo con SKIP LOCKED. La espera por otra ejecución con el mismo UUID también está acotada a 250 ms; si vence, reintentar después devuelve el resultado ya confirmado. UUID de ejecución fija el resultado y evita un segundo lote ante retransmisión. Un lote partial/failed/skipped_running se reintenta con UUID NUEVO; reutilizar el anterior sólo recupera su resultado. El scheduler genera un UUID por tick.

El ejecutor usa lock_timeout 250 ms para no atascar otros pedidos por un producto bloqueado. El payload fija statement_timeout 20 s para el lote entero. Un error parcial revierte sólo ese pedido y registra SQLSTATE; el resto puede avanzar. Una cancelación del lote revierte el bloque interno completo y, si la conexión sigue disponible, registra failed sin detalles libres. Reintentar no duplica stock.

## Auditoría y alertas

sfstore_maintenance.expiration_runs registra UUID, actor SQL, inicio/fin, status, lote, restituciones, backlog anterior/posterior, reserva más antigua, fallos por pedido, códigos estáticos y SQLSTATE. Tabla privada con RLS; el ejecutor no lee ni modifica filas directamente. Auditoría de reserva individual existente se conserva. La acción manual directa conserva esa auditoría por pedido; el registro de lotes nuevo corresponde al ejecutor preparado.

Status: completed (puede tener filas SKIP LOCKED pendientes), partial, failed y skipped_running. El panel muestra últimas 10 ejecuciones. El backlog excluye pedidos pagados y avisos protegidos: no son errores del liberador. Protegidos se cuentan por separado.

Alerta de backlog al superar 15 minutos desde el vencimiento. Heartbeat atrasado si no hay lote completed/partial dentro de 15 minutos; se arma sólo con monitoring_enabled=true durante la activación posterior. Repetidos partial/skipped o backlog persistente requieren atención aunque el heartbeat siga actualizándose. Lote de 100 cada 5 minutos: si la demanda supera esa capacidad, investigar carga/tiempos y ajustar la arquitectura tras pruebas, sin bucles ilimitados.

Una reversión exterior, pérdida de conexión, caída de DB o fallo al escribir auditoría puede revertir también el registro. Complementar obligatoriamente con cron.job_run_details, monitor externo de heartbeat y alertas de ausencia. El log transaccional no es una auditoría autónoma. No se instaló notificación externa ni retención/borrado de logs.

## Activación futura: pasos separados, no ejecutados

1. Obtener aprobación explícita de migración, scheduler y entorno. Confirmar backups, ledger, prerequisites de 001/002, titularidad de funciones/roles, permisos efectivos, plan/capacidad Supabase y operación del panel. Aplicar 003 y después 004 mediante el procedimiento autorizado; no db push ciego.
2. Verificar/activar pg_cron en Supabase, con autorización específica. Este desarrollo no instala ni elimina extensiones. Reconfirmar que el job ejecutará en la base/rol del proyecto correcto.
3. Ejecutar una sola vez el payload staging/operations/checkout-expiration-command.sql por conexión DBA, en el entorno aprobado. Revisar respuesta, inventario y auditoría. No requiere credencial de login del ejecutor.
4. Revisar staging/operations/prepare-inactive-checkout-expiration-cron.sql. Para registrar únicamente el job INACTIVO, fijar en la misma sesión sfstore.expiration_setup_approved=yes y sfstore.expected_database al nombre verificado de current_database(). El script aborta si ya existe el job y nunca sobrescribe uno ajeno. No ejecutarlo aquí.
5. Verificar cron.job: nombre sfstore-checkout-expiration, cron cada 5 minutos (*/5 * * * *), payload exacto, username del DBA previsto, base correcta, active=false y ausencia de duplicados. Validar permisos SET LOCAL ROLE y timeout en ese deployment.
6. Tras aprobar la activación, activar job y armar supervisión en una transacción DBA:

```sql
begin;
-- Verificar antes el único job y su schedule/command/username/database.
update cron.job set active=true where jobname='sfstore-checkout-expiration';
update sfstore_maintenance.expiration_monitor set monitoring_enabled=true where id;
commit;
```

7. Observar al menos tres intervalos, cron.job_run_details, expiration_runs y get_checkout_expiration_health(). Confirmar retries de bloqueos y backlog decreciente sin restituciones duplicadas. Asignar responsable de alertas por heartbeat, failures y backlog. Revisar capacidad antes de exposición.
8. Para pausar, actualizar active=false sólo para ese job y monitoring_enabled=false. Mantener datos de auditoría y liberación manual. No deshabilitar pg_cron: afectaría otros jobs y puede borrar su configuración.

Consultas de operación (sólo DBA, datos internos):

```sql
select jobid,jobname,schedule,active,username,database from cron.job
where jobname='sfstore-checkout-expiration';
select runid,status,start_time,end_time from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='sfstore-checkout-expiration')
order by start_time desc limit 20;
select public.get_checkout_expiration_health();
select started_at,finished_at,status,released,due_after,error_code,sqlstate
from sfstore_maintenance.expiration_runs order by finished_at desc limit 20;
```

## Supabase y Vercel

Supabase documenta ejecución directa de una función de base cada cinco minutos y observación de sus runs: [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart). El historial de cron no se elimina automáticamente; acordar retención posteriormente sin incluir un limpiador en esta tarea.

Vercel Cron invoca Functions; Hobby limita la frecuencia a una ejecución diaria y Pro permite por minuto según [límites oficiales](https://vercel.com/docs/cron-jobs/usage-and-pricing). No se consultó ni modificó el plan de SFSTORE. La propuesta recomendada usa Supabase Cron y no depende de esos límites; Vercel sólo hospeda el panel/checkout. Si se eligiera Vercel como alternativa, exigiría diseño separado con autenticación propia, capacidad mínima de DB y validación del plan; no usar service_role en un endpoint público.

## Validación y límites

Ver [revisión pública agregada](../reports/checkout-expiration-pr2-review-20261012.md). La prueba con un login sintético temporal, sin privilegios de DBA, verifica denegación de SET ROLE privilegiado, escrituras, lecturas privadas y cambios de funciones; el principal se elimina al cerrar el harness. No se publica su credencial. No se certifica activación de cron, entrega de alertas, permisos de PostgreSQL gestionado ni carga productiva: todos permanecen pendientes de un rollout autorizado. El scheduler real no se ejecutó ni una vez.

La auditoría reprodujo shadowing de tablas temporales en el trigger legado y lo corrigió en 004, conservando 003 intacta. PostgreSQL recomienda incluir explícitamente pg_temp al final al asegurar funciones privilegiadas: [SECURITY DEFINER](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY). No se atribuye mínimo privilegio al dueño DBA: la capacidad del ejecutor sigue dependiendo del código confiable y de que roles no confiables carezcan de CREATE en sus esquemas.
