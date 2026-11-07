begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- Apply an explicit final selling price only after catalog previews were checked
-- under the existing product locks. Component quantities and inventory stay intact.
create function public.apply_store_sale_agreed_prices(p_priced jsonb, p_items jsonb)
returns jsonb language plpgsql immutable security invoker
set search_path = pg_catalog, public as $$
declare
  v_result jsonb := p_priced;
  v_line record;
  v_base numeric;
  v_agreed numeric;
  v_first integer;
  v_component numeric;
begin
  for v_line in select value, ordinality - 1 as idx
    from jsonb_array_elements(p_items) with ordinality loop
    if not (v_line.value ? 'sale_unit_price') then continue; end if;
    if jsonb_typeof(v_line.value->'sale_unit_price') is distinct from 'number' then
      raise exception 'STORE_SALE_CUSTOM_PRICE_INVALID';
    end if;
    v_agreed := (v_line.value->>'sale_unit_price')::numeric;
    select sum((value->>'unitPrice')::numeric), min(ordinality - 1)::integer
      into v_base, v_first from jsonb_array_elements(v_result) with ordinality
      where (value->>'originIndex')::integer = v_line.idx;
    if v_base is null or v_agreed < v_base or v_agreed <= 0
       or v_agreed > 9999999999.99 or v_agreed <> round(v_agreed, 2) then
      raise exception 'STORE_SALE_CUSTOM_PRICE_INVALID';
    end if;
    v_component := (v_result->v_first->>'unitPrice')::numeric;
    v_result := jsonb_set(v_result, array[v_first::text, 'unitPrice'],
      to_jsonb(v_component + v_agreed - v_base));
  end loop;
  return v_result;
end;
$$;
revoke all on function public.apply_store_sale_agreed_prices(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_store_sale_agreed_prices(jsonb,jsonb) to service_role;

-- Patch the established transaction, preserving its locks, replay fingerprint,
-- stock application, shared payment ledger, SECURITY INVOKER and grants.
do $migration$
declare
  v_definition text;
  v_original text;
  v_before text;
begin
  if (select prosecdef from pg_proc where oid = 'public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)'::regprocedure)
     or has_function_privilege('anon','public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','execute')
     or has_function_privilege('authenticated','public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','execute')
     or not has_function_privilege('service_role','public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','execute') then
    raise exception 'STORE_SALE_BASE_CONTRACT_CHANGED';
  end if;
  v_definition := replace(pg_get_functiondef('public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)'::regprocedure), E'\r\n', E'\n');
  v_original := v_definition;
  v_before := 'array[''product_id'',''quantity'',''unit_price'',''combo_connector'']';
  if strpos(v_definition, v_before) = 0 then raise exception 'STORE_SALE_BASE_CONTRACT_CHANGED'; end if;
  v_definition := replace(v_definition, v_before, 'array[''product_id'',''quantity'',''unit_price'',''combo_connector'',''sale_unit_price'']');
  v_before := E'  end loop;\n  select sum((value->>''listPrice'')::numeric*(value->>''quantity'')::integer)';
  if strpos(v_definition, v_before) = 0 then raise exception 'STORE_SALE_BASE_CONTRACT_CHANGED'; end if;
  v_definition := replace(v_definition, v_before,
    E'  end loop;\n  v_priced := public.apply_store_sale_agreed_prices(v_priced, p_items);\n  select sum((value->>''listPrice'')::numeric*(value->>''quantity'')::integer)');
  v_before := '  IF v_subtotal>9999999999.99 OR v_total>9999999999.99';
  if strpos(v_definition, v_before) = 0 then raise exception 'STORE_SALE_BASE_CONTRACT_CHANGED'; end if;
  v_definition := replace(v_definition, v_before, E'  SELECT sum(greatest(list_total, sale_total)) INTO v_subtotal FROM (\n    SELECT sum((value->>''listPrice'')::numeric*(value->>''quantity'')::integer) list_total,\n      sum((value->>''unitPrice'')::numeric*(value->>''quantity'')::integer) sale_total\n    FROM jsonb_array_elements(v_priced) GROUP BY value->>''originIndex''\n  ) totals;\n' || v_before);
  v_before := '''cost_snapshot_policy'',''current_product_cost_at_sale_v1'')';
  if strpos(v_definition, v_before) = 0 then raise exception 'STORE_SALE_BASE_CONTRACT_CHANGED'; end if;
  v_definition := replace(v_definition, v_before,
    '''cost_snapshot_policy'',''current_product_cost_at_sale_v1'',''store_sale_agreed_prices'',p_items)');
  if v_original = v_definition then raise exception 'STORE_SALE_BASE_CONTRACT_CHANGED'; end if;
  execute v_definition;
end;
$migration$;
commit;
