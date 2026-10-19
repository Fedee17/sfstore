-- SEC-01 inspection/verification: metadata only, no customer/order/object rows.
-- Prepared for an explicitly authorized environment; NOT executed in Production.
-- Successful checks here do not validate HTTP authorization, public bucket URL
-- downloads, unknown views/RPCs, role inheritance changes or future migrations.
begin read only;

select rolname, rolsuper, rolinherit, rolbypassrls, rolcanlogin
from pg_roles where rolname in ('anon', 'authenticated', 'service_role');
select member.rolname as member, parent.rolname as inherited_role
from pg_auth_members m join pg_roles member on member.oid=m.member
join pg_roles parent on parent.oid=m.roleid
where member.rolname in ('anon', 'authenticated', 'service_role');
select r.rolname, has_schema_privilege(r.rolname,'public','USAGE') as usage_allowed,
  has_schema_privilege(r.rolname,'public','CREATE') as create_allowed
from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role');

-- Include unknown objects so the reviewer can identify unversioned views/tables.
select n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity as rls, c.relforcerowsecurity as forced_rls, c.reloptions
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m')
  or n.nspname='storage' and c.relname in ('objects','buckets')
order by n.nspname,c.relname;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;

select r.rolname, c.relname, a.attname,
  has_column_privilege(r.rolname,c.oid,a.attnum,'SELECT') as can_select,
  has_column_privilege(r.rolname,c.oid,a.attnum,'INSERT') as can_insert,
  has_column_privilege(r.rolname,c.oid,a.attnum,'UPDATE') as can_update
from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
where r.rolname in ('anon','authenticated','service_role')
  and n.nspname='public' and c.relkind in ('r','p','v','m')
order by c.relname,r.rolname,a.attnum;

-- All public functions, including those not tracked by the SEC-01 migration.
select p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer, p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by p.proname,p.oid;
select pg_get_userbyid(d.defaclrole) as owner,n.nspname,d.defaclobjtype,d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace;
-- Public visibility is bucket-level metadata. Does not list/download objects.
select id, public from storage.buckets where id='product-images';

-- ACL/role/coverage checks; policy expressions and unknown exposed objects above
-- still require review. Expected: 0 violations after the candidate is applied.
with expected(name) as (values
  ('categories'),('products'),('product_images'),('product_attributes'),
  ('customers'),('orders'),('order_items'),('settings'),('inventory_movements'),('analytics_events'),
  ('suppliers'),('purchases'),('purchase_items'),('order_payments'),
  ('historical_import_batches'),('historical_import_records'),('product_save_operations'),('product_storage_tasks')
), untrusted(role) as (values ('anon'::text),('authenticated'::text)), checks as (
  select 'missing_or_rls_disabled:'||e.name as problem from expected e
  left join pg_class c on c.oid=to_regclass('public.'||e.name) where c.oid is null or not c.relrowsecurity
  union all
  select 'unsafe_role_or_schema:'||u.role from untrusted u left join pg_roles r on r.rolname=u.role
  where r.oid is null or r.rolsuper or r.rolbypassrls or has_schema_privilege(u.role,'public','CREATE')
  union all
  select 'privileged_membership:'||u.role||':'||trusted.rolname from untrusted u cross join pg_roles trusted
  where (trusted.rolsuper or trusted.rolbypassrls) and pg_has_role(u.role,trusted.oid,'MEMBER')
  union all
  select 'public_mutation:'||u.role||':'||e.name from untrusted u cross join expected e
  join pg_class c on c.oid=to_regclass('public.'||e.name)
  where has_table_privilege(u.role,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege(u.role,c.oid,'INSERT,UPDATE,REFERENCES')
  union all
  select 'private_read:'||u.role||':'||e.name from untrusted u cross join expected e
  join pg_class c on c.oid=to_regclass('public.'||e.name)
  where e.name not in ('categories','products','product_images','product_attributes')
    and has_any_column_privilege(u.role,c.oid,'SELECT')
  union all
  select 'internal_catalog_column:'||u.role||':'||c.relname||'.'||a.attname
  from untrusted u cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  where n.nspname='public' and c.relname in ('categories','products','product_images','product_attributes')
    and has_column_privilege(u.role,c.oid,a.attnum,'SELECT') and not (a.attname = any(case c.relname
      when 'categories' then array['id','name','slug','is_active']
      when 'products' then array['id','name','slug','short_description','description','price','transfer_price',
        'stock','featured','status','historical_identity','category_id']
      when 'product_images' then array['product_id','url','alt','sort_order','is_primary']
      else array['product_id','name','value','sort_order'] end))
  union all
  select 'critical_rpc:'||u.role||':'||p.proname from untrusted u cross join pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('confirm_purchase','adjust_inventory_stock','apply_sale_inventory','record_order_payment',
      'create_store_sale_atomic','record_store_sale_payment_atomic','save_customer_order','deliver_order',
      'create_product_atomic','update_product_atomic','enqueue_product_storage_task','delete_product_image_metadata_and_queue')
    and has_function_privilege(u.role,p.oid,'EXECUTE')
  union all
  select 'missing_critical_rpc:'||required.name from (values
    ('confirm_purchase'),('adjust_inventory_stock'),('apply_sale_inventory'),('record_order_payment'),
    ('create_store_sale_atomic'),('record_store_sale_payment_atomic'),('save_customer_order'),('deliver_order'),
    ('create_product_atomic'),('update_product_atomic'),('enqueue_product_storage_task'),('delete_product_image_metadata_and_queue')
  ) required(name) where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=required.name)
  union all
  select 'storage_guard_or_rls_missing' where not exists (
    select 1 from pg_class c join pg_policies p on p.schemaname='storage' and p.tablename=c.relname
    where c.oid=to_regclass('storage.objects') and c.relrowsecurity
      and p.policyname='sec01_product_images_server_only' and p.permissive='RESTRICTIVE' and p.cmd='ALL')
)
select count(*)::int as violations, coalesce(jsonb_agg(problem),'[]'::jsonb) as details from checks;
commit;
