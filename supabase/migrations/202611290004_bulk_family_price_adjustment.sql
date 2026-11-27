-- Bulk family price adjustment by percentage (same owner decision as 202611290003): the family base price, every
-- variant's own price (list_price_override) and every approved variant special move by the previewed amounts,
-- rounded to $100. Each item carries the family revision and every variant as the preview read them; a changed,
-- added or removed variant, or a historical one, aborts the whole call. Inherited prices follow the base through
-- update_family_inherited_prices. Function only. Rollback: reports/bulk-family-price-adjustment-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create function public.bulk_adjust_family_prices(p_items jsonb) returns integer language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare
  v_item jsonb;
  v_variant jsonb;
  v_family public.product_families%rowtype;
  v_row public.products%rowtype;
  v_base numeric;
  v_override numeric;
  v_special numeric;
  v_count integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50
    or (select count(distinct value->>'id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then
    raise exception 'BULK_PRICE_INVALID';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
    select * into v_family from public.product_families where id = (v_item->>'id')::uuid for update;
    if not found or v_family.revision is distinct from (v_item->>'expected_revision')::bigint then
      raise exception 'BULK_PRICE_CHANGED';
    end if;
    perform 1 from public.products where family_id = v_family.id order by id for update;
    -- The preview saw exactly these variants, with exactly these prices.
    if (select count(*) from public.products where family_id = v_family.id) <> jsonb_array_length(v_item->'variants') then
      raise exception 'BULK_PRICE_CHANGED';
    end if;
    for v_variant in select value from jsonb_array_elements(v_item->'variants') loop
      select * into v_row from public.products where id = (v_variant->>'id')::uuid;
      if not found or v_row.family_id is distinct from v_family.id or v_row.historical_identity is distinct from false
        or v_row.price is distinct from (v_variant->>'expected_price')::numeric
        or v_row.list_price_override is distinct from (v_variant->>'expected_override')::numeric
        or v_row.transfer_price is distinct from (v_variant->>'expected_transfer_price')::numeric
        or v_row.cash_price_approved_at is distinct from (v_variant->>'expected_approved_at')::timestamptz then
        raise exception 'BULK_PRICE_CHANGED';
      end if;
      if (v_variant->>'new_override' is null) <> (v_row.list_price_override is null)
        or (v_variant->>'new_transfer_price' is not null and v_row.cash_price_approved_at is null) then
        raise exception 'BULK_PRICE_INVALID';
      end if;
    end loop;

    v_base := (v_item->>'new_base')::numeric;
    if v_base is null or v_base <= 0 or mod(v_base * 100, 10000) <> 0 then raise exception 'BULK_PRICE_INVALID'; end if;
    update public.product_families set base_price = v_base where id = v_family.id;

    for v_variant in select value from jsonb_array_elements(v_item->'variants') loop
      v_override := (v_variant->>'new_override')::numeric;
      v_special := (v_variant->>'new_transfer_price')::numeric;
      if v_override is not null then
        if v_override <= 0 or mod(v_override * 100, 10000) <> 0 then raise exception 'BULK_PRICE_INVALID'; end if;
        update public.products set list_price_override = v_override, price = v_override where id = (v_variant->>'id')::uuid;
      end if;
      select * into v_row from public.products where id = (v_variant->>'id')::uuid;
      if v_row.compare_at_price > 0 and v_row.price >= v_row.compare_at_price then raise exception 'BULK_PRICE_INVALID'; end if;
      if v_special is not null then
        if v_special <= 0 or v_special > v_row.price or mod(v_special * 100, 10000) <> 0 then raise exception 'BULK_PRICE_INVALID'; end if;
        update public.products set transfer_price = v_special, cash_price_approved_at = clock_timestamp() where id = v_row.id;
      end if;
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.bulk_adjust_family_prices(jsonb) from public, anon, authenticated;
grant execute on function public.bulk_adjust_family_prices(jsonb) to service_role;
commit;
