-- Phase2C: single metadata-only release gate. NOT a migration.
-- Run only in SQL Editor for xspvoicelbxlmtqoiolc. No business rows or function bodies.
-- The project label is a declared target, not independent identity verification.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
WITH required(table_name,column_name,expected_type) AS (
  VALUES
    ('orders','id','uuid'),
    ('orders','channel','text'),
    ('orders','status','text'),
    ('orders','payment_status','text'),
    ('orders','historical_import','boolean'),
    ('orders','historical_occurred_on','date'),
    ('orders','affects_inventory','boolean'),
    ('orders','created_at','timestamp with time zone'),
    ('orders','subtotal','numeric'),
    ('orders','discount','numeric'),
    ('orders','shipping_cost','numeric'),
    ('orders','total','numeric'),
    ('orders','metadata','jsonb'),
    ('order_items','id','uuid'),
    ('order_items','order_id','uuid'),
    ('order_items','product_id','uuid'),
    ('order_items','product_name','text'),
    ('order_items','category_name','text'),
    ('order_items','quantity','integer'),
    ('order_items','unit_price','numeric'),
    ('order_items','subtotal','numeric'),
    ('order_items','list_unit_price_snapshot','numeric'),
    ('order_items','unit_cost_snapshot','numeric'),
    ('order_payments','id','uuid'),
    ('order_payments','order_id','uuid'),
    ('order_payments','method','text'),
    ('order_payments','store_payment_method','text'),
    ('order_payments','status','text'),
    ('order_payments','amount','numeric'),
    ('order_payments','paid_at','timestamp with time zone'),
    ('purchases','id','uuid'),
    ('purchases','status','text'),
    ('purchases','historical_import','boolean'),
    ('purchases','historical_occurred_on','date'),
    ('purchases','affects_inventory','boolean'),
    ('purchases','purchase_date','date'),
    ('purchases','total_cost','numeric'),
    ('purchases','supplier_subtotal','numeric'),
    ('purchases','shipping_cost','numeric'),
    ('purchase_items','id','uuid'),
    ('purchase_items','purchase_id','uuid'),
    ('purchase_items','product_id','uuid'),
    ('purchase_items','product_name_snapshot','text'),
    ('purchase_items','quantity','integer'),
    ('purchase_items','unit_purchase_cost','numeric'),
    ('purchase_items','supplier_line_total','numeric'),
    ('purchase_items','effective_unit_cost','numeric'),
    ('purchase_items','effective_line_total','numeric'),
    ('historical_import_records','id','uuid'),
    ('historical_import_records','batch_id','uuid'),
    ('historical_import_records','source_sheet','text'),
    ('historical_import_records','source_row','integer'),
    ('historical_import_records','record_type','text'),
    ('historical_import_records','target_id','uuid'),
    ('products','id','uuid'),
    ('products','category_id','uuid'),
    ('historical_import_batches','id','uuid'),
    ('historical_import_batches','source_sha256','text'),
    ('orders','order_number','text'),
    ('purchases','supplier_name_snapshot','text'),
    ('purchases','total_units','integer')
), checked AS (
  SELECT r.*, c.oid AS table_oid, a.attnum, a.atttypid, a.atttypid=to_regtype(r.expected_type) AS type_matches,
    CASE WHEN c.oid IS NOT NULL AND a.attnum IS NOT NULL AND role.oid IS NOT NULL
      THEN has_column_privilege(role.oid,c.oid,a.attnum,'SELECT') ELSE false END AS service_select
  FROM required r
  LEFT JOIN pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=r.table_name AND c.relkind IN ('r','p')
  LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_roles role ON role.rolname='service_role'
), result AS (
 SELECT current_setting('transaction_read_only')='on' AS read_only,
   current_database()='postgres' AS database_matches,
   current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 AS postgres17,
   (SELECT count(*) FROM required) AS required_columns,
   COALESCE((SELECT bool_and(table_oid IS NOT NULL AND attnum IS NOT NULL) FROM checked),false) AS all_columns_present,
   COALESCE((SELECT bool_and(type_matches) FROM checked),false) AS all_types_match,
   COALESCE((SELECT bool_and(service_select) FROM checked),false) AS service_select_all,
   COALESCE((SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname='service_role'),false) AS service_rls_bypass,
   COALESCE((SELECT jsonb_agg(table_name||'.'||column_name ORDER BY table_name,column_name) FROM checked WHERE table_oid IS NULL OR attnum IS NULL),'[]'::jsonb) AS missing_columns,
   COALESCE((SELECT jsonb_agg(table_name||'.'||column_name ORDER BY table_name,column_name) FROM checked WHERE type_matches IS DISTINCT FROM true),'[]'::jsonb) AS type_mismatches,
   COALESCE((SELECT jsonb_agg(table_name||'.'||column_name ORDER BY table_name,column_name) FROM checked WHERE NOT service_select),'[]'::jsonb) AS denied_columns,
   (SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',format_type(atttypid,NULL)) ORDER BY table_name,column_name) FROM checked WHERE attnum IS NOT NULL) AS column_types
)
SELECT jsonb_build_object('project_label','xspvoicelbxlmtqoiolc','commercial_rows_read',false,
  'all_checks_passed',read_only AND database_matches AND postgres17 AND all_columns_present AND all_types_match AND service_select_all AND service_rls_bypass,
  'checks',to_jsonb(result)) AS preflight FROM result;
ROLLBACK;
