-- Read-only verification of the candidate. Does not certify Production without execution.
-- Expected after migration, BEFORE configuration: 0 rows in violation queries,
-- configuration_rows=0 and enabled_configurations=0; two RLS-protected tables.
select relname, relrowsecurity from pg_class where oid in (
  to_regclass('public.checkout_configuration'),to_regclass('public.checkout_operations')) order by relname;
with targets as (select to_regclass('public.checkout_configuration') id union all select to_regclass('public.checkout_operations'))
select role.rolname,targets.id::regclass,privilege
from targets cross join pg_roles role cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
where role.rolname in ('anon','authenticated') and has_table_privilege(role.oid,targets.id,privilege);
select role.rolname,proc.oid::regprocedure as forbidden_execute
from pg_proc proc join pg_namespace ns on ns.oid=proc.pronamespace cross join pg_roles role
where ns.nspname='public' and proc.proname in ('create_checkout_atomic','transition_checkout_atomic',
 'guard_checkout_order','guard_checkout_item','guard_checkout_sale_movement')
and role.rolname in ('anon','authenticated') and has_function_privilege(role.oid,proc.oid,'EXECUTE');
select count(*) as configuration_rows,count(*) filter(where enabled) as enabled_configurations from public.checkout_configuration;
select count(*) as checkout_rows from public.checkout_operations;
select tgname,tgenabled from pg_trigger where not tgisinternal and tgname in
 ('guard_checkout_order','guard_checkout_item','guard_checkout_sale_movement') order by tgname;
-- Results: 3 enabled triggers (O); 5 new service-only functions (all true).
select proc.oid::regprocedure,has_function_privilege('service_role',proc.oid,'EXECUTE') as service_execute
from pg_proc proc join pg_namespace ns on ns.oid=proc.pronamespace
where ns.nspname='public' and proc.proname in ('create_checkout_atomic','transition_checkout_atomic',
 'guard_checkout_order','guard_checkout_item','guard_checkout_sale_movement') order by 1;
