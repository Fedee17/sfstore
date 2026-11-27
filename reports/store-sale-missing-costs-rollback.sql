-- Rollback of supabase/migrations/202611290007_store_sale_missing_costs.sql: the six lines go back to having no cost and
-- the five sales get their previous cost policy back. Touches only the rows that migration tagged.
begin;
set local lock_timeout = '3s';
update public.order_items i set unit_cost_snapshot = null
from public.orders o
where i.order_id = o.id and o.metadata->>'cost_source' = 'owner_current_cost_20261127'
  and i.product_id in ('469e3f38-36cc-45fd-bc6e-5bd558d3acf1', '13627ebe-ca04-46e0-9d26-d2861d1ee4a5', '919056a3-1dc9-4ae0-9f90-fbba8cf58be9',
    '753fd426-1a8c-49c6-8e17-60b57ea59b8b', '20530c08-7371-4726-8a0e-0c5023e7d513', 'c7659a2a-4bb5-439c-ba18-a62d2dd0c121');
update public.orders set metadata = case when metadata->>'cost_policy_before_owner_fix' = 'none'
    then metadata - 'cost_snapshot_policy'
    else jsonb_set(metadata, '{cost_snapshot_policy}', to_jsonb(metadata->>'cost_policy_before_owner_fix')) end
  - 'cost_source' - 'cost_policy_before_owner_fix'
where metadata->>'cost_source' = 'owner_current_cost_20261127';
commit;
