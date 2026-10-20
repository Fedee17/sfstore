-- REVIEW TEMPLATE ONLY. Renderer binds a private, verified manifest.
-- Hold only affected SKU; no inventory, price, purchase or order changes.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
-- __PRIVATE_MANIFEST__
do $review$
declare m jsonb:=current_setting('sfstore.charger_manifest')::jsonb;
 expected jsonb; actual jsonb; field record; pid uuid;
begin
 if m->>'project'<>'xspvoicelbxlmtqoiolc' then raise exception 'CHARGER_PROJECT_REQUIRED'; end if;
 if (select array_agg(value order by value) from jsonb_array_elements_text(m->'held_ids')) is distinct from (select array_agg(v order by v) from unnest(array[m->>'source',m->>'head',m->>'presentation',m->>'legacy',m->>'other']) v) then raise exception 'CHARGER_HOLD_MAPPING_CHANGED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('charger-release:'||(m->>'purchase_id'),0));
 if exists(select 1 from public.component_inventory_operations where purchase_id=(m->>'purchase_id')::uuid) then raise exception 'CHARGER_ALREADY_CONVERTED_DO_NOT_HOLD'; end if;
 perform 1 from public.purchases where id=(m->>'purchase_id')::uuid for update;
 perform id from public.products where id in(select (value->>'id')::uuid from jsonb_array_elements(m->'products')) order by id for update;
 for expected in select value from jsonb_array_elements(m->'products') loop
  pid:=(expected->>'id')::uuid; select to_jsonb(p) into strict actual from public.products p where id=pid;
  for field in select * from jsonb_each(expected) loop
   if field.key='updated_at' then continue; end if;
   if field.key='commercial_blocked' and actual->field.key='true'::jsonb and pid in(select value::uuid from jsonb_array_elements_text(m->'held_ids')) then continue; end if;
   if actual->field.key is distinct from field.value then raise exception 'CHARGER_BASELINE_CHANGED'; end if;
  end loop;
 end loop;
 update public.products set commercial_blocked=true where id in(select value::uuid from jsonb_array_elements_text(m->'held_ids')) and not commercial_blocked;
 if (select count(*) from public.products where id in(select value::uuid from jsonb_array_elements_text(m->'held_ids')) and commercial_blocked)<>5 then raise exception 'CHARGER_HOLD_FAILED'; end if;
end $review$;
commit;
