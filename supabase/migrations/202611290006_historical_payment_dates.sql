-- Historical sales (sheet "Control de ventas", imported 09/2026) were paid when sold. Owner decision 27/11/2026:
-- each imported payment takes its sale date as payment date (12:00, Buenos Aires), so it counts in «Cobrado en el mes»
-- of that month. Only order_payments.paid_at changes, and only for the 129 imported sales, each with exactly one
-- approved, still undated historical payment; otherwise nothing runs. Amounts, methods and orders do not change.
-- Rollback: reports/historical-payment-dates-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create temp table historical_payment_targets on commit drop as
select p.id as payment_id, p.paid_at, p.status, p.reference, o.historical_import, o.historical_occurred_on,
  (o.historical_occurred_on::timestamp + time '12:00') at time zone 'America/Argentina/Buenos_Aires' as new_paid_at
from public.historical_import_records r
join public.orders o on o.id = r.target_id
join public.order_payments p on p.order_id = o.id
where r.source_sheet = 'Control de ventas' and r.record_type = 'sale' and r.target_table = 'orders';

do $preflight$
begin
  if (select count(*) from historical_payment_targets) <> 129
    or (select count(distinct payment_id) from historical_payment_targets) <> 129
    or (select count(distinct r.target_id) from public.historical_import_records r
        where r.source_sheet = 'Control de ventas' and r.record_type = 'sale' and r.target_table = 'orders') <> 129 then
    raise exception 'HISTORICAL_PAYMENTS_DO_NOT_MATCH';
  end if;
  if exists (select 1 from historical_payment_targets
      where not historical_import or historical_occurred_on is null or paid_at is not null
        or status <> 'approved' or reference not like 'historical:%') then
    raise exception 'HISTORICAL_PAYMENTS_BASE_CHANGED';
  end if;
end;
$preflight$;

update public.order_payments p set paid_at = t.new_paid_at
from historical_payment_targets t where p.id = t.payment_id;

do $postcheck$
begin
  if exists (select 1 from historical_payment_targets t join public.order_payments p on p.id = t.payment_id
      where p.paid_at is distinct from t.new_paid_at) then
    raise exception 'HISTORICAL_PAYMENTS_POSTCHECK_FAILED';
  end if;
end;
$postcheck$;
commit;
