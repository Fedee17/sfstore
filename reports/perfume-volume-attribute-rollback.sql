-- Rollback of 202611280001_perfume_volume_attribute.sql: restores the exact previous save_product_atomic_internal.
-- Order: roll back the application first (the previous function rejects product.volume_managed), then run this.
-- Loaded 'contenido' rows are kept: the previous admin neither manages nor deletes them.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function pg_temp.unpatch_once(source text, patched text, original text) returns text language plpgsql as $$
begin
  if source is null or position(patched in source) = 0
    or (length(source) - length(replace(source, patched, ''))) <> length(patched) then
    raise exception 'PERFUME_VOLUME_ROLLBACK_CONTRACT_CHANGED: %', left(patched, 80);
  end if;
  return replace(source, patched, original);
end $$;

do $rollback$
declare definition text;
begin
  definition := pg_get_functiondef('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)'::regprocedure);
  definition := pg_temp.unpatch_once(definition,
    $a$'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status', 'cash_price_approved', 'volume_managed'))$a$,
    $a$'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status', 'cash_price_approved'))$a$);
  definition := pg_temp.unpatch_once(definition,
    $a$if p_payload->'product' ? 'volume_managed' and p_payload->'product'->'volume_managed' is distinct from 'true'::jsonb then
    raise exception 'PRODUCT_INVALID_FIELDS';
  end if;
  if jsonb_typeof(p_payload->'product'->'featured') <> 'boolean' then$a$,
    $a$if jsonb_typeof(p_payload->'product'->'featured') <> 'boolean' then$a$);
  definition := pg_temp.unpatch_once(definition,
    $a$"gender":["masculino","femenino","unisex"],"contenido":["2-ml","3-ml","5-ml","8-ml","10-ml","12-ml","15-ml","20-ml","25-ml","30-ml","35-ml","50-ml","55-ml","60-ml","65-ml","75-ml","80-ml","85-ml","90-ml","100-ml","105-ml","110-ml","115-ml","120-ml","125-ml","150-ml","200-ml","250-ml"]}'::jsonb$a$,
    $a$"gender":["masculino","femenino","unisex"]}'::jsonb$a$);
  definition := pg_temp.unpatch_once(definition,
    $a$  if not coalesce(p_payload->'product' ? 'volume_managed', false) and exists (
    select 1 from jsonb_array_elements(v_attributes) a where a->>'name' = 'contenido') then
    raise exception 'PRODUCT_INVALID_ATTRIBUTE';
  end if;
  delete from public.product_attributes where product_id = p_product_id and name = any(v_managed);
  if p_payload->'product' ? 'volume_managed' then
    delete from public.product_attributes where product_id = p_product_id and name = 'contenido';
  end if;$a$,
    $a$  delete from public.product_attributes where product_id = p_product_id and name = any(v_managed);$a$);
  if position('contenido' in definition) > 0 or position('volume_managed' in definition) > 0 then
    raise exception 'PERFUME_VOLUME_ROLLBACK_CONTRACT_CHANGED';
  end if;
  execute definition;
end;
$rollback$;
commit;
