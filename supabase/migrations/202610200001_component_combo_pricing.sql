-- Local candidate only. No price/catalog/stock seed and no Production execution.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

-- Refuse to overwrite contracts that differ from the versions actually tested.
-- Normalize CRLF only; do not drop statements or truncate identities to pass.
do $$declare matched integer;begin
 with expected(signature,hash) as(values
 ('public.approve_checkout_shipping_quote(uuid,uuid,numeric)','67c1dbafe407805c5e8931678312a7f72caca6174cfb405c3a9f1ebc576ac8ea'),
 ('public.create_checkout_atomic(uuid,uuid,jsonb)','c25d8fec397a868f1ffe27975597b0e2fe5fbab916fea56dfa45a61e1874eb7e'),
 ('public.create_store_sale(uuid,uuid,text,text,jsonb)','64310d85297ca028bda2af63be530df6030d8d02769a1dccb25bd9f73356be40'),
 ('public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','9276eec86917f41288fedb58adaf28dbcc3713d5f6616c89bf0021811f2ab543'),
 ('public.request_checkout_shipping_quote(uuid,uuid,jsonb)','4976adebd1df9da63bae7028f9c6e97dbdab43e3f3f90950115101d365120990')
 ) select count(*) into matched from expected e join pg_proc p on p.oid=to_regprocedure(e.signature)
 where encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex')=e.hash
 and not p.prosecdef and p.prorettype='jsonb'::regtype
 and has_function_privilege('service_role',p.oid,'EXECUTE')
 and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE');
 if matched<>5 then raise exception 'COMBO_BASE_CONTRACT_CHANGED'; end if;
 if to_regclass('public.component_recipes') is null then raise exception 'COMBO_COMPONENT_CONTRACT_REQUIRED'; end if;
end $$;

create table public.component_combo_pricing (
 recipe_id uuid primary key references public.component_recipes(id),
 version uuid not null unique,
 list_price numeric(12,2) not null check(list_price>0),
 transfer_target numeric(12,2) not null check(transfer_target>0),
 enabled boolean not null default false,
 check(round(list_price*0.75,2)=transfer_target)
);
create table public.component_combo_price_audit (
 operation_key uuid primary key, recipe_id uuid not null references public.component_recipes(id),
 actor uuid not null, list_price numeric(12,2) not null, transfer_target numeric(12,2) not null,
 enabled boolean not null, created_at timestamptz not null default now()
);
alter table public.order_items add column combo_price_snapshot jsonb
 check(combo_price_snapshot is null or jsonb_typeof(combo_price_snapshot)='object');
grant select,insert,update(combo_price_snapshot) on public.order_items to service_role;
create table public.component_combo_returns (
 operation_key uuid primary key, order_id uuid not null references public.orders(id),
 group_key text not null, quantity integer not null check(quantity>0), actor uuid not null,
 reason text not null check(length(btrim(reason)) between 10 and 500), result jsonb not null,
 created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['component_combo_pricing','component_combo_price_audit','component_combo_returns'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert on public.%I to service_role',t);
 end loop;
end $$;
grant update on public.component_combo_pricing to service_role;
create trigger combo_price_audit_immutable before update or delete on public.component_combo_price_audit for each row execute function public.component_guard();
create trigger combo_returns_immutable before update or delete on public.component_combo_returns for each row execute function public.component_guard();

create function public.guard_combo_price_audit() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if tg_op='DELETE' then raise exception 'COMBO_PRICE_AUDIT_REQUIRED'; end if;
 if tg_op='UPDATE' and new.recipe_id<>old.recipe_id then raise exception 'COMBO_PRICE_AUDIT_REQUIRED'; end if;
 if not exists(select 1 from public.component_combo_price_audit a where a.operation_key=new.version and a.recipe_id=new.recipe_id and a.list_price=new.list_price and a.transfer_target=new.transfer_target and a.enabled=new.enabled) then raise exception 'COMBO_PRICE_AUDIT_REQUIRED'; end if;
 return new;
end $$;
create trigger combo_price_audited before insert or update or delete on public.component_combo_pricing for each row execute function public.guard_combo_price_audit();

create function public.configure_component_combo_price(p_key uuid,p_actor uuid,p_recipe uuid,p_list numeric,p_target numeric,p_enabled boolean)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare prior public.component_combo_price_audit%rowtype; r public.component_recipes%rowtype;
begin
 if p_key is null or p_actor is null or p_enabled is null or p_list is null or p_target is null or p_list<=0 or p_list>9999999999.99
  or p_list<>round(p_list,2) or p_target<>round(p_target,2) or p_target<>round(p_list*0.75,2) then raise exception 'COMBO_PRICE_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('combo-price:'||p_key,0));
 select * into prior from public.component_combo_price_audit where operation_key=p_key;
 if found then
  if prior.recipe_id<>p_recipe or prior.actor<>p_actor or prior.list_price<>p_list or prior.transfer_target<>p_target or prior.enabled<>p_enabled then raise exception 'COMBO_PRICE_IDEMPOTENCY_CONFLICT'; end if;
  return;
 end if;
 select * into strict r from public.component_recipes where id=p_recipe;
 perform id from public.products where id in(r.head_product,r.cable_cc_product,r.cable_lightning_product,r.presentation_product) order by id for update;
 perform 1 from public.component_recipes where id=p_recipe for update;
 insert into public.component_combo_price_audit values(p_key,p_recipe,p_actor,p_list,p_target,p_enabled,now());
 insert into public.component_combo_pricing values(p_recipe,p_key,p_list,p_target,p_enabled)
 on conflict(recipe_id) do update set version=excluded.version,list_price=excluded.list_price,transfer_target=excluded.transfer_target,enabled=excluded.enabled;
end $$;

-- Authoritative logical -> physical expansion. Prices are allocated AFTER applying
-- the one commercial discount to the complete combo, never discounted per child.
create function public.resolve_commercial_lines(p_items jsonb,p_discounted boolean,p_channel text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare item jsonb; r public.component_recipes%rowtype; rule public.component_combo_pricing%rowtype;
 p public.products%rowtype; head public.products%rowtype; cable public.products%rowtype;
 ids uuid[]:='{}'; pid uuid; connector text; qty integer; idx integer:=0; final numeric;
 head_list numeric; head_final numeric; snapshot jsonb; result jsonb:='[]'; current_line jsonb;
begin
 if p_channel not in('web','store') or p_discounted is null or jsonb_typeof(p_items) is distinct from 'array'
  or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'CHECKOUT_INVALID_ITEMS'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or item-array['productId','quantity','comboConnector']<>'{}'::jsonb
   or coalesce(item->>'productId','')!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or jsonb_typeof(item->'quantity') is distinct from 'number' or coalesce(item->>'quantity','')!~'^[1-9][0-9]{0,9}$'
   or (item->>'quantity')::numeric>2147483647 then raise exception 'CHECKOUT_INVALID_ITEMS'; end if;
  pid:=(item->>'productId')::uuid; connector:=item->>'comboConnector'; ids:=array_append(ids,pid);
  if item?'comboConnector' then
   if connector is null or connector not in('cc','lightning') then raise exception 'COMBO_SELECTION_INVALID'; end if;
   select * into r from public.component_recipes where presentation_product=pid;
   if not found then raise exception 'COMBO_SELECTION_INVALID'; end if;
   ids:=ids||array[r.head_product,case connector when 'cc' then r.cable_cc_product else r.cable_lightning_product end];
  elsif exists(select 1 from public.component_recipes where presentation_product=pid) then raise exception 'COMBO_SELECTION_REQUIRED'; end if;
 end loop;
 if (select count(distinct (value->>'productId',coalesce(value->>'comboConnector',''))) from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'CHECKOUT_DUPLICATE_PRODUCT'; end if;
 -- All real products first, in the same order as sales, receipts and reservations.
 perform id from public.products where id=any(ids) order by id for update;
 for item in select value from jsonb_array_elements(p_items) loop
  pid:=(item->>'productId')::uuid;qty:=(item->>'quantity')::integer;connector:=item->>'comboConnector';
  if connector is null then
   select * into p from public.products where id=pid;
   if not found then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
   final:=case when p_discounted then round(p.price*0.75,2) else p.price end;
   result:=result||jsonb_build_array(jsonb_build_object('productId',pid,'quantity',qty,'listPrice',p.price,'unitPrice',final,'originIndex',idx,'comboSnapshot',null));
  else
   select * into strict r from public.component_recipes where presentation_product=pid for share;
   select * into rule from public.component_combo_pricing where recipe_id=r.id and enabled for share;
   if not found or not r.prices_approved then raise exception 'COMBO_NOT_AVAILABLE'; end if;
   select * into strict head from public.products where id=r.head_product;
   select * into strict cable from public.products where id=case connector when 'cc' then r.cable_cc_product else r.cable_lightning_product end;
   if head.price<=0 or cable.price<=0 then raise exception 'COMBO_NOT_AVAILABLE'; end if;
   final:=case when p_discounted then round(rule.list_price*0.75,2) else rule.list_price end;
   head_list:=round(rule.list_price*head.price/(head.price+cable.price),2);
   head_final:=round(final*head.price/(head.price+cable.price),2);
   if head_list<=0 or rule.list_price-head_list<=0 or head_final<=0 or final-head_final<=0 then raise exception 'COMBO_PRICE_INVALID'; end if;
   snapshot:=jsonb_build_object('presentationId',pid,'name',r.name,'connector',connector,'groupKey',pid::text||':'||connector,
    'version',rule.version,'listPrice',rule.list_price,'finalPrice',final,'policy','combo_once_25_v1','allocation','proportional_list_residual_to_cable_v1');
   result:=result||jsonb_build_array(
    jsonb_build_object('productId',head.id,'quantity',qty,'listPrice',head_list,'unitPrice',head_final,'originIndex',idx,'comboSnapshot',snapshot||jsonb_build_object('role','head')),
    jsonb_build_object('productId',cable.id,'quantity',qty,'listPrice',rule.list_price-head_list,'unitPrice',final-head_final,'originIndex',idx,'comboSnapshot',snapshot||jsonb_build_object('role','cable')));
  end if;
  idx:=idx+1;
 end loop;
 for current_line in select value from jsonb_array_elements(result) loop
  select * into strict p from public.products where id=(current_line->>'productId')::uuid;
  if p.commercial_blocked then raise exception 'VARIANT_COMMERCIALLY_BLOCKED'; end if;
  if p_channel='web' and not p.web_visible then raise exception 'VARIANT_NOT_WEB_VISIBLE'; end if;
  if p.historical_identity or p.status<>'active' or p.price<=0 or (p_channel='web' and (p.slug='perfume-yara-rosa' or p.id='05b34469-3eb8-4148-8e97-9a19f1c2df6e'::uuid)) or
   (p_channel='web' and not exists(select 1 from public.categories where id=p.category_id and is_active and slug<>'')) then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
 end loop;
 -- Aggregate demand before any movement; standalones and both connectors share head stock.
 if exists(select 1 from (select (value->>'productId')::uuid id,sum((value->>'quantity')::bigint) quantity from jsonb_array_elements(result) group by 1) d
  join public.products available_product on available_product.id=d.id where d.quantity>available_product.stock) then
   if p_channel='store' then raise exception 'STORE_SALE_STOCK_INSUFFICIENT'; else raise exception 'CHECKOUT_STOCK_INSUFFICIENT'; end if;
  end if;
 return result;
end $$;

create function public.commercial_inventory_request(p_lines jsonb) returns jsonb
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select jsonb_agg(jsonb_build_object('productId',id,'quantity',quantity) order by id)
 from(select (value->>'productId')::uuid id,sum((value->>'quantity')::bigint) quantity from jsonb_array_elements(p_lines) group by 1) d;
$$;

create function public.snapshot_combo_label() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.combo_price_snapshot is not null then
  if exists(select 1 from public.orders where id=new.order_id and historical_import) then raise exception 'COMBO_HISTORY_IMMUTABLE'; end if;
  new.product_name:=new.product_name||' · Combo '||(new.combo_price_snapshot->>'name')||' / '||case new.combo_price_snapshot->>'connector' when 'cc' then 'USB-C a USB-C' else 'USB-C a Lightning' end;
 end if;
 return new;
end $$;
create trigger zzz_snapshot_combo_label before insert on public.order_items for each row execute function public.snapshot_combo_label();

-- RPC replacements below retain their existing signatures, ACLs, transaction and
-- idempotency boundaries. Only new orders are priced/expanded; no history backfill.

create or replace function create_store_sale(
  p_idempotency_key uuid,
  p_created_by uuid,
  p_customer_name text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing orders%rowtype;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_item_count integer;
  v_distinct_count integer;
  v_locked_count integer := 0;
  v_total numeric(12, 2) := 0;
  v_line record;
begin
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_IDEMPOTENCY_REQUIRED';
  end if;
  if p_created_by is null then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_ACTOR_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from orders
  where idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.channel <> 'store' then
      raise exception using errcode = 'P0001', message = 'STORE_SALE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'operation', 'already_created',
      'total', v_existing.total
    );
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_NO_ITEMS';
  end if;

  select count(*), count(distinct product_id)
    into v_item_count, v_distinct_count
  from jsonb_to_recordset(p_items)
    as item(product_id uuid, quantity numeric, unit_price numeric);
  -- Canonical combo allocations can contain the same real SKU in distinct groups.
  -- The public-facing atomic RPC validates unique logical selections first.

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as item(product_id uuid, quantity numeric, unit_price numeric)
    where product_id is null
       or quantity is null
       or quantity <= 0
       or quantity <> trunc(quantity)
       or quantity > 2147483647
  ) then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_QUANTITY_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as item(product_id uuid, quantity numeric, unit_price numeric)
    where unit_price is null
       or unit_price <= 0
       or unit_price > 9999999999.99
       or unit_price <> round(unit_price, 2)
  ) then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_PRICE_INVALID';
  end if;

  for v_line in
    select
      product.id,
      product.stock,
      product.status,
      item.quantity::integer as quantity,
      item.unit_price::numeric(12, 2) as unit_price
    from jsonb_to_recordset(p_items)
      as item(product_id uuid, quantity numeric, unit_price numeric)
    join products product on product.id = item.product_id
    order by product.id
    for share of product
  loop
    v_locked_count := v_locked_count + 1;
    if v_line.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'STORE_SALE_PRODUCT_INACTIVE';
    end if;
    if v_line.quantity > v_line.stock then
      raise exception using
        errcode = 'P0001',
        message = format(
          'STORE_SALE_STOCK_INSUFFICIENT:%s:%s:%s',
          v_line.id,
          v_line.stock,
          v_line.quantity
        );
    end if;
    v_total := v_total + round(v_line.unit_price * v_line.quantity, 2);
  end loop;

  if v_locked_count <> v_item_count then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_PRODUCT_NOT_FOUND';
  end if;

  v_order_number := 'SF-L-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS')
    || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 6));

  insert into orders (
    id, customer_id, order_number, channel, status, payment_method,
    payment_status, shipping_method, subtotal, discount, shipping_cost,
    total, notes, metadata, idempotency_key
  ) values (
    v_order_id, null, v_order_number, 'store', 'pending', null,
    'pending', null, v_total, 0, 0, v_total,
    nullif(btrim(p_notes), ''),
    jsonb_build_object(
      'source', 'sfstore_admin_store_sale',
      'customer_name', nullif(btrim(p_customer_name), ''),
      'created_by', p_created_by
    ),
    p_idempotency_key
  );

  insert into order_items (
    order_id, product_id, product_name, product_slug, category_name,
    unit_price, quantity, subtotal, list_unit_price_snapshot, combo_price_snapshot
  )
  select
    v_order_id,
    product.id,
    product.name,
    product.slug,
    category.name,
    item.unit_price::numeric(12, 2),
    item.quantity::integer,
    round(item.unit_price * item.quantity, 2),
    item.list_unit_price, item.combo_snapshot
  from jsonb_to_recordset(p_items)
    as item(product_id uuid, quantity numeric, unit_price numeric, list_unit_price numeric, combo_snapshot jsonb)
  join products product on product.id = item.product_id
  join categories category on category.id = product.category_id
  order by product.id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'operation', 'created',
    'total', v_total
  );
end;
$$;


CREATE OR REPLACE FUNCTION public.create_store_sale_atomic(
  p_idempotency_key uuid, p_created_by uuid, p_customer_name text, p_notes text,
  p_items jsonb, p_payments jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.orders%rowtype;
  v_fingerprint text;
  v_count integer;
  v_distinct integer;
  v_payment record;
  v_line record;
  v_discounted boolean := true;
  v_paid numeric := 0;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_unit numeric;
  v_canonical jsonb := '[]'::jsonb;
  v_sale jsonb;
  v_result jsonb;
  v_inventory jsonb;
  v_order_id uuid;
  v_method text;
  v_logical jsonb;
  v_priced jsonb;
BEGIN
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'STORE_SALE_IDEMPOTENCY_REQUIRED'; END IF;
  IF p_created_by IS NULL THEN RAISE EXCEPTION 'STORE_SALE_ACTOR_REQUIRED'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'STORE_SALE_NO_ITEMS'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'STORE_SALE_NO_ITEMS'; END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN RAISE EXCEPTION 'STORE_SALE_PAYMENT_INVALID'; END IF;
  IF jsonb_array_length(p_payments) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'STORE_SALE_PAYMENT_INVALID'; END IF;

  -- Fingerprint the request, not mutable catalog values. A successful retry returns the frozen sale.
  v_fingerprint := md5(jsonb_build_object('customer_name',nullif(btrim(p_customer_name),''),
    'notes',nullif(btrim(p_notes),''),'items',p_items,'payments',p_payments,'actor',p_created_by)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  SELECT * INTO v_existing FROM public.orders WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.channel <> 'store' OR v_existing.historical_import
       OR v_existing.metadata->>'store_sale_request_fingerprint' IS DISTINCT FROM v_fingerprint
       OR v_existing.metadata->>'store_pricing_policy' IS DISTINCT FROM 'full_payment_25_v1' THEN
      RAISE EXCEPTION 'STORE_SALE_IDEMPOTENCY_CONFLICT';
    END IF;
    SELECT coalesce(sum(amount),0) INTO v_paid FROM public.order_payments
      WHERE order_id=v_existing.id AND status='approved';
    IF v_existing.payment_status <> 'paid' OR v_paid <> v_existing.total THEN
      RAISE EXCEPTION 'STORE_SALE_PAYMENT_TOTAL_MISMATCH';
    END IF;
    RETURN jsonb_build_object('order_id',v_existing.id,'order_number',v_existing.order_number,
      'operation','already_created','subtotal',v_existing.subtotal,'discount',v_existing.discount,
      'total',v_existing.total,'total_paid',v_paid,'remaining_amount',0,'payment_status','paid',
      'inventory',jsonb_build_object('order_id',v_existing.id,'status','already_applied','movements_created',0));
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    IF jsonb_typeof(v_payment.value) <> 'object'
       OR v_payment.value-array['method','amount']<>'{}'::jsonb
       OR jsonb_typeof(v_payment.value->'amount') IS DISTINCT FROM 'number'
       OR (v_payment.value->>'method') IS NULL
       OR (v_payment.value->>'method') NOT IN ('cash','transfer','debit','credit','qr','other') THEN
      RAISE EXCEPTION 'STORE_SALE_PAYMENT_INVALID';
    END IF;
    IF (v_payment.value->>'amount')::numeric <= 0
       OR (v_payment.value->>'amount')::numeric > 9999999999.99
       OR (v_payment.value->>'amount')::numeric <> round((v_payment.value->>'amount')::numeric,2) THEN
      RAISE EXCEPTION 'STORE_SALE_PAYMENT_INVALID';
    END IF;
    v_paid := v_paid + (v_payment.value->>'amount')::numeric;
    v_discounted := v_discounted AND (v_payment.value->>'method') IN ('cash','transfer');
  END LOOP;

  -- Input prices only detect stale/tampered previews; authority is the locked products.price.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x WHERE jsonb_typeof(x)<>'object'
      OR x-array['product_id','quantity','unit_price','combo_connector']<>'{}'::jsonb
      OR (x?'combo_connector' AND (jsonb_typeof(x->'combo_connector') IS DISTINCT FROM 'string' OR x->>'combo_connector' NOT IN ('cc','lightning')))
      OR jsonb_typeof(x->'quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(x->'unit_price') IS DISTINCT FROM 'number') THEN
    RAISE EXCEPTION 'STORE_SALE_QUANTITY_INVALID';
  END IF;
  SELECT count(*),count(DISTINCT (product_id,coalesce(combo_connector,''))) INTO v_count,v_distinct
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid,quantity numeric,unit_price numeric,combo_connector text);
  IF v_count <> v_distinct THEN RAISE EXCEPTION 'STORE_SALE_DUPLICATE_PRODUCT'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS x(product_id uuid,quantity numeric,unit_price numeric)
      WHERE product_id IS NULL OR quantity IS NULL OR quantity<=0 OR quantity<>trunc(quantity) OR quantity>1000000) THEN
    RAISE EXCEPTION 'STORE_SALE_QUANTITY_INVALID';
  END IF;

  select jsonb_agg(jsonb_build_object('productId',value->'product_id','quantity',value->'quantity')||case when value?'combo_connector' then jsonb_build_object('comboConnector',value->'combo_connector') else '{}'::jsonb end order by ordinality)
    into v_logical from jsonb_array_elements(p_items) with ordinality;
  v_priced:=public.resolve_commercial_lines(v_logical,v_discounted,'store');
  for v_line in select value,ordinality-1 idx from jsonb_array_elements(p_items) with ordinality loop
    select sum((value->>'unitPrice')::numeric) into v_unit from jsonb_array_elements(v_priced) where (value->>'originIndex')::integer=v_line.idx;
    if (v_line.value->>'unit_price')::numeric is distinct from v_unit then raise exception 'STORE_SALE_PRICE_CHANGED'; end if;
  end loop;
  select sum((value->>'listPrice')::numeric*(value->>'quantity')::integer),sum((value->>'unitPrice')::numeric*(value->>'quantity')::integer),
   jsonb_agg(jsonb_build_object('product_id',value->'productId','quantity',value->'quantity','unit_price',value->'unitPrice','list_unit_price',value->'listPrice','combo_snapshot',value->'comboSnapshot') order by value->>'productId',value->>'originIndex')
   into v_subtotal,v_total,v_canonical from jsonb_array_elements(v_priced);
  IF v_subtotal>9999999999.99 OR v_total>9999999999.99 THEN RAISE EXCEPTION 'STORE_SALE_PRICE_INVALID'; END IF;
  IF v_paid <> v_total THEN RAISE EXCEPTION 'STORE_SALE_PAYMENT_TOTAL_MISMATCH'; END IF;

  -- Reuse the existing creator, payment ledger and inventory operation in this transaction.
  SELECT public.create_store_sale(p_idempotency_key,p_created_by,p_customer_name,p_notes,v_canonical) INTO v_sale;
  v_order_id := (v_sale->>'order_id')::uuid;
  UPDATE public.orders SET subtotal=v_subtotal,discount=v_subtotal-v_total,
    metadata=metadata || jsonb_build_object('store_sale_request_fingerprint',v_fingerprint,
      'store_pricing_policy','full_payment_25_v1','cost_snapshot_policy','current_product_cost_at_sale_v1')
    WHERE id=v_order_id;
  UPDATE public.order_items item SET list_unit_price_snapshot=coalesce(item.list_unit_price_snapshot,product.price),unit_cost_snapshot=product.cost
    FROM public.products product WHERE item.order_id=v_order_id AND item.product_id=product.id;

  FOR v_payment IN SELECT value,ordinality FROM jsonb_array_elements(p_payments) WITH ORDINALITY ORDER BY ordinality LOOP
    -- Keep shared online method constraints and record_order_payment unchanged.
    v_method := CASE v_payment.value->>'method' WHEN 'debit' THEN 'card' WHEN 'credit' THEN 'card'
      WHEN 'qr' THEN 'other' ELSE v_payment.value->>'method' END;
    SELECT public.record_order_payment(v_order_id,v_method,(v_payment.value->>'amount')::numeric,'approved',
      format('store:%s:payment:%s',p_idempotency_key,v_payment.ordinality),NULL,NULL,false) INTO v_result;
    UPDATE public.order_payments SET store_payment_method=v_payment.value->>'method'
      WHERE id=(v_result->>'payment_id')::uuid AND order_id=v_order_id;
  END LOOP;
  IF v_result->>'payment_status' IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'STORE_SALE_PAYMENT_TOTAL_MISMATCH'; END IF;
  SELECT public.complete_store_sale(v_order_id,p_created_by)->'inventory' INTO v_inventory;
  RETURN jsonb_build_object('order_id',v_order_id,'order_number',v_sale->>'order_number','operation','created',
    'subtotal',v_subtotal,'discount',v_subtotal-v_total,'total',v_total,'total_paid',v_paid,
    'remaining_amount',0,'payment_status','paid','inventory',v_inventory);
END;
$$;

create or replace function public.create_checkout_atomic(p_buyer_id uuid, p_operation_key uuid, p_request jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  cfg public.checkout_configuration%rowtype;
  op public.checkout_operations%rowtype;
  product record;
  line jsonb;
  delivery jsonb;
  normalized jsonb;
  hash text;
  customer_id uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  item_id uuid;
  order_number text := 'SF-' || order_id::text;
  expires timestamptz;
  unit numeric(12,2);
  subtotal numeric(12,2) := 0;
  list_total numeric(12,2) := 0;
  fee numeric(12,2);
  quantity integer;
  result jsonb;
  approved public.checkout_shipping_quote_requests%rowtype;
  priced_lines jsonb;
  inventory_request jsonb;
  quoted jsonb;
  selected_quote jsonb;
begin
  if p_buyer_id is null or p_operation_key is null then raise exception 'CHECKOUT_UNAUTHORIZED'; end if;
  if jsonb_typeof(p_request) <> 'object' or p_request is null
    or (p_request - array['customer','shipping','paymentMethod','items']) <> '{}'::jsonb
    or jsonb_typeof(p_request->'items') <> 'array'
    or coalesce(jsonb_array_length(p_request->'items'),0) not between 1 and 100
    or coalesce(p_request->>'paymentMethod','') <> 'transfer'
    or jsonb_typeof(p_request->'customer') is distinct from 'object'
    or jsonb_typeof(p_request->'shipping') is distinct from 'object'
    or ((p_request->'customer') - array['fullName','phone','email']) <> '{}'::jsonb
    or ((p_request->'shipping') - array['method','province','city','address','postalCode','carrier','quoteKey']) <> '{}'::jsonb
  then raise exception 'CHECKOUT_INVALID_REQUEST'; end if;
  if coalesce(length(trim(p_request#>>'{customer,fullName}')),0) not between 1 and 200
    or coalesce(length(trim(p_request#>>'{customer,phone}')),0) not between 1 and 80
    or (p_request#>>'{customer,email}' is not null and p_request#>>'{customer,email}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  then raise exception 'CHECKOUT_INVALID_CUSTOMER'; end if;
  for line in select value from jsonb_array_elements(p_request->'items') loop
    if jsonb_typeof(line) <> 'object' or (line - array['productId','quantity','comboConnector']) <> '{}'::jsonb
      or coalesce(line->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(line->'quantity') is distinct from 'number'
      or coalesce(line->>'quantity','') !~ '^[1-9][0-9]{0,9}$'
      or (line->>'quantity')::numeric > 2147483647
    then raise exception 'CHECKOUT_INVALID_ITEMS'; end if;
  end loop;
  if (select count(distinct ((value->>'productId')::uuid,coalesce(value->>'comboConnector',''))) from jsonb_array_elements(p_request->'items')) <> jsonb_array_length(p_request->'items')
  then raise exception 'CHECKOUT_DUPLICATE_PRODUCT'; end if;
  normalized := jsonb_set(p_request,'{items}',(select jsonb_agg(value order by (value->>'productId')::uuid,coalesce(value->>'comboConnector','')) from jsonb_array_elements(p_request->'items')));
  hash := encode(sha256(convert_to(normalized::text,'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_buyer_id::text || ':' || p_operation_key::text,0));
  perform pg_advisory_xact_lock(hashtextextended('checkout-buyer:'||p_buyer_id::text,0));
  select * into op from public.checkout_operations where buyer_id=p_buyer_id and operation_key=p_operation_key;
  if found then
    if op.request_hash <> hash then raise exception 'CHECKOUT_IDEMPOTENCY_CONFLICT'; end if;
    return op.result || jsonb_build_object('state',op.state,'expiresAt',op.expires_at);
  end if;
  -- Real physical demand is checked below after logical combo expansion.
  select * into cfg from public.checkout_configuration where enabled for share;
  if not found then raise exception 'CHECKOUT_NOT_CONFIGURED'; end if;
  if cfg.price_policy <> 'manual_25_frozen' or cfg.reservation_seconds <> 86400 then raise exception 'CHECKOUT_POLICY_NOT_CONFIGURED'; end if;
  if p_request->>'paymentMethod'='cash' and p_request#>>'{shipping,method}' is distinct from 'pickup' then raise exception 'CHECKOUT_INVALID_SHIPPING'; end if;
  if cfg.buyer_authorization <> 'authenticated' then raise exception 'CHECKOUT_AUTHORIZATION_NOT_IMPLEMENTED'; end if;
  if p_request#>>'{shipping,method}'='shipping' then
    select * into approved from public.checkout_shipping_quote_requests where buyer_id=p_buyer_id and quote_key=p_request#>>'{shipping,quoteKey}' for update;
    if found then
      if approved.status<>'resolved' or approved.valid_until<=clock_timestamp() or approved.accepted_order_id is not null
        or approved.request is distinct from jsonb_set(normalized,'{shipping}',(normalized->'shipping')-'quoteKey')
      then raise exception 'CHECKOUT_SHIPPING_QUOTE_CHANGED'; end if;
      delivery:=jsonb_build_object('method','shipping','carrier',approved.quoted_carrier,'fee',approved.shipping_fee,'allowedDestinations',jsonb_build_array(jsonb_build_object('province',p_request#>>'{shipping,province}','city',p_request#>>'{shipping,city}','postalCode',p_request#>>'{shipping,postalCode}')));
    end if;
    quoted:=public.get_checkout_shipping_quote(p_buyer_id,jsonb_build_object('province',p_request#>>'{shipping,province}','city',p_request#>>'{shipping,city}','postalCode',p_request#>>'{shipping,postalCode}'));
  end if;
  if approved.id is not null then
    null; -- The private approved quote defines this exact cart's shipping cost.
  elsif p_request#>>'{shipping,method}'='shipping' then
    if quoted->>'status'='quotation_required' then raise exception 'CHECKOUT_SHIPPING_QUOTE_REQUIRED'; end if;
    if (select count(*) from jsonb_array_elements(quoted->'rates') rate where rate->>'quoteKey'=p_request#>>'{shipping,quoteKey}' and rate->>'carrier'=p_request#>>'{shipping,carrier}')<>1 then raise exception 'CHECKOUT_SHIPPING_QUOTE_CHANGED'; end if;
    select rate into selected_quote from jsonb_array_elements(quoted->'rates') rate where rate->>'quoteKey'=p_request#>>'{shipping,quoteKey}' and rate->>'carrier'=p_request#>>'{shipping,carrier}';
    delivery:=jsonb_build_object('method','shipping','carrier',selected_quote->>'carrier','fee',selected_quote->'fee','allowedDestinations',jsonb_build_array(jsonb_build_object('province',p_request#>>'{shipping,province}','city',p_request#>>'{shipping,city}','postalCode',p_request#>>'{shipping,postalCode}')));
  else
  if (select count(*) from jsonb_array_elements(cfg.delivery_options) option where option->>'method'=p_request#>>'{shipping,method}' and coalesce(option->>'carrier','')=coalesce(p_request#>>'{shipping,carrier}','')) <> 1 then raise exception 'CHECKOUT_DELIVERY_NOT_CONFIGURED'; end if;
  select option into delivery from jsonb_array_elements(cfg.delivery_options) option
    where option->>'method' = p_request#>>'{shipping,method}'
      and coalesce(option->>'carrier','') = coalesce(p_request#>>'{shipping,carrier}','');
  end if;
  if delivery is null or delivery->>'method' not in ('pickup','shipping')
    or jsonb_typeof(delivery->'fee') is distinct from 'number'
    or (delivery->>'fee')::numeric < 0
    or (delivery->>'fee')::numeric <> round((delivery->>'fee')::numeric,2)
  then raise exception 'CHECKOUT_DELIVERY_NOT_CONFIGURED'; end if;
  fee := (delivery->>'fee')::numeric;
  if delivery->>'method'='pickup' and fee<>0 then raise exception 'CHECKOUT_DELIVERY_NOT_CONFIGURED'; end if;
  if delivery->>'method'='pickup' and ((p_request->'shipping') - 'method') <> '{}'::jsonb then raise exception 'CHECKOUT_INVALID_SHIPPING'; end if;
  if delivery->>'method' = 'shipping' and (
    coalesce(length(trim(p_request#>>'{shipping,province}')),0)=0 or coalesce(length(trim(p_request#>>'{shipping,city}')),0)=0
    or coalesce(length(trim(p_request#>>'{shipping,address}')),0)=0 or coalesce(length(trim(p_request#>>'{shipping,postalCode}')),0)=0
  ) then raise exception 'CHECKOUT_INVALID_SHIPPING'; end if;
  if delivery->>'method'='shipping' then
    if coalesce(length(trim(delivery->>'carrier')),0)=0 or jsonb_typeof(delivery->'allowedDestinations') is distinct from 'array' then raise exception 'CHECKOUT_DELIVERY_NOT_CONFIGURED'; end if;
    if not exists (select 1 from jsonb_array_elements(delivery->'allowedDestinations') destination
      where destination->>'province'=p_request#>>'{shipping,province}' and destination->>'city'=p_request#>>'{shipping,city}'
        and destination->>'postalCode'=p_request#>>'{shipping,postalCode}') then raise exception 'CHECKOUT_DELIVERY_NOT_CONFIGURED'; end if;
  end if;
  priced_lines:=public.resolve_commercial_lines(normalized->'items',true,'web');
  inventory_request:=public.commercial_inventory_request(priced_lines);
  perform public.enforce_checkout_limits(p_buyer_id,jsonb_set(normalized,'{items}',inventory_request));
  for product in select p.* from public.products p where id in(select (value->>'productId')::uuid from jsonb_array_elements(inventory_request)) order by id loop
   select (value->>'quantity')::integer into quantity from jsonb_array_elements(inventory_request) where (value->>'productId')::uuid=product.id;
   perform public.enforce_checkout_product_limit(p_buyer_id,product.id,quantity,product.stock);
  end loop;
  select sum((value->>'unitPrice')::numeric*(value->>'quantity')::integer),sum((value->>'listPrice')::numeric*(value->>'quantity')::integer)
   into subtotal,list_total from jsonb_array_elements(priced_lines);
  if approved.id is not null and (approved.valid_until<=clock_timestamp() or approved.quoted_total<>subtotal+fee) then raise exception 'CHECKOUT_SHIPPING_QUOTE_CHANGED'; end if;
  expires := clock_timestamp() + interval '24 hours';
  insert into public.customers(id,full_name,phone,email,province,city,address,postal_code) values
    (customer_id,p_request#>>'{customer,fullName}',p_request#>>'{customer,phone}',p_request#>>'{customer,email}',
      p_request#>>'{shipping,province}',p_request#>>'{shipping,city}',p_request#>>'{shipping,address}',p_request#>>'{shipping,postalCode}');
  insert into public.orders(id,customer_id,order_number,channel,status,payment_status,payment_method,shipping_method,shipping_carrier,
    shipping_province,shipping_city,shipping_address,shipping_postal_code,subtotal,discount,shipping_cost,total,metadata)
    values(order_id,customer_id,order_number,'web','pending','pending',p_request->>'paymentMethod',delivery->>'method',delivery->>'carrier',
      p_request#>>'{shipping,province}',p_request#>>'{shipping,city}',p_request#>>'{shipping,address}',p_request#>>'{shipping,postalCode}',
      list_total,greatest(0,list_total-subtotal),fee,subtotal+fee,jsonb_build_object('checkout_version',1,'configuration_revision',cfg.approved_revision,'price_policy','manual_25_frozen','discount_percent',25,'reservation_seconds',86400));
  result := jsonb_build_object('paymentMethod',p_request->>'paymentMethod','id',order_id,'orderNumber',order_number,'subtotal',list_total,'discount',greatest(0,list_total-subtotal),'shippingCost',fee,'total',subtotal+fee,'state','pending','expiresAt',expires);
  for line in select value from jsonb_array_elements(priced_lines) order by value->>'productId',value->>'originIndex' loop
    select p.*,c.name category_name into product from public.products p join public.categories c on c.id=p.category_id where p.id=(line->>'productId')::uuid;
    quantity:=(line->>'quantity')::integer;item_id:=gen_random_uuid();unit:=(line->>'unitPrice')::numeric;
    insert into public.order_items(id,order_id,product_id,product_name,product_slug,category_name,unit_price,quantity,subtotal,list_unit_price_snapshot,unit_cost_snapshot,combo_price_snapshot)
      values(item_id,order_id,product.id,product.name,product.slug,product.category_name,unit,quantity,unit*quantity,(line->>'listPrice')::numeric,product.cost,nullif(line->'comboSnapshot','null'::jsonb));
    update public.products set stock=stock-quantity where id=product.id;
    insert into public.inventory_movements(product_id,order_id,order_item_id,movement_type,quantity,previous_stock,new_stock,reason)
      values(product.id,order_id,item_id,'reservation',quantity,product.stock,product.stock-quantity,'PAY-01 pending reservation');
  end loop;
  insert into public.checkout_operations values(p_buyer_id,p_operation_key,hash,order_id,cfg.id,'pending',expires,result,clock_timestamp(),clock_timestamp());
  if approved.id is not null then
    update public.checkout_shipping_quote_requests set accepted_order_id=order_id where id=approved.id;
    insert into public.checkout_shipping_quote_audit(quote_id,actor_id,event,details) values(approved.id,p_buyer_id,'accepted',jsonb_build_object('orderId',order_id,'total',subtotal+fee));
  end if;
  return result;
end $$;


create or replace function public.approve_checkout_shipping_quote(p_quote_id uuid,p_admin_id uuid,p_fee numeric)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare quote public.checkout_shipping_quote_requests%rowtype; subtotal numeric:=0; product record; quantity integer;
begin
 -- Administrator identity is verified by getUser + allowlist in the service-only caller.
 if p_admin_id is null or p_fee is null or p_fee<0 or p_fee>9999999 or p_fee<>round(p_fee,2) then raise exception 'CHECKOUT_INVALID_QUOTATION'; end if;
 select * into quote from public.checkout_shipping_quote_requests where id=p_quote_id for update;
 if not found or quote.request#>>'{shipping,carrier}' not in ('Correo Argentino','Andreani','Via Cargo') or quote.request#>>'{shipping,carrier}' is null then raise exception 'CHECKOUT_INVALID_QUOTATION'; end if;
 if quote.status='resolved' then
  if quote.shipping_fee=p_fee then return jsonb_build_object('id',quote.id,'total',quote.quoted_total,'shippingFee',quote.shipping_fee); end if;
  raise exception 'CHECKOUT_IDEMPOTENCY_CONFLICT';
 end if;
 if quote.status<>'requested' then raise exception 'CHECKOUT_INVALID_QUOTATION'; end if;
 select sum((value->>'unitPrice')::numeric*(value->>'quantity')::integer) into subtotal
 from jsonb_array_elements(public.resolve_commercial_lines(quote.request->'items',true,'web'));
 if subtotal<=0 then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
 update public.checkout_shipping_quote_requests set status='resolved',shipping_fee=p_fee,quoted_carrier=request#>>'{shipping,carrier}',quoted_total=subtotal+p_fee,
 quote_key=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),valid_until=clock_timestamp()+interval '24 hours',quoted_by=p_admin_id where id=p_quote_id;
 insert into public.checkout_shipping_quote_audit(quote_id,actor_id,event,details) values(p_quote_id,p_admin_id,'quoted',jsonb_build_object('shippingFee',p_fee,'total',subtotal+p_fee));
 return jsonb_build_object('id',p_quote_id,'total',subtotal+p_fee,'shippingFee',p_fee);
end $$;


create or replace function public.request_checkout_shipping_quote(p_buyer_id uuid,p_operation_key uuid,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare normalized jsonb; hash text; existing public.checkout_shipping_quote_requests%rowtype; id uuid:=gen_random_uuid(); line jsonb;
begin
 if p_buyer_id is null or p_operation_key is null then raise exception 'CHECKOUT_UNAUTHORIZED'; end if;
 if jsonb_typeof(p_request) is distinct from 'object' or (p_request-array['customer','shipping','paymentMethod','items'])<>'{}'::jsonb
  or p_request->>'paymentMethod' is distinct from 'transfer'
  or jsonb_typeof(p_request->'customer') is distinct from 'object' or ((p_request->'customer')-array['fullName','phone','email'])<>'{}'::jsonb
  or coalesce(length(btrim(p_request#>>'{customer,fullName}')),0) not between 1 and 200
  or coalesce(length(btrim(p_request#>>'{customer,phone}')),0) not between 1 and 80
  or (p_request#>>'{customer,email}' is not null and p_request#>>'{customer,email}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  or jsonb_typeof(p_request->'shipping') is distinct from 'object' or p_request#>>'{shipping,method}' is distinct from 'shipping'
  or ((p_request->'shipping')-array['method','province','city','postalCode','address','carrier','quoteKey'])<>'{}'::jsonb
  or coalesce(length(btrim(p_request#>>'{shipping,address}')),0) not between 1 and 300
  or jsonb_typeof(p_request->'items') is distinct from 'array' or coalesce(jsonb_array_length(p_request->'items'),0) not between 1 and 100
 then raise exception 'CHECKOUT_INVALID_REQUEST'; end if;
 for line in select value from jsonb_array_elements(p_request->'items') loop
  if jsonb_typeof(line) is distinct from 'object' or (line-array['productId','quantity','comboConnector'])<>'{}'::jsonb
   or coalesce(line->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(line->'quantity') is distinct from 'number' or coalesce(line->>'quantity','') !~ '^[1-9][0-9]{0,9}$' or (line->>'quantity')::numeric>2147483647
  then raise exception 'CHECKOUT_INVALID_ITEMS'; end if;
 end loop;
 if (select count(distinct ((value->>'productId')::uuid,coalesce(value->>'comboConnector',''))) from jsonb_array_elements(p_request->'items'))<>jsonb_array_length(p_request->'items') then raise exception 'CHECKOUT_DUPLICATE_PRODUCT'; end if;
 normalized:=jsonb_set(p_request,'{items}',(select jsonb_agg(value order by (value->>'productId')::uuid,coalesce(value->>'comboConnector','')) from jsonb_array_elements(p_request->'items')));
 hash:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('shipping-quote:'||p_buyer_id::text||':'||p_operation_key::text,0));
 select * into existing from public.checkout_shipping_quote_requests where buyer_id=p_buyer_id and operation_key=p_operation_key;
 if found then
  if existing.request_hash<>hash then raise exception 'CHECKOUT_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',existing.id,'status',existing.status,'createsOrder',false);
 end if;
 perform public.get_checkout_shipping_quote(p_buyer_id,jsonb_build_object('province',p_request#>>'{shipping,province}','city',p_request#>>'{shipping,city}','postalCode',p_request#>>'{shipping,postalCode}'));
 perform public.resolve_commercial_lines(normalized->'items',true,'web');
 insert into public.checkout_shipping_quote_requests(id,buyer_id,operation_key,request_hash,request) values(id,p_buyer_id,p_operation_key,hash,normalized);
 return jsonb_build_object('id',id,'status','requested','createsOrder',false);
end $$;

create function public.return_component_combo_stock(p_key uuid,p_actor uuid,p_order uuid,p_group text,p_quantity integer,p_reason text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare prior public.component_combo_returns%rowtype; ord public.orders%rowtype; item record;
 result jsonb; qty integer; price numeric; current_stock integer;
begin
 if p_key is null or p_actor is null or p_quantity is null or p_quantity<1 or p_reason is null or length(btrim(p_reason)) not between 10 and 500 then raise exception 'COMBO_RETURN_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('combo-return:'||p_key,0));
 select * into prior from public.component_combo_returns where operation_key=p_key;
 if found then
  if prior.order_id<>p_order or prior.group_key<>p_group or prior.actor<>p_actor or prior.quantity<>p_quantity or prior.reason<>p_reason then raise exception 'COMBO_RETURN_IDEMPOTENCY_CONFLICT'; end if;
  return prior.result;
 end if;
 select * into ord from public.orders where id=p_order for update;
 if not found or ord.historical_import or coalesce(ord.metadata->>'stock_decrease_status','')<>'completed' then raise exception 'COMBO_RETURN_NOT_SOLD'; end if;
 select min(quantity),min((combo_price_snapshot->>'finalPrice')::numeric) into qty,price from public.order_items
  where order_id=p_order and combo_price_snapshot->>'groupKey'=p_group;
 if qty is null or (select count(*) from public.order_items where order_id=p_order and combo_price_snapshot->>'groupKey'=p_group)<>2
 or p_quantity+coalesce((select sum(quantity) from public.component_combo_returns where order_id=p_order and group_key=p_group),0)>qty then raise exception 'COMBO_RETURN_QUANTITY_INVALID'; end if;
 perform id from public.products where id in(select product_id from public.order_items where order_id=p_order and combo_price_snapshot->>'groupKey'=p_group) order by id for update;
 for item in select * from public.order_items where order_id=p_order and combo_price_snapshot->>'groupKey'=p_group order by product_id loop
  select stock into current_stock from public.products where id=item.product_id;
  update public.products set stock=stock+p_quantity where id=item.product_id;
  insert into public.inventory_movements(product_id,order_id,order_item_id,movement_type,quantity,previous_stock,new_stock,reason,created_by)
   values(item.product_id,p_order,item.id,'return',p_quantity,current_stock,current_stock+p_quantity,'Combo physical return: '||p_reason,p_actor);
 end loop;
 result:=jsonb_build_object('returned',p_quantity,'refundReferenceAmount',price*p_quantity,'paymentModified',false,'orderId',p_order);
 insert into public.component_combo_returns values(p_key,p_order,p_group,p_quantity,p_actor,p_reason,result,now());
 return result;
end $$;

create or replace view public.public_component_offers with(security_barrier=true) as
select r.id,r.name,c.connector,r.head_product,h.slug head_slug,p.slug cable_slug,least(h.stock,p.stock) available,
 r.presentation_product,rule.list_price combo_list_price,rule.transfer_target combo_transfer_price,rule.version price_version
from public.component_recipes r
join public.component_combo_pricing rule on rule.recipe_id=r.id and rule.enabled
cross join lateral(values('cc',r.cable_cc_product),('lightning',r.cable_lightning_product)) c(connector,product_id)
join public.public_catalog_skus h on h.id=r.head_product
join public.public_catalog_skus p on p.id=c.product_id
where r.prices_approved and h.price>0 and p.price>0
 and exists(select 1 from public.component_recipe_price_approvals a where a.recipe_id=r.id and a.prices->>h.id::text=h.price::text and a.prices->>p.id::text=p.price::text);
revoke all on public.public_component_offers from public,anon,authenticated;
grant select on public.public_component_offers to anon,authenticated,service_role;
do $$declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
 ('guard_combo_price_audit','configure_component_combo_price','resolve_commercial_lines','commercial_inventory_request','snapshot_combo_label','return_component_combo_stock','create_store_sale','create_store_sale_atomic','create_checkout_atomic','request_checkout_shipping_quote','approve_checkout_shipping_quote') loop
 execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
