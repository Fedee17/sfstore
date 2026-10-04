-- Read-only verification for 202610030001_atomic_store_sale_checkout.sql.
-- Run before and after the migration and compare the business-data snapshots.

select
  p.oid::regprocedure::text as signature,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  pg_get_function_result(p.oid) as return_type,
  pg_get_function_arguments(p.oid) as arguments,
  p.proconfig as function_config,
  md5(pg_get_functiondef(p.oid)) as definition_md5
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_store_sale_atomic',
    'record_store_sale_payment_atomic'
  )
order by p.proname;

with expected(signature) as (
  values
    ('public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)'),
    ('public.record_store_sale_payment_atomic(uuid,uuid,text,numeric,text)')
), resolved as (
  select signature, to_regprocedure(signature) as function_oid
  from expected
)
select
  signature,
  function_oid is not null as exists,
  case when function_oid is null then null else exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = function_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) end as public_can_execute,
  case when function_oid is null then null
    else has_function_privilege('anon', function_oid, 'EXECUTE') end as anon_can_execute,
  case when function_oid is null then null
    else has_function_privilege('authenticated', function_oid, 'EXECUTE') end as authenticated_can_execute,
  case when function_oid is null then null
    else has_function_privilege('service_role', function_oid, 'EXECUTE') end as service_role_can_execute
from resolved;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and (
    indexname = 'orders_store_idempotency_key_unique'
    or indexname = 'order_payments_method_reference_unique'
    or indexname = 'inventory_movements_sale_order_item_unique'
  )
order by indexname;

-- Stable, read-only business-data snapshots. Compare these values with the
-- snapshot captured immediately before applying the migration.
select
  'products' as dataset,
  count(*)::bigint as row_count,
  md5(coalesce(string_agg(
    concat_ws('|', id::text, stock::text, coalesce(cost::text, '<null>'),
      coalesce(cost_source_purchase_item_id::text, '<null>'), updated_at::text),
    E'\n' order by id
  ), '')) as stable_hash
from public.products;

select
  'orders' as dataset,
  count(*)::bigint as row_count,
  md5(coalesce(string_agg(
    concat_ws('|', id::text, order_number, channel, status, payment_status,
      subtotal::text, total::text, metadata::text, updated_at::text),
    E'\n' order by id
  ), '')) as stable_hash
from public.orders;

select
  'order_items' as dataset,
  count(*)::bigint as row_count,
  md5(coalesce(string_agg(
    concat_ws('|', id::text, order_id::text, coalesce(product_id::text, '<null>'),
      unit_price::text, quantity::text, subtotal::text, updated_at::text),
    E'\n' order by id
  ), '')) as stable_hash
from public.order_items;

select
  'order_payments' as dataset,
  count(*)::bigint as row_count,
  md5(coalesce(string_agg(
    concat_ws('|', id::text, order_id::text, method, amount::text, status,
      coalesce(reference, '<null>'), coalesce(paid_at::text, '<null>'), updated_at::text),
    E'\n' order by id
  ), '')) as stable_hash
from public.order_payments;

select
  'inventory_movements' as dataset,
  count(*)::bigint as row_count,
  md5(coalesce(string_agg(
    concat_ws('|', id::text, product_id::text, coalesce(order_id::text, '<null>'),
      coalesce(order_item_id::text, '<null>'), movement_type, quantity::text,
      previous_stock::text, new_stock::text, created_at::text),
    E'\n' order by id
  ), '')) as stable_hash
from public.inventory_movements;

