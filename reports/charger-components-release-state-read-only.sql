-- PREPARED ONLY. Owner must verify Dashboard project xspvoicelbxlmtqoiolc.
-- This label is not proof of the connected project's identity.
-- No business functions, customer rows, function bodies, or write statements.
-- Keep the result private. Read-only transaction does not restrict the executor's role.
begin read only;
set local statement_timeout='10s';
set local lock_timeout='3s';
with requested as (
 select 'aa56d2fc-ceda-4205-a52f-39c3f62102e5'::uuid purchase_id
), involved as (
 select distinct i.product_id from public.purchase_items i
 join requested r on r.purchase_id=i.purchase_id
), contracts as (
 select p.oid,p.oid::regprocedure::text signature,
  encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') body_sha256,
  pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
 from pg_proc p where p.pronamespace='public'::regnamespace
 and p.proname in('confirm_purchase','create_store_sale','create_store_sale_atomic',
  'create_checkout_atomic','request_checkout_shipping_quote','approve_checkout_shipping_quote',
  'transition_checkout_atomic','apply_sale_inventory','confirm_checkout_manual_payment')
), stock as (
 select p.id,p.status,p.stock,p.price,p.transfer_price,p.cost,p.updated_at,
  (select count(*) from public.product_images i where i.product_id=p.id) image_count
 from public.products p join involved i on i.product_id=p.id
), movements as (
 select m.id,m.product_id,m.movement_type,m.quantity,m.previous_stock,m.new_stock,m.created_at
 from public.inventory_movements m join involved i on i.product_id=m.product_id
), reservations as (
 select distinct op.order_id,op.state,op.expires_at
 from public.checkout_operations op
 join public.order_items line on line.order_id=op.order_id
 join involved i on i.product_id=line.product_id
 where op.state='pending'
), owners as (
 select c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity rls
 from pg_class c where c.relnamespace='public'::regnamespace
 and c.relname in('products','purchases','purchase_items','orders','order_items',
 'inventory_movements','checkout_operations')
), public_roles as (
 select r.rolname,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolbypassrls,
  exists(select 1 from pg_roles privileged where
   (privileged.rolsuper or privileged.rolcreaterole or privileged.rolbypassrls)
   and pg_has_role(r.oid,privileged.oid,'MEMBER')) privileged_membership
 from pg_roles r where r.rolname in('anon','authenticated')
)
select jsonb_build_object(
 'project_label','xspvoicelbxlmtqoiolc','read_only',current_setting('transaction_read_only')='on',
 'captured_at',statement_timestamp(),'server_version',current_setting('server_version_num'),
 'database_name',current_database(),
 'component_contract_present',to_regclass('public.component_recipes') is not null,
 'combo_price_contract_present',to_regclass('public.component_combo_pricing') is not null,
 'purchase',(select to_jsonb(p)-'notes'-'supplier_name_snapshot'-'created_by' from public.purchases p join requested r on r.purchase_id=p.id),
 'purchase_lines',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from public.purchase_items i join requested r on r.purchase_id=i.purchase_id),
 'products',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') from stock s),
 'movement_count',(select count(*) from movements),
 'movement_fingerprint',(select md5(coalesce(string_agg(to_jsonb(m)::text,E'\n' order by m.id),'')) from movements m),
 'nonterminal_order_references',(select coalesce(jsonb_agg(to_jsonb(r) order by r.order_id),'[]') from reservations r),
 'contracts',(select jsonb_agg(to_jsonb(c)-'oid' order by c.signature) from contracts c),
 'owners',(select jsonb_agg(to_jsonb(o) order by o.relname) from owners o),
 'public_roles',(select jsonb_agg(to_jsonb(r) order by r.rolname) from public_roles r),
 'review_required',true
) private_preflight;
rollback;
