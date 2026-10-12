-- Metadata/counts only. Expected on a freshly migrated, unconfigured isolated DB:
-- three protected tables; no forbidden privilege/EXECUTE rows; eight invoker
-- functions executable by service_role; zero config, operations and receipts.
select relname,relrowsecurity from pg_class where oid in
(to_regclass('public.checkout_configuration'),to_regclass('public.checkout_operations'),to_regclass('public.checkout_manual_payments')) order by relname;
with targets as (select unnest(array['public.checkout_configuration'::regclass,'public.checkout_operations'::regclass,'public.checkout_manual_payments'::regclass]) id)
select r.rolname,t.id::regclass,privilege from targets t cross join pg_roles r
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
where r.rolname in ('anon','authenticated') and has_table_privilege(r.oid,t.id,privilege);
select r.rolname,p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where n.nspname='public' and p.proname in ('create_checkout_atomic','transition_checkout_atomic','guard_checkout_order','guard_checkout_item',
'guard_checkout_sale_movement','guard_checkout_payment_entry','confirm_checkout_manual_payment','expire_checkout_reservations')
and r.rolname in ('anon','authenticated') and has_function_privilege(r.oid,p.oid,'EXECUTE');
select p.oid::regprocedure,p.prosecdef as security_definer,has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
('create_checkout_atomic','transition_checkout_atomic','guard_checkout_order','guard_checkout_item','guard_checkout_sale_movement',
'guard_checkout_payment_entry','confirm_checkout_manual_payment','expire_checkout_reservations') order by 1;
select (select count(*) from public.checkout_configuration) configuration_rows,
(select count(*) from public.checkout_configuration where enabled) enabled_configurations,
(select count(*) from public.checkout_operations) checkout_rows,
(select count(*) from public.checkout_manual_payments) manual_receipts;
