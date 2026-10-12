-- FUTURE REVIEWED ACTIVATION ONLY. Not a migration. Tests exercise only rejection before registration.
-- Registers an INACTIVE job. Explicit activation is a separate operation in the runbook.
begin;
do $$ begin
 if current_setting('sfstore.expiration_setup_approved',true) is distinct from 'yes'
 or current_setting('sfstore.expected_database',true) is distinct from current_database() then
  raise exception 'EXPIRATION_SETUP_NOT_APPROVED_FOR_DATABASE';
 end if;
 if not exists(select 1 from pg_extension where extname='pg_cron') then
  raise exception 'EXPIRATION_PG_CRON_NOT_INSTALLED';
 end if;
 if exists(select 1 from cron.job where jobname='sfstore-checkout-expiration') then
  raise exception 'EXPIRATION_JOB_ALREADY_EXISTS_REVIEW_BEFORE_CHANGING';
 end if;
end $$;
select cron.schedule('sfstore-checkout-expiration','*/5 * * * *',$job$
begin;
set local role sfstore_reservation_executor;
set local statement_timeout='20s';
select sfstore_maintenance.run_checkout_expiration(gen_random_uuid(),100) as result;
commit;
$job$);
update cron.job set active=false where jobname='sfstore-checkout-expiration';
commit;
