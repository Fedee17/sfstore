-- Bulk price adjustment by percentage (owner decision 27/11/2026): the admin previews the new list price, and the
-- approved special when there is one, both rounded to the nearest $100; this function writes exactly what was
-- previewed or nothing. Each item carries the values the preview read; any row that changed since, or that is
-- historical, a family variant or a charger-combo presentation, aborts the whole call.
-- An approved special is re-approved with its new amount (cash_price_approved_at = now); without approval only the
-- list changes and the cash price stays at the automatic 75% rule. Function only: no data is written on apply.
-- Every change is recorded by products_change_history (202611290001). Rollback: reports/bulk-price-adjustment-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create function public.bulk_adjust_product_prices(p_items jsonb) returns integer language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare
  v_item jsonb;
  v_row public.products%rowtype;
  v_price numeric;
  v_special numeric;
  v_count integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100
    or (select count(distinct value->>'id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then
    raise exception 'BULK_PRICE_INVALID';
  end if;
  -- Lock in a stable order so two concurrent calls never deadlock.
  perform 1 from public.products where id in (select (value->>'id')::uuid from jsonb_array_elements(p_items)) order by id for update;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_row from public.products where id = (v_item->>'id')::uuid;
    if not found or v_row.historical_identity is distinct from false or v_row.family_id is not null
      or exists (select 1 from public.component_recipes r where r.presentation_product = v_row.id)
      or v_row.price is distinct from (v_item->>'expected_price')::numeric
      or v_row.transfer_price is distinct from (v_item->>'expected_transfer_price')::numeric
      or v_row.cash_price_approved_at is distinct from (v_item->>'expected_approved_at')::timestamptz then
      raise exception 'BULK_PRICE_CHANGED';
    end if;
    v_price := (v_item->>'new_price')::numeric;
    v_special := (v_item->>'new_transfer_price')::numeric;
    if v_price is null or v_price <= 0 or mod(v_price * 100, 10000) <> 0
      or (v_row.compare_at_price > 0 and v_price >= v_row.compare_at_price)
      or (v_special is not null and (v_row.cash_price_approved_at is null or v_special <= 0 or v_special > v_price or mod(v_special * 100, 10000) <> 0)) then
      raise exception 'BULK_PRICE_INVALID';
    end if;
    if v_special is not null then
      update public.products set price = v_price, transfer_price = v_special, cash_price_approved_at = clock_timestamp() where id = v_row.id;
    else
      update public.products set price = v_price where id = v_row.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.bulk_adjust_product_prices(jsonb) from public, anon, authenticated;
grant execute on function public.bulk_adjust_product_prices(jsonb) to service_role;
commit;
