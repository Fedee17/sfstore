-- Project must be independently selected in Dashboard: xspvoicelbxlmtqoiolc.
-- Catalog-only: no business rows, function bodies or secrets in results. No application RPC execution.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s'; SET LOCAL search_path=pg_catalog,public;
WITH expected(kind,identity,sha256) AS (VALUES ('function','apply_sale_inventory(uuid,uuid)','411f7d1a688a1acfa9022b653e78d0c50e5d9ce4b34e8052210fc82d2c9c3fef'),
('function','confirm_checkout_manual_payment(uuid,uuid,uuid,numeric,text)','28ffefa013262ee496a840fae7efd16b0d535d0b16896af60c8b1cb8bf35d02a'),
('function','confirm_purchase(uuid,uuid)','2862fdd5f2f31a4b61c8c6cf72ce90829881fe03ae95abe0d0bb41b1d16ec94f'),
('function','create_checkout_atomic(uuid,uuid,jsonb)','2287feb306503223466063a4c74ef33d368986cd4d734352de49e851382a9a71'),
('function','create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','1f5ddec71a2832456aae8c94618564871b6566ef5f224911db9afb6af7f44229'),
('function','get_product_save_version(uuid)','355f0942d93465a449e09b5e8d5778639967b22c5db82df758b1742b2c223f3f'),
('function','save_purchase_draft(uuid,uuid,date,numeric,text,uuid,jsonb)','fced3749ab8eb3b2ac1c61144f09d86b919be82cd54297835de554c518f45eb4'),
('function','transition_checkout_atomic(uuid,text)','0d4ccb95dbd1d75a82dc50f1df0d069c1ef2bd742456bdde2a62d4b979635e91'),
('table','categories','53ddc9f6c23add956c1af1fb7df08b6e4dfafd35af722b559e52b2f2d82f26ae'),
('table','inventory_movements','1cd528eae36e21fbf4547cc14983ba90ef8605cce04c988bce33a5f88e61a0f0'),
('table','order_items','5af2ec9cf70134fa11557b5a17ea0df5a392ae310d8a10dc95e55086730462b8'),
('table','order_payments','57dd6d15a4ddc2a64f19984bfe4012b58840d684d8e1b637570aa1ba13da448c'),
('table','orders','4291f53735caf19758d7a403a2395465c7d831567bda06c6742a77f5ba504f05'),
('table','product_attributes','5f366458c329b2dbbbb3a16f558716913050a322898cccb3ef8cf0604b7b6015'),
('table','product_images','715a971ac9f9b69b1ada5a2c7467e25f237edae09f36e20884baef32f7b56293'),
('table','products','97a4068374f004f5b70249565e21517f1c07157294ae7d3d12c1c278ad31244b'),
('table','purchase_items','59c674f71647cea7b7a3bd15b52fb83e93000c7784cbb0321624189bdf1ae6a0'),
('table','purchases','1e196600caacb0514d7ab6702517cc84de98fa05882616bd2558efc75e685c0f'),
('table','suppliers','59db59c8a7c661d1546ca575f1c8d1ccf11ea2a3fee68d8b36f6a445dfc48351')), actual AS (
with relations as (
 select 'table' kind,c.relname identity,encode(sha256(convert_to(jsonb_build_object(
 'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable) order by pg_get_userbyid(x.grantor),x.grantee=0,pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x),'view',case when c.relkind='v' then pg_get_viewdef(c.oid,true) end,
 'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),(select jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable) order by pg_get_userbyid(x.grantor),x.grantee=0,pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable) from aclexplode(a.attacl) x)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_array(x.conname,x.contype,pg_get_constraintdef(x.oid),x.convalidated) order by x.conname) from pg_constraint x where x.conrelid=c.oid),
 'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname) from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid),
 'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
 'policies',(select jsonb_agg(jsonb_build_array(p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname),
 'effective',(select jsonb_agg(jsonb_build_array(r.rolname,v.privilege,has_table_privilege(r.oid,c.oid,v.privilege)) order by r.rolname,v.privilege) from pg_roles r cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege) where r.rolname in('anon','authenticated','service_role'))
 )::text,'UTF8')),'hex') sha256 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in('categories','products','product_images','product_attributes','orders','order_items','order_payments','inventory_movements','purchases','purchase_items','suppliers','product_families','product_family_options','product_family_option_values','public_catalog_skus') and c.relkind in('r','v')
),functions as (
 select 'function' kind,p.oid::regprocedure::text identity,encode(sha256(convert_to(jsonb_build_object('owner',pg_get_userbyid(p.proowner),'definition',replace(pg_get_functiondef(p.oid),E'\r\n',E'\n'),'acl',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable) order by pg_get_userbyid(x.grantor),x.grantee=0,pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x),'effective',(select jsonb_agg(jsonb_build_array(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE')) order by r.rolname) from pg_roles r where r.rolname in('anon','authenticated','service_role')))::text,'UTF8')),'hex') sha256 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in('save_product_atomic','get_product_save_version','create_store_sale_atomic','create_checkout_atomic','transition_checkout_atomic','confirm_checkout_manual_payment','confirm_purchase','save_purchase_draft','expire_pending_checkouts','apply_sale_inventory','lock_variant_catalog','validate_product_variant','protect_family_definition','propagate_family_price','update_family_inherited_prices','guard_variant_new_sale','guard_variant_stock_sale','save_product_family','add_product_family_option','add_product_family_value','configure_product_variant','list_product_family_variants','get_variant_option_labels','set_product_commercial_label','snapshot_product_variant_line','guard_variant_public_slug')
) select * from relations union all select * from functions order by 1,2),
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
