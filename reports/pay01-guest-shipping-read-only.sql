begin transaction read only;
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='checkout_shipping_quote_requests';
select r.role_name,has_table_privilege(r.role_name,'public.checkout_shipping_quote_requests','SELECT') can_select,has_table_privilege(r.role_name,'public.checkout_shipping_quote_requests','INSERT') can_insert,has_table_privilege(r.role_name,'public.checkout_shipping_quote_requests','DELETE') can_delete from (values ('anon'),('authenticated'),('service_role')) r(role_name);
select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,has_function_privilege('service_role',p.oid,'EXECUTE') service_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_checkout_shipping_quote','request_checkout_shipping_quote');
commit;
