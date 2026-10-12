begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Keep applied 003 intact. Explicit pg_temp last prevents implicit temporary-table
-- precedence in the privileged expiration call chain. No ACL or business-rule changes.
alter function sfstore_maintenance.run_checkout_expiration(uuid,integer) set search_path=pg_catalog,public,pg_temp;
alter function sfstore_maintenance.expiration_backlog() set search_path=pg_catalog,public,pg_temp;
alter function public.get_checkout_expiration_health() set search_path=pg_catalog,public,pg_temp;
-- Legacy trigger reads products/orders/purchases without schema qualification.
-- It also executes during the definer's release, with the caller's temporary schema.
alter function public.prevent_historical_inventory_movement() set search_path=pg_catalog,public,pg_temp;
commit;
