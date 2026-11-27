-- Six store-sale lines (Sep-Oct 2026) were saved without a cost of goods, so their margin was unknown.
-- Owner decision 27/11/2026: use the cost each product has today. Values are fixed here (not read at run time):
--   18/09 Al Haramain Amber Oud Gold Edition $78.432,90 · 05/10 Lattafa Asad Bourbon $58.500 ·
--   05/10 Yara Elixir 100 ml $54.500 · 07/10 Cabezal iPhone Pata argentina $3.340,89 · 07/10 Cable 20W iPhone $3.650 ·
--   Fakhar Rose Gold $54.000 (loaded late on 09/11: its line already holds that same cost under the late-entry policy,
--   which the margin does not accept; it keeps the cost and only gets the owner policy).
-- Only order_items.unit_cost_snapshot and the order's cost metadata change (the previous cost policy is kept for the
-- rollback). Every line is checked first (same sale, product, quantity and subtotal, still without cost) or nothing runs.
-- Rollback: reports/store-sale-missing-costs-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create temp table store_sale_missing_costs (
  order_id uuid not null, product_id uuid not null, expected_subtotal numeric(12,2) not null,
  unit_cost numeric(12,2) not null check (unit_cost > 0), primary key (order_id, product_id)
) on commit drop;
insert into store_sale_missing_costs (order_id, product_id, expected_subtotal, unit_cost) values
  ('c65df7bb-2e98-4929-96ba-79b54cc7d348', '469e3f38-36cc-45fd-bc6e-5bd558d3acf1', 125492.64, 78432.90),
  ('7e066622-3115-47bb-9461-d101ca74e724', '13627ebe-ca04-46e0-9d26-d2861d1ee4a5', 85000.00, 58500.00),
  ('8378ea00-9a05-4a52-a8c3-d6b87c19b557', '919056a3-1dc9-4ae0-9f90-fbba8cf58be9', 81750.00, 54500.00),
  ('9eac9d79-0d14-4c22-9d61-6560e41a6dab', '753fd426-1a8c-49c6-8e17-60b57ea59b8b', 12000.00, 3340.89),
  ('9eac9d79-0d14-4c22-9d61-6560e41a6dab', '20530c08-7371-4726-8a0e-0c5023e7d513', 9000.00, 3650.00),
  ('bca0a91e-3611-4b8d-89d8-fa72be39cee1', 'c7659a2a-4bb5-439c-ba18-a62d2dd0c121', 81000.00, 54000.00);

create temp table store_sale_missing_cost_targets on commit drop as
select c.order_id, c.unit_cost, i.id as item_id, i.quantity, i.subtotal, c.expected_subtotal, i.unit_cost_snapshot, o.historical_import,
  o.metadata->>'cost_snapshot_policy' as policy
from store_sale_missing_costs c
join public.orders o on o.id = c.order_id
join public.order_items i on i.order_id = c.order_id and i.product_id = c.product_id;

do $preflight$
begin
  if (select count(*) from store_sale_missing_cost_targets) <> 6 or (select count(distinct item_id) from store_sale_missing_cost_targets) <> 6 then
    raise exception 'MISSING_COSTS_LINES_DO_NOT_MATCH';
  end if;
  if exists (select 1 from store_sale_missing_cost_targets
      where historical_import or quantity <> 1 or subtotal <> expected_subtotal
        or (unit_cost_snapshot is null and policy is not null)
        or (unit_cost_snapshot is not null and not (unit_cost_snapshot = unit_cost and policy = 'current_product_cost_at_late_entry_v1'))) then
    raise exception 'MISSING_COSTS_BASE_CHANGED';
  end if;
  -- The other lines of these sales must already have a cost, or their margin would still be partial.
  if exists (select 1 from public.order_items i where i.order_id in (select order_id from store_sale_missing_costs)
      and i.unit_cost_snapshot is null and i.id not in (select item_id from store_sale_missing_cost_targets)) then
    raise exception 'MISSING_COSTS_OTHER_LINES_WITHOUT_COST';
  end if;
end;
$preflight$;

update public.order_items i set unit_cost_snapshot = t.unit_cost
from store_sale_missing_cost_targets t where i.id = t.item_id and t.unit_cost_snapshot is null;
update public.orders o set metadata = o.metadata
  || jsonb_build_object('cost_snapshot_policy', 'current_product_cost_at_sale_v1', 'cost_source', 'owner_current_cost_20261127',
    'cost_policy_before_owner_fix', coalesce(o.metadata->>'cost_snapshot_policy', 'none'))
where o.id in (select distinct order_id from store_sale_missing_costs);

do $postcheck$
begin
  if (select count(*) from public.orders where metadata->>'cost_source' = 'owner_current_cost_20261127') <> 5 then
    raise exception 'MISSING_COSTS_POSTCHECK_FAILED';
  end if;
end;
$postcheck$;
commit;
