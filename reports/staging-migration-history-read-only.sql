-- Metadata only. First verify this table exists; if absent, do NOT infer history.
begin transaction read only;
select to_regclass('supabase_migrations.schema_migrations') migration_ledger;
-- Run separately only if migration_ledger above exists:
select to_jsonb(h) migration_record from supabase_migrations.schema_migrations h where version in ('202609180002','202609180003') order by version;
select table_name,column_name,data_type from information_schema.columns where table_schema='public' and ((table_name='orders' and column_name='idempotency_key') or (table_name='suppliers' and column_name in ('contact_name','phone','email','whatsapp','website','address'))) order by table_name,column_name;
select p.oid::regprocedure signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_store_sale','complete_store_sale');
commit;
