-- Rollback of supabase/migrations/202611290003_bulk_price_adjustment.sql.
-- Roll back the application first (Productos > Ajustar precios calls this function). Prices already written stay;
-- their previous values are in product_change_events.
begin;
set local lock_timeout = '3s';
drop function if exists public.bulk_adjust_product_prices(jsonb);
commit;
