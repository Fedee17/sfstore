-- REVIEW ONLY: recovery of a failed configuration, never after conversion.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
-- __PRIVATE_MANIFEST__
do $review$
declare m jsonb:=current_setting('sfstore.charger_manifest')::jsonb; expected jsonb; actual jsonb; field record;
begin
 if m->>'project'<>'xspvoicelbxlmtqoiolc' then raise exception 'CHARGER_PROJECT_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('charger-release:'||(m->>'purchase_id'),0));
 if exists(select 1 from public.component_inventory_operations where purchase_id=(m->>'purchase_id')::uuid)
  or exists(select 1 from public.component_recipes where source_product=(m->>'source')::uuid) then raise exception 'CHARGER_RECOVERY_REQUIRES_REVIEW'; end if;
 perform 1 from public.purchases where id=(m->>'purchase_id')::uuid for update;
 perform id from public.products where id in(select (value->>'id')::uuid from jsonb_array_elements(m->'products')) order by id for update;
 for expected in select value from jsonb_array_elements(m->'products') loop
  select to_jsonb(p) into strict actual from public.products p where id=(expected->>'id')::uuid;
  for field in select * from jsonb_each(expected) loop
   if field.key in('updated_at','commercial_blocked') then continue; end if;
   if actual->field.key is distinct from field.value then raise exception 'CHARGER_RECOVERY_BASELINE_CHANGED'; end if;
  end loop;
 end loop;
 update public.products p set commercial_blocked=(e.value->>'commercial_blocked')::boolean
 from jsonb_array_elements(m->'products') e where p.id=(e.value->>'id')::uuid
 and p.id in(select value::uuid from jsonb_array_elements_text(m->'held_ids'));
end $review$;
commit;
