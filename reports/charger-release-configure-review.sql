-- REVIEW TEMPLATE ONLY. No Production execution authorized.
-- New product/recipe IDs come from INSERT RETURNING, never guessed.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
-- __PRIVATE_MANIFEST__
do $review$
declare m jsonb:=current_setting('sfstore.charger_manifest')::jsonb;
 actor uuid:=nullif(current_setting('sfstore.charger_actor',true),'')::uuid;
 v_purchase uuid:=(m->>'purchase_id')::uuid; source uuid:=(m->>'source')::uuid;
 head uuid:=(m->>'head')::uuid; presentation uuid:=(m->>'presentation')::uuid;
 legacy uuid:=(m->>'legacy')::uuid; other_id uuid:=(m->>'other')::uuid;
 cc uuid; lightning uuid; recipe uuid; category uuid; plan jsonb; outcome jsonb;
 expected jsonb; actual jsonb; field record; pid uuid; old_purchase jsonb; old_lines jsonb;
 previous public.component_inventory_operations%rowtype; r public.component_recipes%rowtype;
begin
 if actor is null or actor='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'CHARGER_OPERATOR_REQUIRED'; end if;
 if m->>'project'<>'xspvoicelbxlmtqoiolc' or jsonb_array_length(m->'products')<>7 or jsonb_array_length(m->'held_ids')<>5
  or source<>'0addc342-9708-4992-a007-8362d6abc756'::uuid or head<>'753fd426-1a8c-49c6-8e17-60b57ea59b8b'::uuid
  or presentation<>'1e6c42e4-08af-4ed7-ad01-95fb22e13c4a'::uuid or legacy<>'20530c08-7371-4726-8a0e-0c5023e7d513'::uuid
  or v_purchase<>'aa56d2fc-ceda-4205-a52f-39c3f62102e5'::uuid or other_id<>'68d9612c-8f73-4119-bb4b-60951ee5ec62'::uuid then raise exception 'CHARGER_MAPPING_CHANGED'; end if;
 if (select array_agg(value order by value) from jsonb_array_elements_text(m->'held_ids')) is distinct from (select array_agg(v order by v) from unnest(array[source::text,head::text,presentation::text,legacy::text,other_id::text]) v) then raise exception 'CHARGER_HOLD_MAPPING_CHANGED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('charger-release:'||v_purchase::text,0));
 -- A confirmed retry never resets stock/prices after subsequent sales.
 select * into previous from public.component_inventory_operations o where o.operation_key=v_purchase;
 if found then
  select * into strict r from public.component_recipes where id=previous.recipe_id;
  if previous.purchase_id<>v_purchase or previous.actor<>actor or r.source_product<>source or r.head_product<>head or r.presentation_product<>presentation or r.legacy_cable_product<>legacy
   or exists(select 1 from public.component_inventory_reversals where original_operation=v_purchase)
   or not exists(select 1 from public.component_recipe_price_approvals a where a.operation_key=v_purchase and recipe_id=r.id and a.actor=previous.actor and prices=jsonb_build_object(head::text,22000,r.cable_cc_product::text,15800,r.cable_lightning_product::text,15800))
   or not exists(select 1 from public.component_combo_price_audit where operation_key=v_purchase and recipe_id=r.id and list_price=30666.67 and transfer_target=23000 and enabled)
   then raise exception 'CHARGER_RETRY_STATE_UNCERTAIN'; end if;
  perform set_config('sfstore.charger_result',jsonb_build_object('status','already_completed','recipe',r.id,'head',head,'cc',r.cable_cc_product,'lightning',r.cable_lightning_product,'stockReset',false)::text,true);
  return;
 end if;
 if exists(select 1 from public.component_inventory_operations o where o.purchase_id=v_purchase) then raise exception 'CHARGER_OTHER_CONVERSION_EXISTS'; end if;
 perform 1 from public.purchases p where p.id=v_purchase for update;
 perform p.id from public.products p where p.id in(select (value->>'id')::uuid from jsonb_array_elements(m->'products')) order by p.id for update;
 if (select count(*) from public.products where id in(select value::uuid from jsonb_array_elements_text(m->'held_ids')) and commercial_blocked)<>5 then raise exception 'CHARGER_HOLD_REQUIRED'; end if;
 for expected in select value from jsonb_array_elements(m->'products') loop
  pid:=(expected->>'id')::uuid;select to_jsonb(p) into strict actual from public.products p where id=pid;
  for field in select * from jsonb_each(expected) loop
   if field.key='updated_at' then continue; end if;
   if field.key='commercial_blocked' and pid in(select value::uuid from jsonb_array_elements_text(m->'held_ids')) then continue; end if;
   if actual->field.key is distinct from field.value then raise exception 'CHARGER_BASELINE_CHANGED'; end if;
  end loop;
 end loop;
 for field in select * from jsonb_each(m->'purchase') loop
  select to_jsonb(p)->field.key into actual from public.purchases p where p.id=v_purchase;
  if field.key='purchase_date' then
   if (actual#>>'{}')::date is distinct from (field.value#>>'{}')::date then raise exception 'CHARGER_PURCHASE_CHANGED'; end if;
  elsif field.key='confirmed_at' then
   if (actual#>>'{}')::timestamptz is distinct from (field.value#>>'{}')::timestamptz then raise exception 'CHARGER_PURCHASE_CHANGED'; end if;
  elsif actual is distinct from field.value then raise exception 'CHARGER_PURCHASE_CHANGED'; end if;
 end loop;
 if (select count(*) from public.purchase_items i where i.purchase_id=v_purchase)<>jsonb_array_length(m->'lines') then raise exception 'CHARGER_LINES_CHANGED'; end if;
 for expected in select value from jsonb_array_elements(m->'lines') loop
  select to_jsonb(i) into strict actual from public.purchase_items i where id=(expected->>'id')::uuid and i.purchase_id=v_purchase;
  for field in select * from jsonb_each(expected) loop
   if actual->field.key is distinct from field.value then raise exception 'CHARGER_LINES_CHANGED'; end if;
  end loop;
 end loop;
 if (select count(*) from public.inventory_movements i where product_id in(select (value->>'id')::uuid from jsonb_array_elements(m->'products')))<>jsonb_array_length(m->'movements') then raise exception 'CHARGER_MOVEMENTS_CHANGED'; end if;
 for expected in select value from jsonb_array_elements(m->'movements') loop
  select to_jsonb(i) into strict actual from public.inventory_movements i where id=(expected->>'id')::uuid;
  for field in select * from jsonb_each(expected) loop
   if field.key='created_at' then
    if (actual#>>'{created_at}')::timestamptz<>(field.value#>>'{}')::timestamptz then raise exception 'CHARGER_MOVEMENTS_CHANGED'; end if;
   elsif actual->field.key is distinct from field.value then raise exception 'CHARGER_MOVEMENTS_CHANGED'; end if;
  end loop;
 end loop;
 if exists(select 1 from public.checkout_operations op join public.order_items i on i.order_id=op.order_id where op.state='pending' and i.product_id in(select (value->>'id')::uuid from jsonb_array_elements(m->'products')))
  or exists(select 1 from public.order_items i where i.created_at>(m->>'baseline_at')::timestamptz and i.product_id in(select (value->>'id')::uuid from jsonb_array_elements(m->'products'))) then raise exception 'CHARGER_NEW_ORDER_OR_RESERVATION'; end if;
 if exists(select 1 from public.products where sku in('SFSTORE-CHARGER-CC','SFSTORE-CHARGER-LIGHTNING') or slug in('sfstore-cable-usbc-usbc-cargador','sfstore-cable-usbc-lightning-cargador') or lower(btrim(name)) in('cable usb-c a usb-c','cable usb-c a lightning')) then raise exception 'CHARGER_CABLE_IDENTITY_COLLISION'; end if;
 select category_id into strict category from public.products where id=head;
 if not exists(select 1 from public.categories where id=category and is_active) then raise exception 'CHARGER_CATEGORY_UNAVAILABLE'; end if;
 select to_jsonb(p) into old_purchase from public.purchases p where p.id=v_purchase;
 select jsonb_agg(to_jsonb(i) order by id) into old_lines from public.purchase_items i where i.purchase_id=v_purchase;
 insert into public.products(category_id,name,slug,short_description,sku,price,transfer_price,stock,cost,status,web_visible,commercial_blocked)
 values(category,'Cable USB-C a USB-C','sfstore-cable-usbc-usbc-cargador','Cable USB-C a USB-C del lote de cargadores.','SFSTORE-CHARGER-CC',0,null,0,null,'draft',false,true) returning id into cc;
 insert into public.products(category_id,name,slug,short_description,sku,price,transfer_price,stock,cost,status,web_visible,commercial_blocked)
 values(category,'Cable USB-C a Lightning','sfstore-cable-usbc-lightning-cargador','Cable USB-C a Lightning del lote de cargadores.','SFSTORE-CHARGER-LIGHTNING',0,null,0,null,'draft',false,true) returning id into lightning;
 recipe:=public.register_component_recipe('Cargador completo Apple - elegir cable',source,head,cc,lightning,presentation,legacy);
 plan:=public.get_component_conversion_plan(v_purchase,recipe,10,10);
 if (plan->>'physical_pieces')::integer<>49 or (plan->>'purchase_total_cents')::bigint<>25713150 then raise exception 'CHARGER_ALLOCATION_CHANGED'; end if;
 outcome:=public.apply_component_conversion(v_purchase,actor,v_purchase,recipe,10,10,plan->>'fingerprint');
 update public.products set price=22000,transfer_price=16500,commercial_blocked=false where id=head;
 update public.products set price=15800,transfer_price=11850,status='active',web_visible=true,commercial_blocked=false where id in(cc,lightning);
 -- No new stock/price for the other purchase line; release only its temporary hold.
 update public.products set commercial_blocked=(select (value->>'commercial_blocked')::boolean from jsonb_array_elements(m->'products') where value->>'id'=other_id::text) where id=other_id;
 perform public.approve_component_prices(v_purchase,actor,recipe,jsonb_build_object(head::text,22000,cc::text,15800,lightning::text,15800));
 perform public.configure_component_combo_price(v_purchase,actor,recipe,30666.67,23000,true);
 if (select stock from public.products where id=head)<>21 or (select stock from public.products where id=cc)<>10 or (select stock from public.products where id=lightning)<>10
  or (select stock from public.products where id=source)<>0 or (select stock from public.products where id=presentation)<>0 or (select stock from public.products where id=legacy)<>0 or (select stock from public.products where id=other_id)<>9 then raise exception 'CHARGER_FINAL_STOCK_MISMATCH'; end if;
 if old_purchase is distinct from (select to_jsonb(p) from public.purchases p where p.id=v_purchase)
  or old_lines is distinct from (select jsonb_agg(to_jsonb(i) order by id) from public.purchase_items i where i.purchase_id=v_purchase) then raise exception 'CHARGER_ORIGINAL_PURCHASE_CHANGED'; end if;
 perform set_config('sfstore.charger_result',jsonb_build_object('status','configured','recipe',recipe,'head',head,'cc',cc,'lightning',lightning,'source',source,'presentation',presentation,'operation',v_purchase)::text,true);
end $review$;
select current_setting('sfstore.charger_result')::jsonb result;
commit;
