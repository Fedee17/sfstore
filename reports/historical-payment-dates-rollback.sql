-- Rollback of supabase/migrations/202611290006_historical_payment_dates.sql: imported historical payments go back to
-- having no payment date (as imported). Touches only payments of imported historical sales.
begin;
set local lock_timeout = '3s';
update public.order_payments p set paid_at = null
from public.historical_import_records r
join public.orders o on o.id = r.target_id
where p.order_id = o.id and o.historical_import and p.reference like 'historical:%'
  and r.source_sheet = 'Control de ventas' and r.record_type = 'sale' and r.target_table = 'orders';
commit;
