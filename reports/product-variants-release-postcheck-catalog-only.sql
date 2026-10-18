-- Project must be independently selected in Dashboard: xspvoicelbxlmtqoiolc.
-- Catalog-only: no business rows, function bodies or secrets in results. No application RPC execution.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s'; SET LOCAL search_path=pg_catalog,public;
WITH expected(kind,identity,sha256) AS (VALUES ('function','add_product_family_option(uuid,text,text[])','3052e427813dc6ee4a09e1cc0d1b92dd84467edc3f60b81863d9aac109834b35'),
('function','add_product_family_value(uuid,text)','b16962db0dc567238ff758205a91f049c723759d7ab6a601a9b90e8d6773fb35'),
('function','apply_sale_inventory(uuid,uuid)','411f7d1a688a1acfa9022b653e78d0c50e5d9ce4b34e8052210fc82d2c9c3fef'),
('function','configure_product_variant(uuid,uuid,text,jsonb,numeric,boolean,','8a5fbd43581a5c48f5b2c9160f80b4aa75cd4cb0fad00aa802ac7b3edfd61003'),
('function','confirm_checkout_manual_payment(uuid,uuid,uuid,numeric,text)','28ffefa013262ee496a840fae7efd16b0d535d0b16896af60c8b1cb8bf35d02a'),
('function','confirm_purchase(uuid,uuid)','2862fdd5f2f31a4b61c8c6cf72ce90829881fe03ae95abe0d0bb41b1d16ec94f'),
('function','create_checkout_atomic(uuid,uuid,jsonb)','2287feb306503223466063a4c74ef33d368986cd4d734352de49e851382a9a71'),
('function','create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','1f5ddec71a2832456aae8c94618564871b6566ef5f224911db9afb6af7f44229'),
('function','get_product_save_version(uuid)','355f0942d93465a449e09b5e8d5778639967b22c5db82df758b1742b2c223f3f'),
('function','get_variant_option_labels(products)','e34aa4c55d632f6aaca06191c1e26133dd99e61ceca492f39e8e2569c94509e0'),
('function','guard_variant_new_sale()','d0d1497f272b08d9c425343c2fc72cbf9fbcf40b56646b38f7d89b66541553e6'),
('function','guard_variant_public_slug()','268268de6fda349700c6fccaf10736455951ca6254bf2eaa64acdd3b31314687'),
('function','guard_variant_stock_sale()','308231e2fb7afcc8a1c167a913be3d8812c7e115ffdd5df8fbd1718ab586fed2'),
('function','list_product_family_variants(uuid,integer)','7e192513f51cd6140cbc62fa0e477771659cb102fa6025525e4e0c15f078b5f7'),
('function','lock_variant_catalog()','af1030859361f15b855e5a22cc45050938b70caafba3a25d39b322b2456f7fba'),
('function','propagate_family_price()','9cffea55e5e8d9da2c0130eefcfad398cca2d9795e4dfb39d56e04f4b346e46d'),
('function','protect_family_definition()','963fcf6281ec90f4d5f0b6b4a452cf31f71b970032d816a138b9fc12787b503c'),
('function','save_product_family(uuid,bigint,text,text,uuid,numeric)','421d1eed5fb7e2f5bd70a7a79c79b7ead2a082aab8cf4a7baa6aae23d180ddb2'),
('function','save_purchase_draft(uuid,uuid,date,numeric,text,uuid,jsonb)','fced3749ab8eb3b2ac1c61144f09d86b919be82cd54297835de554c518f45eb4'),
('function','set_product_commercial_label()','83b23d0a6928b3d998c19de63d87e0b1697e123ca42bff26cb9a17585de3ceb3'),
('function','snapshot_product_variant_line()','7efc1aabc8cf6e2f040492a43fc5e1926e55514dd4e9200c71088d0d8976e2fc'),
('function','transition_checkout_atomic(uuid,text)','0d4ccb95dbd1d75a82dc50f1df0d069c1ef2bd742456bdde2a62d4b979635e91'),
('function','update_family_inherited_prices()','d175ebf2695d3d3692bb8f2fde3d5a0155eb228a869e0e987dfc59d6352160e4'),
('function','validate_product_variant()','17208c936bbf7a065a80ef547820bd552f2258c7cab095f09459073d2d06dc65'),
('table','categories','53ddc9f6c23add956c1af1fb7df08b6e4dfafd35af722b559e52b2f2d82f26ae'),
('table','inventory_movements','f544de6baae63c98b42f7d7656567d0ecee67b36dc4ff1525cf6a801d0f5071b'),
('table','order_items','13ec58f40dfbea0befe58fbdc91c1bada5d6ab8f7c8deff12d872bdd8efa6cf8'),
('table','order_payments','57dd6d15a4ddc2a64f19984bfe4012b58840d684d8e1b637570aa1ba13da448c'),
('table','orders','4291f53735caf19758d7a403a2395465c7d831567bda06c6742a77f5ba504f05'),
('table','product_attributes','5f366458c329b2dbbbb3a16f558716913050a322898cccb3ef8cf0604b7b6015'),
('table','product_families','b586dcdfd8825f3b3882df156f6395a35f521ecf45223db357e317706c5c093f'),
('table','product_family_option_values','81fed1983d1c7a3c8ee943a430dad8bb281e36889db62ab4c5b5fd99099dd1ce'),
('table','product_family_options','6cba7df15ffc442a9ab37a343973beec7f78fe30fee8d17e53353083220c1f55'),
('table','product_images','715a971ac9f9b69b1ada5a2c7467e25f237edae09f36e20884baef32f7b56293'),
('table','products','6c246c28809476a56f70ed790c36a0b97d5a62a9e104e928a5080d86f6d18586'),
('table','public_catalog_skus','fac636fe38bfcb6ea05633d13097ac3c43177368f6f4a47792083a64c51dc3e2'),
('table','purchase_items','d6c47048aa31b274c20c5384d913e9c9f237989b8e7ff9acb136c9a9daa9dec6'),
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
 (select count(*)=4 from pg_class where relnamespace='public'::regnamespace and relname in('product_families','product_family_options','product_family_option_values','public_catalog_skus')) new_relations_present,
 exists(select 1 from pg_attribute where attrelid in('public.products'::regclass,'public.order_items'::regclass,'public.purchase_items'::regclass) and attname in('family_id','variant_choices','list_price_override','web_visible','commercial_blocked','commercial_label','family_id_snapshot','family_name_snapshot','variant_options_snapshot')) new_columns_present,
 (select count(*)=3 from pg_roles where rolname in('anon','authenticated','service_role')) roles_present,
 not exists(select 1 from pg_roles where rolname in('anon','authenticated') and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls)) public_roles_unprivileged,
 not exists(select 1 from pg_roles a join pg_roles p on (p.rolsuper or p.rolcreaterole or p.rolcreatedb or p.rolbypassrls) where a.rolname in('anon','authenticated') and pg_has_role(a.oid,p.oid,'MEMBER')) no_privileged_memberships,
 coalesce((select rolbypassrls and not rolsuper from pg_roles where rolname='service_role'),false) service_role_expected
)
SELECT jsonb_build_object('project_label','xspvoicelbxlmtqoiolc','commercial_rows_read',false,
 'all_checks_passed',read_only and database_matches and postgres17 and dependencies_match and new_relations_present and new_columns_present and roles_present and public_roles_unprivileged and no_privileged_memberships and service_role_expected,
 'checks',to_jsonb(checks),'dependency_mismatches',coalesce((select jsonb_agg(to_jsonb(mismatches)) from mismatches),'[]'::jsonb)) postcheck FROM checks;
ROLLBACK;
