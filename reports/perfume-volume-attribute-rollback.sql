-- Rollback of 202611280001_perfume_volume_attribute.sql: restores the previous save allow-list.
-- Run only if no product needs its managed 'contenido' row edited from the admin; existing rows are kept.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $rollback$
declare definition text;
begin
  definition := pg_get_functiondef('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)'::regprocedure);
  definition := replace(definition,
    $a$"gender":["masculino","femenino","unisex"],"contenido":["2-ml","3-ml","5-ml","8-ml","10-ml","12-ml","15-ml","20-ml","25-ml","30-ml","35-ml","50-ml","55-ml","60-ml","65-ml","75-ml","80-ml","85-ml","90-ml","100-ml","105-ml","110-ml","115-ml","120-ml","125-ml","150-ml","200-ml","250-ml"]}'::jsonb$a$,
    $a$"gender":["masculino","femenino","unisex"]}'::jsonb$a$);
  definition := replace(definition,
    $a$'mate_type', 'material', 'color', 'use_case', 'contenido'];$a$,
    $a$'mate_type', 'material', 'color', 'use_case'];$a$);
  if position('"contenido"' in definition) > 0 or position('''contenido''' in definition) > 0 then
    raise exception 'PERFUME_VOLUME_ROLLBACK_CONTRACT_CHANGED';
  end if;
  execute definition;
end;
$rollback$;
commit;
