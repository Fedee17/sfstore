-- Store searches without exact results, aggregated per day (Buenos Aires) and normalized term. No personal data:
-- no visitor, request or device is stored, and the term is re-checked here (length, no e-mail, no long numbers)
-- after the application already normalized it (lib/catalog/search-demand.ts). Additive only.
-- Bounded: at most 500 distinct terms per day (later new terms are ignored, known ones still count) and rows older
-- than 180 days are removed on write. Rollback: reports/search-demand-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.search_demand_daily (
  day date not null,
  term text not null check (length(term) between 2 and 60 and term = lower(term) and term !~ '[0-9]{6}' and position('@' in term) = 0),
  outcome text not null check (outcome in ('none', 'approximate')),
  searches integer not null default 1 check (searches > 0),
  primary key (day, term, outcome)
);
alter table public.search_demand_daily enable row level security;
revoke all on public.search_demand_daily from public, anon, authenticated, service_role;
grant select on public.search_demand_daily to service_role;

create function public.record_search_demand(p_term text, p_outcome text) returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_day date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not exists (select 1 from public.search_demand_daily where day = v_day and term = p_term and outcome = p_outcome)
    and (select count(*) from public.search_demand_daily where day = v_day) >= 500 then
    return;
  end if;
  insert into public.search_demand_daily(day, term, outcome) values (v_day, p_term, p_outcome)
  on conflict (day, term, outcome) do update set searches = public.search_demand_daily.searches + 1;
  delete from public.search_demand_daily where day < v_day - 180;
end $$;
revoke all on function public.record_search_demand(text, text) from public, anon, authenticated;
grant execute on function public.record_search_demand(text, text) to service_role;
commit;
