-- I5: perfume volume ("Contenido") becomes a managed admin attribute, stored as product_attributes.name = 'contenido'
-- (a name the public attribute boundary already exposes). Schema/function only: no product, price, stock or attribute
-- data is written. Legacy free-text rows ("Contenido", "Volumen", "Capacidad") are not managed and stay untouched.
-- Rollback: reports/perfume-volume-attribute-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Fail closed: a pre-existing 'contenido' row outside the managed list would be dropped by the next admin save.
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
  -- Allowed values: the same list as PERFUME_VOLUME_OPTIONS (lib/catalog/attribute-config.ts), perfumes only.
  definition := pg_temp.patch_once(definition,
    $a$"gender":["masculino","femenino","unisex"]}'::jsonb$a$,
    $a$"gender":["masculino","femenino","unisex"],"contenido":["2-ml","3-ml","5-ml","8-ml","10-ml","12-ml","15-ml","20-ml","25-ml","30-ml","35-ml","50-ml","55-ml","60-ml","65-ml","75-ml","80-ml","85-ml","90-ml","100-ml","105-ml","110-ml","115-ml","120-ml","125-ml","150-ml","200-ml","250-ml"]}'::jsonb$a$);
  -- Managed: the admin save replaces it like the other managed attributes. Legacy names are not listed on purpose.
  definition := pg_temp.patch_once(definition,
    $a$'mate_type', 'material', 'color', 'use_case'];$a$,
    $a$'mate_type', 'material', 'color', 'use_case', 'contenido'];$a$);
  execute definition;
end;
$migration$;
commit;
