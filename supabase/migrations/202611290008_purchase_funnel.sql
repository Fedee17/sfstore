-- Purchase funnel from the store's own data: how many browser tabs reached each step per day (Buenos Aires).
-- No personal data: no visitor, request, device or address is stored; the store marks each step once per tab in
-- sessionStorage and the server adds 1 to the day's total (lib/catalog/purchase-funnel.ts). Orders and payments are read
-- from public.orders, not from here. Additive only. Bounded: a day stops counting a step at 100.000 and rows older than
-- 180 days are removed on write. Rollback: reports/purchase-funnel-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.purchase_funnel_daily (
  day date not null,
  step text not null check (step in ('product', 'cart', 'checkout')),
  sessions integer not null default 1 check (sessions > 0),
  primary key (day, step)
);
alter table public.purchase_funnel_daily enable row level security;
revoke all on public.purchase_funnel_daily from public, anon, authenticated, service_role;
grant select on public.purchase_funnel_daily to service_role;

create function public.record_purchase_funnel_step(p_step text) returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_day date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  insert into public.purchase_funnel_daily(day, step) values (v_day, p_step)
  on conflict (day, step) do update set sessions = public.purchase_funnel_daily.sessions + 1
  where public.purchase_funnel_daily.sessions < 100000;
  delete from public.purchase_funnel_daily where day < v_day - 180;
end $$;
revoke all on function public.record_purchase_funnel_step(text) from public, anon, authenticated;
grant execute on function public.record_purchase_funnel_step(text) to service_role;
commit;
