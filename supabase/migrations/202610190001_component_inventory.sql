-- Prepared locally only. No seed, product creation, pricing approval or Production execution.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create table public.component_recipes (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 160),
 source_product uuid not null unique references public.products(id),
 head_product uuid not null references public.products(id),
 cable_cc_product uuid not null references public.products(id),
 cable_lightning_product uuid not null references public.products(id),
 presentation_product uuid not null unique references public.products(id),
 legacy_cable_product uuid not null references public.products(id),
 prices_approved boolean not null default false,
 created_at timestamptz not null default now(),
 check(source_product<>head_product and source_product<>cable_cc_product and source_product<>cable_lightning_product
 and presentation_product<>source_product and presentation_product<>head_product and presentation_product<>cable_cc_product
 and presentation_product<>cable_lightning_product and head_product<>cable_cc_product and head_product<>cable_lightning_product
 and cable_cc_product<>cable_lightning_product and legacy_cable_product not in(source_product,head_product,cable_cc_product,cable_lightning_product,presentation_product))
);
create table public.component_recipe_price_approvals (
 operation_key uuid primary key, recipe_id uuid not null references public.component_recipes(id), actor uuid not null,
 prices jsonb not null, created_at timestamptz not null default now()
);
create table public.component_purchase_compositions (
 purchase_id uuid primary key references public.purchases(id), recipe_id uuid not null references public.component_recipes(id),
 cable_cc integer not null check(cable_cc>=0), cable_lightning integer not null check(cable_lightning>=0),
 check(cable_cc+cable_lightning>0)
);
create table public.component_inventory_operations (
 operation_key uuid primary key, purchase_id uuid not null unique references public.purchases(id),
 recipe_id uuid not null references public.component_recipes(id), request_hash text not null,
 actor uuid not null, plan jsonb not null, before_state jsonb not null, after_state jsonb not null,
 result jsonb not null, created_at timestamptz not null default now()
);
create table public.component_inventory_reversals (
 operation_key uuid primary key, original_operation uuid not null unique references public.component_inventory_operations(operation_key),
 actor uuid not null, reason text not null check(length(btrim(reason)) between 10 and 500),
 result jsonb not null, created_at timestamptz not null default now()
);
alter table public.products add column cost_source_component_operation uuid references public.component_inventory_operations(operation_key) deferrable initially deferred;
-- Conversion movements do not masquerade as another purchase or customer sale.
alter table public.inventory_movements add column component_operation_key uuid references public.component_inventory_operations(operation_key) deferrable initially deferred;

do $$ declare t text; begin
 foreach t in array array['component_recipes','component_recipe_price_approvals','component_purchase_compositions','component_inventory_operations','component_inventory_reversals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert on public.%I to service_role',t);
 end loop;
end $$;
grant update on public.component_purchase_compositions to service_role;
grant update(prices_approved) on public.component_recipes to service_role;
grant update(cost_source_component_operation) on public.products to service_role;
grant update(component_operation_key) on public.inventory_movements to service_role;

create function public.component_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if tg_table_name='component_recipes' then
  if tg_op='UPDATE' and (to_jsonb(new)-'prices_approved')=(to_jsonb(old)-'prices_approved') and (not new.prices_approved or exists(select 1 from public.component_recipe_price_approvals a where a.recipe_id=new.id)) then return new; end if;
  if tg_op<>'INSERT' then raise exception 'COMPONENT_RECIPE_IMMUTABLE'; end if;
  if new.prices_approved then raise exception 'COMPONENT_PRICE_APPROVAL_SEPARATE_REQUIRED'; end if;
  if exists(select 1 from public.products where id=new.presentation_product and stock<>0)
   or exists(select 1 from public.products where id=new.legacy_cable_product and stock<>0)
   or (select count(*) from public.products where id in(new.source_product,new.head_product,new.cable_cc_product,new.cable_lightning_product,new.presentation_product,new.legacy_cable_product) and not historical_identity)<>6
   then raise exception 'COMPONENT_RECIPE_PRODUCTS_INVALID'; end if;
 elsif tg_table_name='products' then
  if (not new.commercial_blocked or new.web_visible) and exists(select 1 from public.component_recipes where source_product=new.id or presentation_product=new.id or legacy_cable_product=new.id) then raise exception 'COMPONENT_NONCOMMERCIAL_IDENTITY'; end if;
  if new.stock<>0 and exists(select 1 from public.component_recipes where presentation_product=new.id or legacy_cable_product=new.id) then raise exception 'COMPONENT_NONSTOCK_PRODUCT'; end if;
 elsif tg_table_name='order_items' then
  if not exists(select 1 from public.orders where id=new.order_id and historical_import) and exists(select 1 from public.component_recipes where source_product=new.product_id or presentation_product=new.product_id or legacy_cable_product=new.product_id) then raise exception 'COMPONENT_SELL_PHYSICAL_SKU_ONLY'; end if;
 else raise exception 'COMPONENT_AUDIT_IMMUTABLE';
 end if;
 return new;
end $$;
create trigger component_recipe_guard before insert or update or delete on public.component_recipes for each row execute function public.component_guard();
create trigger component_presentation_stock before insert or update of stock,commercial_blocked,web_visible on public.products for each row execute function public.component_guard();
create trigger component_order_line_guard before insert on public.order_items for each row execute function public.component_guard();
create trigger component_price_approvals_immutable before update or delete on public.component_recipe_price_approvals for each row execute function public.component_guard();
create trigger component_operations_immutable before update or delete on public.component_inventory_operations for each row execute function public.component_guard();
create trigger component_reversals_immutable before update or delete on public.component_inventory_reversals for each row execute function public.component_guard();

create function public.register_component_recipe(p_name text,p_source uuid,p_head uuid,p_cc uuid,p_lightning uuid,p_presentation uuid,p_legacy uuid)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare rid uuid; existing public.component_recipes%rowtype;
begin
 perform id from public.products where id in(p_source,p_head,p_cc,p_lightning,p_presentation,p_legacy) order by id for update;
 select * into existing from public.component_recipes where source_product=p_source;
 if found then
  if existing.head_product=p_head and existing.cable_cc_product=p_cc and existing.cable_lightning_product=p_lightning and existing.presentation_product=p_presentation and existing.legacy_cable_product=p_legacy and existing.name=btrim(p_name) then return existing.id; end if;
  raise exception 'COMPONENT_RECIPE_CONFLICT';
 end if;
 if exists(select 1 from public.component_recipes where source_product in(p_source,p_head,p_cc,p_lightning,p_presentation,p_legacy)
  or presentation_product in(p_source,p_head,p_cc,p_lightning,p_presentation,p_legacy)
  or head_product in(p_source,p_presentation,p_legacy) or cable_cc_product in(p_source,p_presentation,p_legacy) or cable_lightning_product in(p_source,p_presentation,p_legacy)) then raise exception 'COMPONENT_RECIPE_CONFLICT'; end if;
 insert into public.component_recipes(name,source_product,head_product,cable_cc_product,cable_lightning_product,presentation_product,legacy_cable_product)
 values(btrim(p_name),p_source,p_head,p_cc,p_lightning,p_presentation,p_legacy) returning id into rid;
 update public.products set commercial_blocked=true,web_visible=false where id in(p_source,p_presentation,p_legacy);
 return rid;
end $$;

-- Separate future price approval; this never writes a price and is not called by UI setup.
create function public.approve_component_prices(p_key uuid,p_actor uuid,p_recipe uuid,p_expected jsonb) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.component_recipes%rowtype; prices jsonb; prior public.component_recipe_price_approvals%rowtype;
begin
 if p_key is null or p_actor is null or p_expected is null then raise exception 'COMPONENT_PRICE_APPROVAL_INVALID'; end if;
 select * into strict r from public.component_recipes where id=p_recipe;
 perform id from public.products where id in(r.head_product,r.cable_cc_product,r.cable_lightning_product) order by id for update;
 perform 1 from public.component_recipes where id=p_recipe for update;
 select jsonb_object_agg(id::text,price) into prices from public.products where id in(r.head_product,r.cable_cc_product,r.cable_lightning_product) and price>0 and status='active' and not commercial_blocked;
 if prices is distinct from p_expected or (select count(*) from jsonb_object_keys(prices))<>3 then raise exception 'COMPONENT_PRICES_NOT_APPROVED'; end if;
 select * into prior from public.component_recipe_price_approvals where operation_key=p_key;
 if found then
  if prior.actor<>p_actor or prior.recipe_id<>p_recipe or prior.prices is distinct from p_expected then raise exception 'COMPONENT_PRICE_APPROVAL_CONFLICT'; end if;
  return;
 end if;
 insert into public.component_recipe_price_approvals values(p_key,p_recipe,p_actor,prices,now());
 update public.component_recipes set prices_approved=true where id=p_recipe;
end $$;

create function public.component_price_changed() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.price is distinct from old.price then
  update public.component_recipes set prices_approved=false where prices_approved and new.id in(head_product,cable_cc_product,cable_lightning_product);
 end if;
 return new;
end $$;
create trigger component_price_readiness after update of price on public.products for each row execute function public.component_price_changed();

create function public.set_component_purchase_composition(p_purchase uuid,p_recipe uuid,p_cc integer,p_lightning integer)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.component_recipes%rowtype;
begin
 perform 1 from public.purchases where id=p_purchase and status='draft' and not historical_import for update;
 if not found then raise exception 'COMPONENT_DRAFT_REQUIRED'; end if;
 select * into strict r from public.component_recipes where id=p_recipe;
 if p_cc is null or p_lightning is null or p_cc<0 or p_lightning<0 or p_cc::bigint+p_lightning<>coalesce((select quantity from public.purchase_items where purchase_id=p_purchase and product_id=r.source_product),0) then raise exception 'COMPONENT_COMPOSITION_INVALID'; end if;
 insert into public.component_purchase_compositions values(p_purchase,p_recipe,p_cc,p_lightning)
 on conflict(purchase_id) do update set recipe_id=excluded.recipe_id,cable_cc=excluded.cable_cc,cable_lightning=excluded.cable_lightning;
end $$;

-- Catalog-only/product state reads, no locking or writes. Must be re-evaluated after locks by executor.
create function public.get_component_conversion_plan(p_purchase uuid,p_recipe uuid,p_cc integer,p_lightning integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.component_recipes%rowtype; p public.purchases%rowtype; s public.purchase_items%rowtype;
 n bigint; supplier_cents bigint; head_cents bigint; cc_cents bigint; rows jsonb; state jsonb; movements jsonb; plan jsonb;
begin
 select * into strict r from public.component_recipes where id=p_recipe;
 select * into strict p from public.purchases where id=p_purchase;
 select * into strict s from public.purchase_items where purchase_id=p_purchase and product_id=r.source_product;
 if p.status<>'confirmed' or p.historical_import or not p.affects_inventory or p_cc is null or p_lightning is null or p_cc<0 or p_lightning<0 or p_cc::bigint+p_lightning<>s.quantity then raise exception 'COMPONENT_CONVERSION_INVALID'; end if;
 if exists(select 1 from public.purchase_items where purchase_id=p.id and product_id in(r.head_product,r.cable_cc_product,r.cable_lightning_product,r.presentation_product,r.legacy_cable_product)) then raise exception 'COMPONENT_MIXED_RECEIPT_UNSUPPORTED'; end if;
 if (select count(*) from public.purchase_items where purchase_id=p.id and product_id in(select source_product from public.component_recipes))<>1 then raise exception 'COMPONENT_ONE_SOURCE_PER_PURCHASE'; end if;
 if (select sum(quantity) from public.purchase_items where purchase_id=p.id)<>p.total_units
  or (select sum(supplier_line_total) from public.purchase_items where purchase_id=p.id)<>p.supplier_subtotal
  or (select sum(allocated_shipping_total) from public.purchase_items where purchase_id=p.id)<>p.shipping_cost
  or p.total_cost<>p.supplier_subtotal+p.shipping_cost
  or exists(select 1 from public.purchase_items where purchase_id=p.id and (supplier_line_total<>quantity*unit_purchase_cost or effective_line_total<>supplier_line_total+allocated_shipping_total)) then raise exception 'COMPONENT_ACQUISITION_MISMATCH'; end if;
 select sum(quantity)+s.quantity into n from public.purchase_items where purchase_id=p.id;
 supplier_cents:=round(s.supplier_line_total*100); head_cents:=round(supplier_cents/2.0); cc_cents:=round((supplier_cents-head_cents)*p_cc::numeric/s.quantity);
 with basis as (
  select 'head' k,r.head_product product_id,s.quantity::bigint q,head_cents supplier
  union all select 'cable-c-c',r.cable_cc_product,p_cc,cc_cents where p_cc>0
  union all select 'cable-c-lightning',r.cable_lightning_product,p_lightning,supplier_cents-head_cents-cc_cents where p_lightning>0
  union all select 'other:'||i.id::text,i.product_id,i.quantity,round(i.supplier_line_total*100)::bigint from public.purchase_items i where i.purchase_id=p.id and i.id<>s.id
 ), floors as(select *,floor(p.shipping_cost*100*q/n)::bigint f,mod(p.shipping_cost*100*q,n) rem from basis), ranked as(
  select *,row_number() over(order by rem desc,k) rn,round(p.shipping_cost*100)-sum(f) over() rest from floors
 ), allocated as(select *,f+case when rn<=rest then 1 else 0 end ship from ranked)
 select jsonb_agg(jsonb_build_object('key',k,'product_id',product_id,'quantity',q,'supplier_cents',supplier,'shipping_cents',ship,'total_cents',supplier+ship,
  'unit_cents',round((supplier+ship)::numeric/q),'residual_cents',(supplier+ship)-round((supplier+ship)::numeric/q)*q) order by k) into rows from allocated;
 select jsonb_agg(jsonb_build_object('id',id,'stock',stock,'cost',cost,'source',cost_source_purchase_item_id,'component_source',cost_source_component_operation,'updated_at',updated_at) order by id) into state from public.products
 where id in(r.source_product,r.head_product,r.cable_cc_product,r.cable_lightning_product,r.presentation_product,r.legacy_cable_product) or id in(select product_id from public.purchase_items where purchase_id=p.id);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'product_id',m.product_id,'type',m.movement_type,'quantity',m.quantity,'created_at',m.created_at) order by m.id),'[]') into movements
 from public.inventory_movements m where m.product_id in(select (value->>'id')::uuid from jsonb_array_elements(state));
 plan:=jsonb_build_object('policy','components-50-50-physical-pieces-v1','purchase_id',p.id,'recipe',to_jsonb(r),'source_line',s.id,'source_quantity',s.quantity,'cc',p_cc,'lightning',p_lightning,
  'purchase_total_cents',round(p.total_cost*100),'shipping_cents',round(p.shipping_cost*100),'physical_pieces',n,'allocations',rows,'products',state,'movements',movements);
 if (select sum((value->>'total_cents')::bigint) from jsonb_array_elements(rows))<>round(p.total_cost*100) then raise exception 'COMPONENT_VALUE_NOT_CONSERVED'; end if;
 return plan||jsonb_build_object('fingerprint',encode(sha256(convert_to(plan::text,'UTF8')),'hex'));
end $$;

create function public.apply_component_conversion(p_key uuid,p_actor uuid,p_purchase uuid,p_recipe uuid,p_cc integer,p_lightning integer,p_expected text,p_receipt_opening jsonb default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare prior public.component_inventory_operations%rowtype; r public.component_recipes%rowtype; s public.purchase_items%rowtype;
 plan jsonb; before_state jsonb; after_state jsonb; line jsonb; product public.products%rowtype; qty integer; v_cost numeric; result jsonb; request text;
begin
 if p_key is null or p_actor is null or p_expected is null then raise exception 'COMPONENT_REQUEST_REQUIRED'; end if;
 request:=encode(sha256(convert_to(jsonb_build_array(p_actor,p_purchase,p_recipe,p_cc,p_lightning,p_expected,p_receipt_opening)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('component:'||p_key::text,0));
 select * into prior from public.component_inventory_operations where operation_key=p_key;
 if found then
  if prior.request_hash<>request then raise exception 'COMPONENT_IDEMPOTENCY_CONFLICT'; end if;
  if exists(select 1 from public.component_inventory_reversals where original_operation=p_key) then raise exception 'COMPONENT_OPERATION_REVERSED'; end if;
  return prior.result||jsonb_build_object('repeated',true);
 end if;
 perform 1 from public.purchases where id=p_purchase for update;
 if exists(select 1 from public.component_inventory_operations where purchase_id=p_purchase) then raise exception 'COMPONENT_PURCHASE_ALREADY_CONVERTED'; end if;
 select * into strict r from public.component_recipes where id=p_recipe;
 perform id from public.products where id in(r.source_product,r.head_product,r.cable_cc_product,r.cable_lightning_product,r.presentation_product,r.legacy_cable_product)
  or id in(select product_id from public.purchase_items where purchase_id=p_purchase) order by id for update;
 plan:=public.get_component_conversion_plan(p_purchase,p_recipe,p_cc,p_lightning);
 if plan->>'fingerprint' is distinct from p_expected then raise exception 'COMPONENT_STALE_PREFLIGHT'; end if;
 select * into strict s from public.purchase_items where purchase_id=p_purchase and product_id=r.source_product;
 if (select stock from public.products where id=r.source_product)<>s.quantity
  or (select stock from public.products where id=r.legacy_cable_product)<>0 then raise exception 'COMPONENT_SOURCE_STOCK_CHANGED'; end if;
 -- Only a pristine source purchase and its untouched other lines can be reclassified.
 if p_receipt_opening is null and exists(select 1 from public.purchase_items i join public.products p on p.id=i.product_id where i.purchase_id=p_purchase and
  (p.stock<>i.quantity or p.cost is distinct from i.effective_unit_cost or p.cost_source_purchase_item_id is distinct from i.id
   or exists(select 1 from public.inventory_movements m where m.product_id=p.id and m.purchase_item_id is distinct from i.id
     and m.component_operation_key is null and not exists(select 1 from public.component_inventory_operations o where o.purchase_id=m.purchase_id))
   or not exists(select 1 from public.inventory_movements m where m.product_id=p.id and m.purchase_item_id=i.id and m.movement_type='purchase' and m.quantity=i.quantity))) then raise exception 'COMPONENT_PURCHASE_STATE_CHANGED'; end if;
 if p_receipt_opening is null and exists(select 1 from public.checkout_operations op join public.order_items i on i.order_id=op.order_id where op.state='pending' and i.product_id in(select (value->>'id')::uuid from jsonb_array_elements(plan->'products'))) then raise exception 'COMPONENT_ACTIVE_RESERVATION'; end if;
 if p_receipt_opening is not null and exists(select 1 from public.purchase_items i join public.products p on p.id=i.product_id
  where i.purchase_id=p_purchase and (p.stock<>i.quantity+coalesce((select (v->>'stock')::integer from jsonb_array_elements(p_receipt_opening) v where (v->>'id')::uuid=p.id),-1)
  or p.cost is distinct from i.effective_unit_cost or p.cost_source_purchase_item_id is distinct from i.id)) then raise exception 'COMPONENT_RECEIPT_STATE_CHANGED'; end if;
 plan:=plan||jsonb_build_object('receipt_opening',p_receipt_opening);
 before_state:=plan->'products';
 update public.products set stock=0 where id=r.source_product;
 insert into public.inventory_movements(product_id,movement_type,quantity,previous_stock,new_stock,reason,created_by,component_operation_key)
 values(r.source_product,'adjustment',s.quantity,s.quantity,0,'Component conversion: source sets consumed',p_actor,p_key);
 for line in select value from jsonb_array_elements(plan->'allocations') loop
  select * into strict product from public.products where id=(line->>'product_id')::uuid;
  qty:=(line->>'quantity')::integer;
  if line->>'key' like 'other:%' then
   if p_receipt_opening is null then v_cost:=(line->>'unit_cents')::numeric/100;
   else
    select round((coalesce((v->>'cost')::numeric,0)*(v->>'stock')::integer+(line->>'total_cents')::numeric/100)/product.stock,2) into v_cost from jsonb_array_elements(p_receipt_opening) v where (v->>'id')::uuid=product.id;
    if v_cost is null then raise exception 'COMPONENT_OPENING_COST_UNKNOWN'; end if;
   end if;
  else
   if product.stock>0 and (product.cost is null or product.cost<=0) then raise exception 'COMPONENT_OPENING_COST_UNKNOWN'; end if;
   v_cost:=round((coalesce(product.cost,0)*product.stock+(line->>'total_cents')::numeric/100)/(product.stock+qty),2);
   update public.products set stock=stock+qty where id=product.id;
   insert into public.inventory_movements(product_id,movement_type,quantity,previous_stock,new_stock,reason,created_by,component_operation_key)
   values(product.id,'adjustment',qty,product.stock,product.stock+qty,'Component conversion: physical pieces received',p_actor,p_key);
  end if;
  update public.products set cost=v_cost,cost_source_purchase_item_id=null,cost_source_component_operation=p_key where id=product.id;
 end loop;
 select jsonb_agg(jsonb_build_object('id',id,'stock',stock,'cost',cost,'source',cost_source_purchase_item_id,'component_source',cost_source_component_operation,'updated_at',updated_at) order by id) into after_state
 from public.products where id in(select (value->>'id')::uuid from jsonb_array_elements(before_state));
 result:=jsonb_build_object('operation_key',p_key,'purchase_id',p_purchase,'converted',true,'repeated',false,'physical_pieces',plan->'physical_pieces','after',after_state);
 insert into public.component_inventory_operations values(p_key,p_purchase,p_recipe,request,p_actor,plan,before_state,after_state,result,now());
 return result;
end $$;

-- Existing RPC name/arguments retained; no changes to sales, checkout or payment RPCs.
alter function public.confirm_purchase(uuid,uuid) rename to confirm_purchase_without_components;
revoke all on function public.confirm_purchase_without_components(uuid,uuid) from public,anon,authenticated,service_role;
create function public.confirm_purchase(p_purchase_id uuid,p_created_by uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.component_purchase_compositions%rowtype; r public.component_recipes%rowtype; out jsonb; plan jsonb; state text; opening jsonb;
begin
 select status into strict state from public.purchases where id=p_purchase_id for update;
 select * into c from public.component_purchase_compositions where purchase_id=p_purchase_id;
 if not found then
  if exists(select 1 from public.purchase_items i join public.component_recipes x on x.source_product=i.product_id where i.purchase_id=p_purchase_id) and state='draft' then raise exception 'COMPONENT_COMPOSITION_REQUIRED'; end if;
  return public.confirm_purchase_without_components(p_purchase_id,p_created_by);
 end if;
 if state='confirmed' then
  if exists(select 1 from public.component_inventory_operations o join public.component_inventory_reversals rev on rev.original_operation=o.operation_key where o.purchase_id=p_purchase_id) then raise exception 'COMPONENT_OPERATION_REVERSED'; end if;
  if not exists(select 1 from public.component_inventory_operations where purchase_id=p_purchase_id) then raise exception 'COMPONENT_CONFIRMED_WITHOUT_CONVERSION'; end if;
  return jsonb_build_object('purchase_id',p_purchase_id,'status','already_confirmed','confirmed_at',(select confirmed_at from public.purchases where id=p_purchase_id),'movements_created',0,'components_received',true);
 end if;
 select * into strict r from public.component_recipes where id=c.recipe_id;
 perform id from public.products where id in(r.source_product,r.head_product,r.cable_cc_product,r.cable_lightning_product,r.presentation_product,r.legacy_cable_product)
  or id in(select product_id from public.purchase_items where purchase_id=p_purchase_id) order by id for update;
 if (select stock from public.products where id=r.source_product)<>0 then raise exception 'COMPONENT_SOURCE_STOCK_NOT_EMPTY'; end if;
 if exists(select 1 from public.products where id in(select product_id from public.purchase_items where purchase_id=p_purchase_id) and stock>0 and (cost is null or cost<=0)) then raise exception 'COMPONENT_OPENING_COST_UNKNOWN'; end if;
 select jsonb_agg(jsonb_build_object('id',id,'stock',stock,'cost',cost) order by id) into opening from public.products where id in(select product_id from public.purchase_items where purchase_id=p_purchase_id);
 out:=public.confirm_purchase_without_components(p_purchase_id,p_created_by);
 plan:=public.get_component_conversion_plan(p_purchase_id,c.recipe_id,c.cable_cc,c.cable_lightning);
 perform public.apply_component_conversion(p_purchase_id,p_created_by,p_purchase_id,c.recipe_id,c.cable_cc,c.cable_lightning,plan->>'fingerprint',opening);
 return out||jsonb_build_object('components_received',true,'movements_created',(select count(*) from public.inventory_movements where purchase_id=p_purchase_id or component_operation_key=p_purchase_id));
end $$;
-- Invoker wrapper needs the base privilege; clients cannot bypass composition through the
-- application gateway. DB trigger below enforces it even for direct service-role calls.
grant execute on function public.confirm_purchase_without_components(uuid,uuid) to service_role;
create function public.guard_uncomposed_receipt() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.status='draft' and new.status='confirmed' and exists(select 1 from public.purchase_items i join public.component_recipes r on r.source_product=i.product_id where i.purchase_id=new.id)
  and not exists(select 1 from public.component_purchase_compositions where purchase_id=new.id) then raise exception 'COMPONENT_COMPOSITION_REQUIRED'; end if;
 return new;
end $$;
create trigger component_composition_required before update of status on public.purchases for each row execute function public.guard_uncomposed_receipt();

create function public.certify_component_receipt() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.status='confirmed' and old.status='draft' and exists(select 1 from public.purchase_items i join public.component_recipes r on r.source_product=i.product_id where i.purchase_id=new.id)
 and not exists(select 1 from public.component_inventory_operations where purchase_id=new.id) then raise exception 'COMPONENT_RECEIPT_NOT_CONVERTED'; end if;
 return new;
end $$;
create constraint trigger component_receipt_complete after update on public.purchases deferrable initially deferred for each row execute function public.certify_component_receipt();
create function public.guard_component_composition() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform 1 from public.purchases where id=new.purchase_id and status='draft' and not historical_import for update;
 if not found then raise exception 'COMPONENT_DRAFT_REQUIRED'; end if;
 if (select coalesce(sum(i.quantity),0) from public.purchase_items i join public.component_recipes r on r.id=new.recipe_id and r.source_product=i.product_id where i.purchase_id=new.purchase_id)<>new.cable_cc+new.cable_lightning then raise exception 'COMPONENT_COMPOSITION_INVALID'; end if;
 return new;
end $$;
create trigger component_composition_guard before insert or update on public.component_purchase_compositions for each row execute function public.guard_component_composition();

create function public.reverse_component_conversion(p_key uuid,p_original uuid,p_actor uuid,p_reason text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op public.component_inventory_operations%rowtype; prior public.component_inventory_reversals%rowtype; state jsonb; row jsonb; current_stock integer; result jsonb;
begin
 if p_key is null or p_actor is null or length(btrim(p_reason)) not between 10 and 500 then raise exception 'COMPONENT_REVERSAL_REQUEST_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('component:'||p_original::text,0));
 select * into strict op from public.component_inventory_operations where operation_key=p_original;
 select * into prior from public.component_inventory_reversals where original_operation=p_original;
 if found then
  if prior.operation_key<>p_key or prior.actor<>p_actor or prior.reason<>p_reason then raise exception 'COMPONENT_REVERSAL_CONFLICT'; end if;
  return prior.result;
 end if;
 perform id from public.products where id in(select (value->>'id')::uuid from jsonb_array_elements(op.after_state)) order by id for update;
 select jsonb_agg(jsonb_build_object('id',id,'stock',stock,'cost',cost,'source',cost_source_purchase_item_id,'component_source',cost_source_component_operation,'updated_at',updated_at) order by id) into state from public.products where id in(select (value->>'id')::uuid from jsonb_array_elements(op.after_state));
 if state is distinct from op.after_state or exists(select 1 from public.inventory_movements m where m.product_id in(select (value->>'id')::uuid from jsonb_array_elements(state)) and m.component_operation_key is distinct from p_original
  and not exists(select 1 from jsonb_array_elements(op.plan->'movements') v where (v->>'id')::uuid=m.id)) then raise exception 'COMPONENT_REVERSAL_POSTERIOR_ACTIVITY'; end if;
 for row in select value from jsonb_array_elements(op.before_state) loop
  select stock into current_stock from public.products where id=(row->>'id')::uuid;
  update public.products set stock=(row->>'stock')::integer,cost=(row->>'cost')::numeric,cost_source_purchase_item_id=(row->>'source')::uuid,cost_source_component_operation=(row->>'component_source')::uuid where id=(row->>'id')::uuid;
  if current_stock<>(row->>'stock')::integer then
   insert into public.inventory_movements(product_id,movement_type,quantity,previous_stock,new_stock,reason,created_by,component_operation_key)
   values((row->>'id')::uuid,'adjustment',abs(current_stock-(row->>'stock')::integer),current_stock,(row->>'stock')::integer,'Component reversal: '||p_reason,p_actor,p_original);
  end if;
 end loop;
 result:=jsonb_build_object('reversed',true,'original_operation',p_original,'operation_key',p_key);
 insert into public.component_inventory_reversals values(p_key,p_original,p_actor,p_reason,result,now()); return result;
end $$;

do $$ declare f regprocedure; begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('component_guard','component_price_changed','approve_component_prices','register_component_recipe','set_component_purchase_composition','get_component_conversion_plan','apply_component_conversion','confirm_purchase','guard_uncomposed_receipt','certify_component_receipt','guard_component_composition','reverse_component_conversion') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
-- Public projection contains no costs, legacy identity, audit or acquisition fields.
-- One row per selectable connector, only after a separate commercial price approval.
create view public.public_component_offers with (security_barrier=true) as
select r.id,r.name,c.connector,r.head_product,h.slug head_slug,p.slug cable_slug,
 least(h.stock,p.stock) available
from public.component_recipes r
cross join lateral (values ('cc',r.cable_cc_product),('lightning',r.cable_lightning_product)) c(connector,product_id)
join public.public_catalog_skus h on h.id=r.head_product
join public.public_catalog_skus p on p.id=c.product_id
where r.prices_approved and h.price>0 and p.price>0
and exists(select 1 from public.component_recipe_price_approvals a where a.recipe_id=r.id
 and a.prices->>h.id::text=h.price::text and a.prices->>p.id::text=p.price::text);
revoke all on public.public_component_offers from public,anon,authenticated;
grant select on public.public_component_offers to anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;
