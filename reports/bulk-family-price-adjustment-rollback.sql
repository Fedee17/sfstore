-- Rollback of supabase/migrations/202611290004_bulk_family_price_adjustment.sql.
-- Roll back the application first (Familias > Ajustar precios calls this function). Prices already written stay;
-- variant price changes are in product_change_events.
begin;
set local lock_timeout = '3s';
drop function if exists public.bulk_adjust_family_prices(jsonb);
commit;
