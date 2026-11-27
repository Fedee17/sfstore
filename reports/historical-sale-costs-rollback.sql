-- Rollback of supabase/migrations/202611290005_historical_sale_costs.sql: the historical sales go back to
-- having no cost of goods. Roll back the application first. Touches only the rows that migration tagged.
begin;
set local lock_timeout = '3s';
select set_config('sfstore.historical_import', 'on', true);
update public.order_items i set unit_cost_snapshot = null
from public.orders o where i.order_id = o.id and o.metadata->>'cost_source' = 'owner_sheet_profit_20261127';
update public.orders set metadata = metadata - 'cost_snapshot_policy' - 'cost_source' - 'cost_zero_reason'
where metadata->>'cost_source' = 'owner_sheet_profit_20261127';
commit;
