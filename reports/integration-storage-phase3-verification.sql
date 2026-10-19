-- Read-only catalog checks. Execute only when a schema inspection is authorized.
-- No data rows, worker, migrations or Storage APIs are executed by this SQL.
with result_column as (
  select data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'product_storage_tasks'
    and column_name = 'result'
), wrapper as (
  select p.* from pg_proc p
  where p.oid = to_regprocedure('public.delete_product_image_metadata_and_queue(uuid,uuid,text,text)')
)
select
  to_regclass('public.product_storage_tasks') is not null as tasks_table_exists,
  to_regclass('public.product_save_operations') is not null as operations_table_exists,
  to_regprocedure('public.delete_product_image_metadata(uuid,uuid)') is not null as previous_delete_rpc_exists,
  to_regprocedure('public.enqueue_product_storage_task(uuid,uuid,text,text,jsonb,uuid)') is not null as enqueue_rpc_exists,
  exists(select from result_column where data_type = 'jsonb' and is_nullable = 'YES' and column_default is null) as result_nullable_jsonb_without_default,
  exists(select from wrapper where not prosecdef and prorettype = 'jsonb'::regtype) as wrapper_invoker_jsonb,
  exists(select from wrapper where proconfig @> array['search_path=pg_catalog, public']) as wrapper_search_path_expected,
  exists(select from wrapper where proargnames = array['p_product_id','p_image_id','p_expected_url','p_storage_path']) as wrapper_argument_names_expected,
  exists(select from wrapper where has_function_privilege((select oid from pg_roles where rolname = 'service_role'), oid, 'EXECUTE')) as service_role_execute,
  exists(select from wrapper) and not exists(select from wrapper where has_function_privilege((select oid from pg_roles where rolname = 'anon'), oid, 'EXECUTE')) as anon_execute_denied,
  exists(select from wrapper) and not exists(select from wrapper where has_function_privilege((select oid from pg_roles where rolname = 'authenticated'), oid, 'EXECUTE')) as authenticated_execute_denied,
  exists(select from wrapper) and not exists(
    select from wrapper w, lateral aclexplode(coalesce(w.proacl, acldefault('f', w.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) as public_execute_denied;

-- Review the installed body against the migration; presence/grants alone do not
-- certify its implementation. Returns function DDL only, no operational records.
select pg_get_functiondef(p.oid) as installed_wrapper_definition
from pg_proc p
where p.oid = to_regprocedure('public.delete_product_image_metadata_and_queue(uuid,uuid,text,text)');
