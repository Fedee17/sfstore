-- Rollback of supabase/migrations/202611290001_product_change_history.sql.
-- Roll back the application first (the editor's «Historial de cambios» reads the table). Deletes the recorded history.
begin;
set local lock_timeout = '3s';
drop trigger if exists products_change_history on public.products;
drop function if exists public.record_product_changes();
drop table if exists public.product_change_events;
commit;
