-- READ ONLY, catalog inspection and checkout configuration only. No business rows or function bodies returned.
-- Owner must independently select project xspvoicelbxlmtqoiolc; project_label is an expected label, not identity proof.
-- PRECHECK before requesting/executing the separately approved migration.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=pg_catalog,public;
WITH expected_functions(identity,owner,sha256) AS (VALUES
('apply_sale_inventory(uuid,uuid)','postgres','7dffa1b8a01bbd2736c49f456601d4cc8b86ecbbce6e7b25abecaf99cac92f97'),
('complete_store_sale(uuid,uuid)','postgres','c5a34b32e8d5ba74e597234e4ead0e5ef455c4ae0f7a46ca9222451b4c6cf11a'),
('create_checkout_atomic(uuid,uuid,jsonb)','postgres','bddef8b8c52355a1472d32063ec3a49b99ff1158dfb6178dc1b81a79d1caffd1'),
('create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','postgres','f9ee5a4c841f1be15753ab32fd425a1102a2cd57e46cf3125eb2b188657957f2'),
('create_store_sale(uuid,uuid,text,text,jsonb)','postgres','29089df7e746d06341732759696c57622212544da41325b971b54f40391b5654'),
('record_order_payment(uuid,text,numeric,text,text,text,timestamp with time zone,boolean)','postgres','955804eda84de4632c23ba432ca6528bda9cf22686b56bd0dc6eeb4e0e76fad4'),
('record_store_sale_payment_atomic(uuid,uuid,text,numeric,text)','postgres','ba584e5353d84052c514af5a702868d16240dbd65dbce7848fec6bcc328b07a2'),
('transition_checkout_atomic(uuid,text)','postgres','cc38e2eaaa640c142d80464b53f48346ec0548de267ff05659332435f9bd5ade')
),expected_tables(identity,sha256) AS (VALUES
('categories','84d2c287ec6127efe5f72d58989803a3af3d52ea63699c3fb33b29867fdca828'),
('inventory_movements','27657de13130596dd05b428d1ceeaefac37d530813393527fbdecd89ad69c1e8'),
('order_items','0dd02a9cd6e7b59d9827c33a4e5c41f3cf7e42a2df08ae1124348d65aebc682e'),
('order_payments','bb98b901030f1b1a40299d8278e332ef0d42e0460a8cea148156d75adbbe820c'),
('orders','6146ecacb9ace42849eccf73d381c4eb27c8c2cedce5d5447c4f51a8d847bc48'),
('products','b744a0d7ec819dce5948363b4465bb5fe0841771d531cd70ea2f3ba5ea41308a')
),expected_owners(identity,owner) AS (VALUES
('inventory_movements','postgres'),
('order_items','postgres'),
('order_payments','postgres'),
('orders','postgres'),
('products','postgres')
),actual_tables AS (select c.relname identity,encode(sha256(convert_to(jsonb_build_object(
   'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
   'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select jsonb_agg(jsonb_build_array(x.conname,x.contype,pg_get_constraintdef(x.oid),x.convalidated) order by x.conname) from pg_constraint x where x.conrelid=c.oid),
   'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname) from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid))::text,'UTF8')),'hex') sha256
   from pg_class c where c.relnamespace='public'::regnamespace and c.relname in('categories','products','orders','order_items','order_payments','inventory_movements') order by 1
),function_mismatches AS (
 SELECT e.identity FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.identity)
 WHERE p.oid IS NULL OR pg_get_userbyid(p.proowner)<>e.owner
 OR encode(sha256(convert_to(replace(pg_get_functiondef(p.oid),E'\r\n',E'\n'),'UTF8')),'hex')<>e.sha256
),table_mismatches AS (
 SELECT e.identity FROM expected_tables e LEFT JOIN actual_tables a USING(identity) WHERE a.sha256 IS DISTINCT FROM e.sha256
),owner_mismatches AS (
 SELECT e.identity FROM expected_owners e LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.identity)
 WHERE pg_get_userbyid(c.relowner) IS DISTINCT FROM e.owner
),required_access(relation,privilege) AS (VALUES
 ('categories','SELECT'),('products','SELECT'),('products','UPDATE'),('orders','SELECT'),('orders','INSERT'),('orders','UPDATE'),
 ('order_items','SELECT'),('order_items','INSERT'),('order_items','UPDATE'),('order_payments','SELECT'),('order_payments','INSERT'),('order_payments','UPDATE'),('inventory_movements','SELECT'),('inventory_movements','INSERT')
),checks(name,passed) AS (
 VALUES
 ('database_version',current_database()='postgres' AND current_setting('server_version_num')='170006'),
 ('function_contracts',NOT EXISTS(SELECT 1 FROM function_mismatches)),
 ('table_contracts',NOT EXISTS(SELECT 1 FROM table_mismatches)),
 ('owners',NOT EXISTS(SELECT 1 FROM owner_mismatches)),
 ('snapshot_columns',(SELECT count(*)=0 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='public'::regnamespace AND NOT a.attisdropped AND ((c.relname='order_items' AND a.attname IN('list_unit_price_snapshot','unit_cost_snapshot')) OR (c.relname='order_payments' AND a.attname='store_payment_method')))),
 ('service_access',NOT EXISTS(SELECT 1 FROM required_access a WHERE NOT has_table_privilege('service_role','public.'||a.relation,a.privilege))),
 ('service_rpc_execution',NOT EXISTS(SELECT 1 FROM expected_functions f WHERE NOT coalesce(has_function_privilege('service_role',to_regprocedure(f.identity),'EXECUTE'),false))),
 ('no_public_rpc_execution',NOT EXISTS(SELECT 1 FROM expected_functions f CROSS JOIN (VALUES('anon'),('authenticated')) r(role) WHERE coalesce(has_function_privilege(r.role,to_regprocedure(f.identity),'EXECUTE'),false))),
 ('no_public_commercial_writes',NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated')) r(role) CROSS JOIN expected_owners e CROSS JOIN (VALUES('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege) WHERE has_table_privilege(r.role,'public.'||e.identity,p.privilege))),
 ('public_roles_safe',(SELECT count(*)=2 AND bool_and(NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) FROM pg_roles WHERE rolname IN('anon','authenticated')) AND NOT EXISTS(SELECT 1 FROM pg_roles r CROSS JOIN pg_roles privileged WHERE r.rolname IN('anon','authenticated') AND (privileged.rolsuper OR privileged.rolbypassrls OR privileged.rolcreaterole OR privileged.rolcreatedb OR privileged.rolreplication) AND pg_has_role(r.oid,privileged.oid,'MEMBER'))),
 ('executor_ddl_rights',has_schema_privilege(current_user,'public','CREATE') AND NOT EXISTS(SELECT 1 FROM expected_owners e WHERE NOT pg_has_role(current_user,e.owner,'USAGE')) AND NOT EXISTS(SELECT 1 FROM expected_functions e WHERE e.identity LIKE 'create_store_sale_atomic(%' AND NOT pg_has_role(current_user,e.owner,'USAGE'))),
 ('online_configuration_unchanged',(SELECT count(*)=1 AND bool_and(enabled AND reservation_seconds=86400 AND price_policy='manual_25_frozen' AND buyer_authorization='authenticated' AND approved_revision='SFSTORE_FIRST_RELEASE_REVIEW' AND delivery_options='[{"method":"pickup","fee":0}]'::jsonb) FROM public.checkout_configuration)),
 ('no_waiting_relation_locks',NOT EXISTS(SELECT 1 FROM pg_locks l WHERE NOT l.granted AND l.pid<>pg_backend_pid() AND l.relation IN('public.order_items'::regclass,'public.order_payments'::regclass)))
)
SELECT jsonb_build_object(
 'read_only',current_setting('transaction_read_only')='on','commercial_rows_read',false,
 'project_label','xspvoicelbxlmtqoiolc','captured_at',clock_timestamp(),
 'all_checks_passed',bool_and(coalesce(passed,false)),
 'checks',jsonb_object_agg(name,coalesce(passed,false)),
 'function_mismatches',(SELECT coalesce(jsonb_agg(identity),'[]'::jsonb) FROM function_mismatches),
 'table_mismatches',(SELECT coalesce(jsonb_agg(identity),'[]'::jsonb) FROM table_mismatches),
 'owner_mismatches',(SELECT coalesce(jsonb_agg(identity),'[]'::jsonb) FROM owner_mismatches),
 'table_size_estimates',(SELECT jsonb_agg(jsonb_build_object('table',relname,'estimated_rows',reltuples::bigint,'pages',relpages)) FROM pg_class WHERE oid IN('public.order_items'::regclass,'public.order_payments'::regclass)),
 'activity_visibility',((SELECT rolsuper FROM pg_roles WHERE rolname=current_user) OR pg_has_role(current_user,'pg_read_all_stats','USAGE')),
 'long_transactions_visible',(SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND xact_start<clock_timestamp()-interval '30 seconds')
) AS preflight FROM checks;
ROLLBACK;
