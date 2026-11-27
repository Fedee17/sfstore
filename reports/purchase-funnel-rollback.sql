-- Rollback of supabase/migrations/202611290008_purchase_funnel.sql. Roll back the application first.
begin;
set local lock_timeout = '3s';
drop function if exists public.record_purchase_funnel_step(text);
drop table if exists public.purchase_funnel_daily;
commit;
