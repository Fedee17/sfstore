begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Preparation only: no extension installation, cron.schedule or remote execution.
-- The capability role cannot log in, read/write tables, or call payment RPCs.
create role sfstore_reservation_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant sfstore_reservation_executor to postgres;
create schema sfstore_maintenance authorization postgres;
revoke all on schema sfstore_maintenance from public,anon,authenticated,service_role,sfstore_reservation_executor;
grant usage on schema sfstore_maintenance to sfstore_reservation_executor;
create table sfstore_maintenance.expiration_monitor (
 id boolean primary key default true check(id),
 monitoring_enabled boolean not null default false,
 interval_seconds integer not null default 300 check(interval_seconds=300),
 alert_after_seconds integer not null default 900 check(alert_after_seconds between 300 and 86400)
);
insert into sfstore_maintenance.expiration_monitor(id) values(true);
create table sfstore_maintenance.expiration_runs (
 run_id uuid primary key,
 started_at timestamptz not null,
 finished_at timestamptz not null,
 executor text not null,
 status text not null check(status in ('completed','partial','failed','skipped_running')),
 batch_limit integer not null check(batch_limit between 1 and 100),
 released integer not null default 0 check(released>=0),
 due_before integer not null check(due_before>=0),
 due_after integer not null check(due_after>=0),
 oldest_due_at timestamptz,
 failures jsonb not null default '[]'::jsonb check(jsonb_typeof(failures)='array'),
 error_code text check(error_code is null or error_code ~ '^[A-Z0-9_]+$'),
 sqlstate text check(sqlstate is null or sqlstate ~ '^[A-Z0-9]{5}$'),
 result jsonb not null
);
create index expiration_runs_finished on sfstore_maintenance.expiration_runs(finished_at desc);
alter table sfstore_maintenance.expiration_monitor enable row level security;
alter table sfstore_maintenance.expiration_runs enable row level security;
revoke all on all tables in schema sfstore_maintenance from public,anon,authenticated,service_role,sfstore_reservation_executor;
-- Preserve the existing worker; only add a sanitized SQLSTATE to per-order failures.
create or replace function public.expire_checkout_reservations(p_limit integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare candidate record; released integer:=0; failures jsonb:='[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'CHECKOUT_INVALID_BATCH_LIMIT'; end if;
  for candidate in select o.id from public.orders o join public.checkout_operations op on op.order_id=o.id
    where op.state='pending' and op.expires_at<=clock_timestamp()
      and not exists(select 1 from public.checkout_payment_reports r where r.order_id=o.id and r.status='pending')
      and o.payment_status<>'paid'
      and not exists(select 1 from public.order_payments p where p.order_id=o.id and p.status='approved')
      and not exists(select 1 from public.checkout_manual_payments m where m.order_id=o.id)
    order by o.id limit p_limit for update of o skip locked
  loop
    begin
      perform public.transition_checkout_atomic(candidate.id,'expired'); released:=released+1;
    exception when others then
      failures:=failures || jsonb_build_array(jsonb_build_object('orderId',candidate.id,'code','CHECKOUT_EXPIRATION_FAILED','sqlstate',sqlstate));
    end;
  end loop;
  return jsonb_build_object('released',released,'failures',failures);
end $$;


-- Fixed, private capability boundary. Owner is the trusted migration/DBA role,
-- not the executor. Explicit objects/search_path, no dynamic SQL or caller identity inputs.
create function sfstore_maintenance.expiration_backlog()
returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('due',count(*),'oldestDueAt',min(op.expires_at))
 from public.checkout_operations op join public.orders o on o.id=op.order_id
 where op.state='pending' and op.expires_at<=clock_timestamp() and o.payment_status<>'paid'
 and not exists(select 1 from public.checkout_payment_reports r where r.order_id=o.id and r.status='pending')
 and not exists(select 1 from public.order_payments p where p.order_id=o.id and p.status='approved')
 and not exists(select 1 from public.checkout_manual_payments m where m.order_id=o.id)
$$;
revoke all on function sfstore_maintenance.expiration_backlog() from public,anon,authenticated,service_role,sfstore_reservation_executor;
create function sfstore_maintenance.run_checkout_expiration(p_run_id uuid,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='250ms' as $$
declare started timestamptz:=clock_timestamp(); before_run jsonb; after_run jsonb; batch jsonb;
 cached jsonb; outcome text; error_code text; failure_state text; answer jsonb;
 caller text:=coalesce(nullif(current_setting('role',true),'none'),session_user);
begin
 if p_run_id is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'CHECKOUT_INVALID_BATCH_LIMIT'; end if;
 -- Serialization is only for automatic runs. Manual worker keeps SKIP LOCKED.
 -- A same-ID replay waits for the original result; a new scheduled ID never overlaps work.
 perform pg_advisory_xact_lock(hashtextextended('checkout-expiration-run:'||p_run_id::text,0));
 select result into cached from sfstore_maintenance.expiration_runs where run_id=p_run_id;
 if found then return cached; end if;
 before_run:=sfstore_maintenance.expiration_backlog();
 if not pg_try_advisory_xact_lock(hashtextextended('checkout-expiration-worker',0)) then
  outcome:='skipped_running'; batch:=jsonb_build_object('released',0,'failures','[]'::jsonb);
 else
  begin
   -- Existing worker holds order locks, skips payments in progress, protects reports/paid,
   -- and rolls back each failed order independently using its exception subtransaction.
   batch:=public.expire_checkout_reservations(p_limit);
   outcome:=case when jsonb_array_length(batch->'failures')>0 then 'partial' else 'completed' end;
  exception when query_canceled or others then
   -- Whole batch rolled back inside this block. Never persist free-form error diagnostics.
   batch:=jsonb_build_object('released',0,'failures','[]'::jsonb);
   outcome:='failed'; error_code:='CHECKOUT_EXPIRATION_RUN_FAILED'; failure_state:=sqlstate;
  end;
 end if;
 after_run:=sfstore_maintenance.expiration_backlog();
 answer:=jsonb_build_object('runId',p_run_id,'status',outcome,'released',batch->'released','failures',batch->'failures',
  'dueBefore',before_run->'due','dueAfter',after_run->'due','oldestDueAt',after_run->'oldestDueAt',
  'errorCode',error_code,'sqlstate',failure_state,'startedAt',started,'finishedAt',clock_timestamp());
 insert into sfstore_maintenance.expiration_runs(run_id,started_at,finished_at,executor,status,batch_limit,released,due_before,due_after,oldest_due_at,failures,error_code,sqlstate,result)
 values(p_run_id,started,(answer->>'finishedAt')::timestamptz,caller,outcome,p_limit,(batch->>'released')::integer,
 (before_run->>'due')::integer,(after_run->>'due')::integer,(after_run->>'oldestDueAt')::timestamptz,batch->'failures',error_code,failure_state,answer);
 return answer;
end $$;
alter function sfstore_maintenance.run_checkout_expiration(uuid,integer) owner to postgres;
revoke all on function sfstore_maintenance.run_checkout_expiration(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function sfstore_maintenance.run_checkout_expiration(uuid,integer) to sfstore_reservation_executor;
-- Read-only aggregate RPC for the existing authenticated/allowlisted administrator.
-- No mutation capability or underlying maintenance table grants are exposed through HTTP.
create function public.get_checkout_expiration_health()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare cfg sfstore_maintenance.expiration_monitor%rowtype; backlog jsonb; latest timestamptz;
 last_run sfstore_maintenance.expiration_runs%rowtype; recent jsonb; protected integer;
begin
 select * into strict cfg from sfstore_maintenance.expiration_monitor where id;
 backlog:=sfstore_maintenance.expiration_backlog();
 select max(finished_at) into latest from sfstore_maintenance.expiration_runs where status in ('completed','partial');
 select * into last_run from sfstore_maintenance.expiration_runs order by finished_at desc limit 1;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into recent from (
  select started_at,finished_at,status,released,due_after,jsonb_array_length(failures) failed_orders,error_code,sqlstate
  from sfstore_maintenance.expiration_runs order by finished_at desc limit 10
 ) r;
 select count(*) into protected from public.checkout_operations op where op.state='pending' and op.expires_at<=clock_timestamp()
 and exists(select 1 from public.checkout_payment_reports r where r.order_id=op.order_id and r.status='pending');
 return backlog||jsonb_build_object('monitoringEnabled',cfg.monitoring_enabled,'intervalSeconds',cfg.interval_seconds,
 'alertAfterSeconds',cfg.alert_after_seconds,'lastProgressAt',latest,'protectedReports',protected,
 'heartbeatOverdue',cfg.monitoring_enabled and (latest is null or latest<clock_timestamp()-cfg.alert_after_seconds*interval '1 second'),
 'backlogOverdue',(backlog->>'oldestDueAt')::timestamptz<clock_timestamp()-cfg.alert_after_seconds*interval '1 second',
 'lastRunStatus',last_run.status,'recentRuns',recent);
end $$;
alter function public.get_checkout_expiration_health() owner to postgres;
revoke all on function public.get_checkout_expiration_health() from public,anon,authenticated,sfstore_reservation_executor;
grant execute on function public.get_checkout_expiration_health() to service_role;
comment on function sfstore_maintenance.run_checkout_expiration(uuid,integer) is
 'Unscheduled preparation. Only sfstore_reservation_executor may execute; no direct table/payment grants. Activate pg_cron separately after review.';
commit;
