// Catalog-only release checks. Never invokes application functions or reads business rows.
export const dependencyTables=['categories','products','product_images','product_attributes','orders','order_items','order_payments','inventory_movements','purchases','purchase_items','suppliers','product_families','product_family_options','product_family_option_values','public_catalog_skus'];
export const dependencyFunctions=['save_product_atomic','get_product_save_version','create_store_sale_atomic','create_checkout_atomic','transition_checkout_atomic','confirm_checkout_manual_payment','confirm_purchase','save_purchase_draft','expire_pending_checkouts','apply_sale_inventory','lock_variant_catalog','validate_product_variant','protect_family_definition','propagate_family_price','update_family_inherited_prices','guard_variant_new_sale','guard_variant_stock_sale','save_product_family','add_product_family_option','add_product_family_value','configure_product_variant','list_product_family_variants','get_variant_option_labels','set_product_commercial_label','snapshot_product_variant_line','guard_variant_public_slug'];
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const tables=dependencyTables.map(literal).join(','),functions=dependencyFunctions.map(literal).join(',');
export const catalogRowsSql=`
with relations as (
 select 'table' kind,c.relname identity,encode(sha256(convert_to(jsonb_build_object(
 'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable) order by pg_get_userbyid(x.grantor),x.grantee=0,pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x),'view',case when c.relkind='v' then pg_get_viewdef(c.oid,true) end,
 'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),(select jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable) order by pg_get_userbyid(x.grantor),x.grantee=0,pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable) from aclexplode(a.attacl) x)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_array(x.conname,x.contype,pg_get_constraintdef(x.oid),x.convalidated) order by x.conname) from pg_constraint x where x.conrelid=c.oid),
 'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname) from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid),
 'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
 'policies',(select jsonb_agg(jsonb_build_array(p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname),
 'effective',(select jsonb_agg(jsonb_build_array(r.rolname,v.privilege,has_table_privilege(r.oid,c.oid,v.privilege)) order by r.rolname,v.privilege) from pg_roles r cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege) where r.rolname in('anon','authenticated','service_role'))
 )::text,'UTF8')),'hex') sha256 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in(${tables}) and c.relkind in('r','v')
),functions as (
 select 'function' kind,p.oid::regprocedure::text identity,encode(sha256(convert_to(jsonb_build_object('owner',pg_get_userbyid(p.proowner),'definition',replace(pg_get_functiondef(p.oid),E'\\r\\n',E'\\n'),'acl',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable) order by pg_get_userbyid(x.grantor),x.grantee=0,pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x),'effective',(select jsonb_agg(jsonb_build_array(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE')) order by r.rolname) from pg_roles r where r.rolname in('anon','authenticated','service_role')))::text,'UTF8')),'hex') sha256 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in(${functions})
) select * from relations union all select * from functions order by 1,2`;
export function preflightSql(expected,phase="before"){
 const values=expected.map(r=>`(${literal(r.kind)},${literal(r.identity)},${literal(r.sha256)})`).join(',\n');
 let sql=`-- Project must be independently selected in Dashboard: xspvoicelbxlmtqoiolc.
-- Catalog-only: no business rows, function bodies or secrets in results. No application RPC execution.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s'; SET LOCAL search_path=pg_catalog,public;
WITH expected(kind,identity,sha256) AS (VALUES ${values}), actual AS (${catalogRowsSql}),
 mismatches AS (select coalesce(e.kind,a.kind) kind,coalesce(e.identity,a.identity) identity from expected e full join actual a using(kind,identity) where a.sha256 is distinct from e.sha256), checks AS (
 select current_setting('transaction_read_only')='on' read_only,current_database()='postgres' database_matches,
 current_setting('server_version_num')::int between 170000 and 179999 postgres17,
 not exists(select 1 from mismatches) dependencies_match,
 not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname in('product_families','product_family_options','product_family_option_values','public_catalog_skus')) new_relations_absent,
 not exists(select 1 from pg_attribute where attrelid in('public.products'::regclass,'public.order_items'::regclass,'public.purchase_items'::regclass) and attname in('family_id','variant_choices','list_price_override','web_visible','commercial_blocked','commercial_label','family_id_snapshot','family_name_snapshot','variant_options_snapshot')) new_columns_absent,
 (select count(*)=3 from pg_roles where rolname in('anon','authenticated','service_role')) roles_present,
 not exists(select 1 from pg_roles where rolname in('anon','authenticated') and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls)) public_roles_unprivileged,
 not exists(select 1 from pg_roles a join pg_roles p on (p.rolsuper or p.rolcreaterole or p.rolcreatedb or p.rolbypassrls) where a.rolname in('anon','authenticated') and pg_has_role(a.oid,p.oid,'MEMBER')) no_privileged_memberships,
 coalesce((select rolbypassrls and not rolsuper from pg_roles where rolname='service_role'),false) service_role_expected
)
SELECT jsonb_build_object('project_label','xspvoicelbxlmtqoiolc','commercial_rows_read',false,
 'all_checks_passed',read_only and database_matches and postgres17 and dependencies_match and new_relations_absent and new_columns_absent and roles_present and public_roles_unprivileged and no_privileged_memberships and service_role_expected,
 'checks',to_jsonb(checks),'dependency_mismatches',coalesce((select jsonb_agg(to_jsonb(mismatches)) from mismatches),'[]'::jsonb)) preflight FROM checks;
ROLLBACK;
`;
 if(phase==='after'){
  sql=sql.replaceAll('new_relations_absent','new_relations_present').replaceAll('new_columns_absent','new_columns_present');
  sql=sql.replace("not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname in('product_families','product_family_options','product_family_option_values','public_catalog_skus'))","(select count(*)=4 from pg_class where relnamespace='public'::regnamespace and relname in('product_families','product_family_options','product_family_option_values','public_catalog_skus'))");
  sql=sql.replace("not exists(select 1 from pg_attribute where attrelid in(","exists(select 1 from pg_attribute where attrelid in(");
  sql=sql.replace(')) preflight FROM checks', ')) postcheck FROM checks');
 }
 return sql;
}
