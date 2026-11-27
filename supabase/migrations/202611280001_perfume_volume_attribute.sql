-- I5: perfume volume ("Contenido") becomes an admin-managed attribute, stored as product_attributes.name = 'contenido'
-- (a name the public attribute boundary already exposes). Function only: no product, price, stock or attribute data
-- is written. Requires 202611260001_stored_cash_prices (patched anchor) and is independent of Mercado Pago.
--
-- Version compatibility: 'contenido' is replaced only when the request declares the field (product.volume_managed =
-- true, sent by the editor that renders it). A save from an older admin build (no declaration, no row) keeps the
-- stored volume; a 'contenido' row without the declaration is rejected. Legacy free-text names ("Contenido",
-- "Volumen", "Capacidad") are never managed and stay untouched.
-- Rollback: reports/perfume-volume-attribute-rollback.sql (roll back the application first).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Fail closed: a pre-existing 'contenido' row outside the managed list would be dropped by the next declared save.
do $preflight$
begin
  if exists (select 1 from public.product_attributes where name = 'contenido'
      and value <> all (array['2-ml','3-ml','5-ml','8-ml','10-ml','12-ml','15-ml','20-ml','25-ml','30-ml','35-ml','50-ml','55-ml','60-ml','65-ml','75-ml','80-ml','85-ml','90-ml','100-ml','105-ml','110-ml','115-ml','120-ml','125-ml','150-ml','200-ml','250-ml'])) then
    raise exception 'PERFUME_VOLUME_UNMANAGED_VALUE_PRESENT';
  end if;
end;
$preflight$;

create or replace function pg_temp.patch_once(source text, anchor text, replacement text) returns text language plpgsql as $$
begin
  if source is null or position(anchor in source) = 0
    or (length(source) - length(replace(source, anchor, ''))) <> length(anchor) then
    raise exception 'PERFUME_VOLUME_BASE_CONTRACT_CHANGED: %', left(anchor, 80);
  end if;
  return replace(source, anchor, replacement);
end $$;

do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)'::regprocedure);
  -- The declaration is an optional product key and may only be true.
  definition := pg_temp.patch_once(definition,
    $a$'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status', 'cash_price_approved'))$a$,
    $a$'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status', 'cash_price_approved', 'volume_managed'))$a$);
  definition := pg_temp.patch_once(definition,
    $a$if jsonb_typeof(p_payload->'product'->'featured') <> 'boolean' then$a$,
    $a$if p_payload->'product' ? 'volume_managed' and p_payload->'product'->'volume_managed' is distinct from 'true'::jsonb then
    raise exception 'PRODUCT_INVALID_FIELDS';
  end if;
  if jsonb_typeof(p_payload->'product'->'featured') <> 'boolean' then$a$);
  -- Allowed values: the same list as PERFUME_VOLUME_OPTIONS (lib/catalog/attribute-config.ts), perfumes only.
  definition := pg_temp.patch_once(definition,
    $a$"gender":["masculino","femenino","unisex"]}'::jsonb$a$,
    $a$"gender":["masculino","femenino","unisex"],"contenido":["2-ml","3-ml","5-ml","8-ml","10-ml","12-ml","15-ml","20-ml","25-ml","30-ml","35-ml","50-ml","55-ml","60-ml","65-ml","75-ml","80-ml","85-ml","90-ml","100-ml","105-ml","110-ml","115-ml","120-ml","125-ml","150-ml","200-ml","250-ml"]}'::jsonb$a$);
  -- A volume row needs the declaration; only a declared save replaces the stored volume.
  definition := pg_temp.patch_once(definition,
    $a$  delete from public.product_attributes where product_id = p_product_id and name = any(v_managed);$a$,
    $a$  if not coalesce(p_payload->'product' ? 'volume_managed', false) and exists (
    select 1 from jsonb_array_elements(v_attributes) a where a->>'name' = 'contenido') then
    raise exception 'PRODUCT_INVALID_ATTRIBUTE';
  end if;
  delete from public.product_attributes where product_id = p_product_id and name = any(v_managed);
  if p_payload->'product' ? 'volume_managed' then
    delete from public.product_attributes where product_id = p_product_id and name = 'contenido';
  end if;$a$);
  execute definition;
end;
$migration$;
commit;
