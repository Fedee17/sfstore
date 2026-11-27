-- Historical sales (sheet "Control de ventas", imported 09/2026) get the cost of goods they had when sold.
-- Owner decision 27/11/2026: the sheet's last column is the profit of each sale at that moment, so
-- unit cost = (imported line total - profit) / quantity. It is the real cost at sale, not the current product cost.
-- Owner-provided costs replace unusable profits: Cable 20W iPhone (20/12/2025, 01/12/2025, 24/07/2026) and
-- Cargador 3.8A (17/03/2026) $3.500; Cable USB-C x2 (21/12/2025) $3.500 + $3.800; Desodorante Asad (31/07/2026)
-- was a gift: cost $0, confirmed. The two broken decants (27/06/2026) were never imported.
-- Only order_items.unit_cost_snapshot and the order's cost metadata change; totals, payments, dates and stock do not.
-- Every row is checked first (one historical order, one line, same total and quantity, no cost yet) or nothing runs.
-- Rollback: reports/historical-sale-costs-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create temp table historical_sale_costs (
  source_row integer primary key, expected_subtotal numeric(12,2) not null, quantity integer not null,
  unit_cost numeric(12,2) not null check (unit_cost >= 0), gift boolean not null
) on commit drop;
insert into historical_sale_costs (source_row, expected_subtotal, quantity, unit_cost, gift) values
  (2, 35320.00, 1, 17660.00, false),
  (3, 20490.00, 1, 10000.00, false),
  (4, 20000.00, 1, 15000.00, false),
  (5, 37168.00, 1, 16160.00, false),
  (6, 20000.00, 1, 15000.00, false),
  (7, 20490.00, 1, 10000.00, false),
  (8, 20490.00, 1, 10000.00, false),
  (9, 20490.00, 1, 10000.00, false),
  (10, 35320.00, 1, 17660.00, false),
  (11, 35320.00, 1, 17660.00, false),
  (12, 35000.00, 1, 22500.00, false),
  (13, 63581.00, 1, 18166.00, false),
  (14, 63581.00, 1, 18166.00, false),
  (15, 5000.00, 1, 3000.00, false),
  (16, 60600.00, 1, 20200.00, false),
  (17, 20490.00, 1, 10000.00, false),
  (18, 20490.00, 1, 10000.00, false),
  (19, 37168.00, 1, 16160.00, false),
  (20, 60600.00, 1, 20200.00, false),
  (21, 63581.00, 1, 18166.00, false),
  (22, 15000.00, 1, 11000.00, false),
  (23, 54000.00, 1, 48425.00, false),
  (24, 69900.00, 1, 59800.00, false),
  (25, 25000.00, 2, 10500.00, false),
  (26, 29000.00, 1, 20900.00, false),
  (27, 29000.00, 1, 20900.00, false),
  (28, 37168.00, 1, 16160.00, false),
  (29, 35000.00, 1, 23000.00, false),
  (30, 35320.00, 1, 17660.00, false),
  (31, 15000.00, 1, 5000.00, false),
  (32, 45000.00, 1, 35000.00, false),
  (33, 58644.00, 1, 32400.00, false),
  (34, 29000.00, 1, 15000.00, false),
  (35, 49840.00, 1, 35600.00, false),
  (36, 36000.00, 1, 18000.00, false),
  (37, 36000.00, 1, 18000.00, false),
  (38, 58000.00, 1, 45000.00, false),
  (39, 10000.00, 1, 5845.00, false),
  (40, 74787.50, 1, 67296.50, false),
  (41, 95700.00, 1, 75629.00, false),
  (42, 25000.00, 1, 6719.00, false),
  (43, 100000.00, 1, 78920.00, false),
  (44, 22800.00, 1, 15200.00, false),
  (45, 35350.00, 1, 20200.00, false),
  (46, 46750.00, 1, 31750.00, false),
  (47, 7000.00, 1, 3500.00, false),
  (48, 7600.00, 2, 3650.00, false),
  (49, 26600.00, 1, 12600.00, false),
  (50, 26600.00, 1, 11600.00, false),
  (51, 26600.00, 1, 17480.00, false),
  (52, 13500.00, 1, 5845.00, false),
  (53, 25500.00, 1, 18281.00, false),
  (54, 3750.00, 1, 2375.00, false),
  (55, 7500.00, 1, 5850.00, false),
  (56, 93000.00, 1, 75629.00, false),
  (57, 5800.00, 1, 3500.00, false),
  (58, 27000.00, 1, 15900.00, false),
  (59, 27000.00, 1, 15900.00, false),
  (60, 28000.00, 1, 16800.00, false),
  (61, 13000.00, 1, 8000.00, false),
  (62, 27000.00, 1, 12678.00, false),
  (63, 7000.00, 1, 3500.00, false),
  (64, 63500.00, 1, 42500.00, false),
  (65, 8000.00, 1, 4150.00, false),
  (66, 41993.00, 1, 30350.00, false),
  (67, 27000.00, 1, 12678.00, false),
  (68, 28000.00, 1, 15200.00, false),
  (69, 53000.00, 1, 42300.00, false),
  (70, 8000.00, 1, 4150.00, false),
  (71, 8000.00, 1, 4150.00, false),
  (72, 5900.00, 1, 2939.00, false),
  (73, 31100.00, 1, 11550.00, false),
  (74, 11670.00, 1, 8000.00, false),
  (75, 11670.00, 1, 8000.00, false),
  (76, 11670.00, 1, 8000.00, false),
  (77, 33442.50, 1, 17149.50, false),
  (78, 5000.00, 1, 3700.00, false),
  (79, 27900.00, 1, 12640.00, false),
  (80, 41650.00, 1, 26500.00, false),
  (81, 23990.00, 1, 14900.00, false),
  (82, 27900.00, 1, 12640.00, false),
  (83, 27000.00, 1, 7300.00, false),
  (84, 6000.00, 1, 3400.00, false),
  (85, 27000.00, 1, 12678.00, false),
  (86, 55456.00, 1, 38065.00, false),
  (87, 57150.00, 1, 38100.00, false),
  (88, 25000.00, 1, 15435.00, false),
  (89, 27000.00, 1, 12678.00, false),
  (90, 19500.00, 1, 6500.00, false),
  (91, 11670.00, 1, 8000.00, false),
  (92, 11670.00, 1, 8000.00, false),
  (93, 11670.00, 1, 8000.00, false),
  (94, 18250.00, 1, 7300.00, false),
  (95, 65000.00, 1, 43350.00, false),
  (96, 29000.00, 1, 17660.00, false),
  (97, 31300.00, 1, 15682.00, false),
  (98, 28000.00, 1, 17000.00, false),
  (99, 30800.00, 1, 15435.00, false),
  (100, 30800.00, 1, 15435.00, false),
  (101, 45000.00, 1, 24650.00, false),
  (102, 36000.00, 1, 18125.00, false),
  (103, 32500.00, 1, 9998.00, false),
  (104, 29000.00, 1, 12640.00, false),
  (105, 51000.00, 1, 31930.00, false),
  (106, 61500.00, 1, 36200.00, false),
  (107, 29250.00, 1, 19500.00, false),
  (108, 29000.00, 1, 16999.00, false),
  (111, 24500.00, 1, 9998.00, false),
  (112, 5200.00, 1, 2750.00, false),
  (113, 18000.00, 1, 7300.00, false),
  (114, 36000.00, 1, 14640.00, false),
  (115, 35000.00, 1, 20600.00, false),
  (116, 31500.00, 1, 20600.00, false),
  (117, 9000.00, 1, 3500.00, false),
  (118, 29100.00, 1, 12640.00, false),
  (119, 29500.00, 1, 19500.00, false),
  (120, 31000.00, 1, 15000.00, false),
  (121, 33000.00, 1, 0.00, true),
  (122, 20000.00, 1, 7000.00, false),
  (123, 26700.00, 1, 8700.00, false),
  (124, 37000.00, 1, 20700.00, false),
  (125, 6500.00, 1, 1439.00, false),
  (126, 35000.00, 1, 20600.00, false),
  (127, 32500.00, 1, 9998.00, false),
  (128, 81675.00, 1, 54450.00, false),
  (129, 58650.00, 1, 39100.00, false),
  (130, 39000.00, 1, 15680.00, false),
  (131, 15000.00, 1, 5700.00, false),
  (132, 29750.00, 1, 19100.00, false);

create temp table historical_sale_cost_targets on commit drop as
select c.source_row, c.unit_cost, c.gift, r.target_id as order_id, i.id as item_id, i.subtotal, i.quantity, i.unit_cost_snapshot,
  o.metadata->>'cost_snapshot_policy' as policy, o.historical_import
from historical_sale_costs c
join public.historical_import_records r on r.source_sheet = 'Control de ventas' and r.source_row = c.source_row
  and r.record_type = 'sale' and r.target_table = 'orders'
join public.orders o on o.id = r.target_id
join public.order_items i on i.order_id = o.id;

do $preflight$
begin
  if (select count(*) from historical_sale_cost_targets) <> (select count(*) from historical_sale_costs)
    or (select count(distinct source_row) from historical_sale_cost_targets) <> (select count(*) from historical_sale_costs)
    or (select count(distinct order_id) from historical_sale_cost_targets) <> (select count(*) from historical_sale_costs) then
    raise exception 'HISTORICAL_COSTS_ROWS_DO_NOT_MATCH';
  end if;
  if exists (select 1 from historical_sale_cost_targets t join historical_sale_costs c using (source_row)
      where not t.historical_import or t.subtotal <> c.expected_subtotal or t.quantity <> c.quantity
        or t.unit_cost_snapshot is not null or t.policy is not null) then
    raise exception 'HISTORICAL_COSTS_BASE_CHANGED';
  end if;
end;
$preflight$;

-- Same opening the original import used; it ends with this transaction.
select set_config('sfstore.historical_import', 'on', true);
update public.order_items i set unit_cost_snapshot = t.unit_cost
from historical_sale_cost_targets t where i.id = t.item_id;
update public.orders o set metadata = o.metadata || jsonb_build_object('cost_snapshot_policy', 'current_product_cost_at_sale_v1', 'cost_source', 'owner_sheet_profit_20261127')
  || case when t.gift then jsonb_build_object('cost_zero_reason', 'owner_confirmed_gift') else '{}'::jsonb end
from historical_sale_cost_targets t where o.id = t.order_id;

do $postcheck$
begin
  if (select count(*) from public.orders where metadata->>'cost_source' = 'owner_sheet_profit_20261127') <> (select count(*) from historical_sale_costs) then
    raise exception 'HISTORICAL_COSTS_POSTCHECK_FAILED';
  end if;
end;
$postcheck$;
commit;
