-- Product change history: every change to a product's prices, status or visibility, whatever wrote it (editor,
-- families, imports, quick actions, SQL Editor). One row per changed field; rows from one save share changed_at.
-- Additive only: a new table, a function and an AFTER trigger. No product data is read back or written; units on
-- hand are not tracked here because inventory_movements already audits them.
-- source: 'app' when the write came through the server (PostgREST request with the service_role key),
-- 'database' otherwise (SQL Editor, scripts). There is no per-user actor: product saves do not carry one.
-- Rollback: reports/product-change-history-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.product_change_events (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  changed_at timestamptz not null default now(),
  field text not null check (field in ('price', 'transfer_price', 'compare_at_price', 'cost', 'status', 'web_visible', 'commercial_blocked')),
  old_value text,
  new_value text,
  source text not null check (source in ('app', 'database'))
);
create index product_change_events_product_idx on public.product_change_events(product_id, changed_at desc);
alter table public.product_change_events enable row level security;
revoke all on public.product_change_events from public, anon, authenticated, service_role;
grant select on public.product_change_events to service_role;

create function public.record_product_changes() returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  insert into public.product_change_events(product_id, field, old_value, new_value, source)
  select new.id, c.field, c.old_value, c.new_value, case when v_role = 'service_role' then 'app' else 'database' end
  from (values
    ('price', old.price::text, new.price::text),
    ('transfer_price', old.transfer_price::text, new.transfer_price::text),
    ('compare_at_price', old.compare_at_price::text, new.compare_at_price::text),
    ('cost', old.cost::text, new.cost::text),
    ('status', old.status::text, new.status::text),
    ('web_visible', old.web_visible::text, new.web_visible::text),
    ('commercial_blocked', old.commercial_blocked::text, new.commercial_blocked::text)
  ) as c(field, old_value, new_value)
  where c.old_value is distinct from c.new_value;
  return null;
end $$;
revoke all on function public.record_product_changes() from public, anon, authenticated, service_role;

create trigger products_change_history
  after update of price, transfer_price, compare_at_price, cost, status, web_visible, commercial_blocked on public.products
  for each row execute function public.record_product_changes();
commit;
