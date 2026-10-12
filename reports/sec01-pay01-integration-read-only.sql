-- Metadata/configuration aggregates only; no buyer/order/image/object rows.
-- NOT executed in Production. Run only in an expressly authorized environment.
-- Also run sec01-permissions-read-only.sql for the wider boundary review.
begin read only;
select to_regclass('supabase_migrations.schema_migrations') as migration_history;
-- If the above exists, review version/name history separately against the manifest.
-- Manual SQL Editor application does not itself prove migration history is registered.
select a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull
from pg_attribute a where a.attrelid=to_regclass('public.product_storage_tasks')
  and a.attname='result' and not a.attisdropped;
select c.relname,c.relrowsecurity from pg_class c where c.oid in
(to_regclass('public.checkout_configuration'),to_regclass('public.checkout_operations'),to_regclass('public.checkout_manual_payments')) order by c.relname;
select r.rolname,
 has_column_privilege(r.oid,'public.inventory_movements','movement_type','UPDATE') as update_movement_type,
 has_column_privilege(r.oid,'public.inventory_movements','reason','UPDATE') as update_reason,
 has_table_privilege(r.oid,'public.inventory_movements','UPDATE') as broad_update,
 has_column_privilege(r.oid,'public.inventory_movements','quantity','UPDATE') as update_quantity
from pg_roles r where r.rolname in ('anon','authenticated','service_role') order by r.rolname;
select p.oid::regprocedure as signature,p.prosecdef as security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and p.proname in ('delete_product_image_metadata_and_queue','create_checkout_atomic','transition_checkout_atomic','confirm_checkout_manual_payment','expire_checkout_reservations') order by p.proname;
-- Review definitions against the candidate: permission checks alone cannot prove 25%/24h logic.
select p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('create_checkout_atomic','transition_checkout_atomic','expire_checkout_reservations') order by p.proname;
select conname,pg_get_constraintdef(oid) as definition from pg_constraint
where conrelid in ('public.checkout_configuration'::regclass,'public.orders'::regclass)
and conname in ('checkout_configuration_price_policy_check','orders_payment_method_check','orders_shipping_carrier_check') order by conname;
select count(*) filter(where enabled) as enabled_configurations,
 count(*) filter(where enabled and (reservation_seconds<>86400 or price_policy<>'manual_25_frozen' or buyer_authorization<>'authenticated')) as unsupported_enabled_configurations
from public.checkout_configuration;
commit;
