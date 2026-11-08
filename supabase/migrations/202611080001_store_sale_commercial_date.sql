begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $$
begin
  if to_regprocedure('public.apply_store_sale_agreed_prices(jsonb,jsonb)') is null
     or (select prosecdef from pg_proc where oid = 'public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)'::regprocedure)
     or has_function_privilege('anon','public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','execute')
     or has_function_privilege('authenticated','public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','execute')
     or not has_function_privilege('service_role','public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','execute') then
    raise exception 'STORE_SALE_BASE_CONTRACT_CHANGED';
  end if;
end;
$$;

alter table public.orders add column store_sale_date date;
alter table public.orders add constraint orders_store_sale_date_scope check (
  store_sale_date is null or (channel = 'store' and not historical_import and store_sale_date >= date '1900-01-01')
);

-- Keep the original transaction and its inventory/payment timestamps intact.
-- The same advisory lock serializes dated requests and legacy callers alike.
create function public.create_store_sale_dated_atomic(
  p_idempotency_key uuid, p_created_by uuid, p_customer_name text, p_notes text,
  p_items jsonb, p_payments jsonb, p_sale_date date
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare
  v_today date := (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_existing public.orders%rowtype;
  v_result jsonb;
begin
  if p_sale_date is null or p_sale_date < date '1900-01-01' or p_sale_date > v_today then
    raise exception 'STORE_SALE_DATE_INVALID';
  end if;
  if p_idempotency_key is null then raise exception 'STORE_SALE_IDEMPOTENCY_REQUIRED'; end if;
  if p_created_by is null then raise exception 'STORE_SALE_ACTOR_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key for update;
  if found and coalesce(v_existing.store_sale_date, (v_existing.created_at at time zone 'America/Argentina/Buenos_Aires')::date) is distinct from p_sale_date then
    raise exception 'STORE_SALE_IDEMPOTENCY_CONFLICT';
  end if;
  v_result := public.create_store_sale_atomic(p_idempotency_key, p_created_by, p_customer_name, p_notes, p_items, p_payments);
  if jsonb_typeof(v_result) is distinct from 'object' or v_result->>'order_id' is null then raise exception 'STORE_SALE_DATE_WRITE_FAILED'; end if;
  if v_result->>'operation' = 'created' then
    update public.orders set store_sale_date = p_sale_date,
      metadata = metadata || jsonb_build_object('store_sale_backdated', p_sale_date < v_today)
        || case when p_sale_date < v_today then jsonb_build_object('cost_snapshot_policy', 'current_product_cost_at_late_entry_v1') else '{}'::jsonb end
    where id = (v_result->>'order_id')::uuid and channel = 'store' and not historical_import;
    if not found then raise exception 'STORE_SALE_DATE_WRITE_FAILED'; end if;
  end if;
  return v_result || jsonb_build_object('sale_date', p_sale_date);
end;
$$;
revoke all on function public.create_store_sale_dated_atomic(uuid,uuid,text,text,jsonb,jsonb,date) from public, anon, authenticated;
grant execute on function public.create_store_sale_dated_atomic(uuid,uuid,text,text,jsonb,jsonb,date) to service_role;
commit;
