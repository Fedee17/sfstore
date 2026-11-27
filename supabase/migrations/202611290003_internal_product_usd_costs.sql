begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.internal_product_usd_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  unit_cost_usd numeric(8,2) not null check (unit_cost_usd > 0 and unit_cost_usd <= 999999.99),
  target_profit_percent numeric(11,4) check (target_profit_percent between 0 and 9999999.9999)
);

alter table public.internal_product_usd_costs enable row level security;
revoke all on public.internal_product_usd_costs from public, anon, authenticated, service_role;
grant select, insert, update on public.internal_product_usd_costs to service_role;

commit;
