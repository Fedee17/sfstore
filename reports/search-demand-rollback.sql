-- Rollback of supabase/migrations/202611290002_search_demand.sql.
-- Roll back the application first (the store records searches and Informes reads them). Deletes the recorded searches.
begin;
set local lock_timeout = '3s';
drop function if exists public.record_search_demand(text, text);
drop table if exists public.search_demand_daily;
commit;
