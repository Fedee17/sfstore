begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='orders' and policyname='sec01_private_boundary') then raise exception 'PAY01_REQUIRES_SEC01'; end if;
end $$;

-- No seed, activation or historical update. Business configuration requires review.
create table public.checkout_configuration (
  id uuid primary key,
  enabled boolean not null default false,
  reservation_seconds integer not null check (reservation_seconds > 0),
  price_policy text not null check (price_policy in ('current_catalog')),
  buyer_authorization text not null check (buyer_authorization in ('authenticated', 'guest_capability')),
  delivery_options jsonb not null check (jsonb_typeof(delivery_options) = 'array' and jsonb_array_length(delivery_options) > 0),
  approved_revision text not null check (length(approved_revision) > 0)
);
create unique index checkout_configuration_single_enabled on public.checkout_configuration ((enabled)) where enabled;
create table public.checkout_operations (
  buyer_id uuid not null,
  operation_key uuid not null,
  request_hash text not null,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  configuration_id uuid not null references public.checkout_configuration(id) on delete restrict,
  state text not null check (state in ('pending', 'expired', 'cancelled', 'confirmed')),
  expires_at timestamptz not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (buyer_id, operation_key)
);
create index checkout_operations_pending_expiry on public.checkout_operations (expires_at) where state = 'pending';
alter table public.checkout_configuration enable row level security;
alter table public.checkout_operations enable row level security;
revoke all on public.checkout_configuration, public.checkout_operations from public, anon, authenticated;
grant select, insert, update on public.checkout_configuration, public.checkout_operations to service_role;
create policy checkout_configuration_private on public.checkout_configuration as restrictive for all to anon, authenticated using (false) with check (false);
create policy checkout_operations_private on public.checkout_operations as restrictive for all to anon, authenticated using (false) with check (false);

create function public.create_checkout_atomic(p_buyer_id uuid, p_operation_key uuid, p_request jsonb)
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
begin
  if p_buyer_id is null or p_operation_key is null then raise exception 'CHECKOUT_UNAUTHORIZED'; end if;
  if jsonb_typeof(p_request) <> 'object' or p_request is null
    or (p_request - array['customer','shipping','paymentMethod','items']) <> '{}'::jsonb
    or jsonb_typeof(p_request->'items') <> 'array'
    or coalesce(jsonb_array_length(p_request->'items'),0) not between 1 and 100
    or p_request->>'paymentMethod' is distinct from 'transfer'
    or jsonb_typeof(p_request->'customer') is distinct from 'object'
    or jsonb_typeof(p_request->'shipping') is distinct from 'object'
    or ((p_request->'customer') - array['fullName','phone','email']) <> '{}'::jsonb
    or ((p_request->'shipping') - array['method','province','city','address','postalCode','carrier']) <> '{}'::jsonb
  then raise exception 'CHECKOUT_INVALID_REQUEST'; end if;
  if coalesce(length(trim(p_request#>>'{customer,fullName}')),0) not between 1 and 200
    or coalesce(length(trim(p_request#>>'{customer,phone}')),0) not between 1 and 80
    or coalesce(p_request#>>'{customer,email}','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then raise exception 'CHECKOUT_INVALID_CUSTOMER'; end if;
  for line in select value from jsonb_array_elements(p_request->'items') loop
    if jsonb_typeof(line) <> 'object' or (line - array['productId','quantity']) <> '{}'::jsonb
      or coalesce(line->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(line->'quantity') is distinct from 'number'
      or coalesce(line->>'quantity','') !~ '^[1-9][0-9]{0,9}$'
      or (line->>'quantity')::numeric > 2147483647
    then raise exception 'CHECKOUT_INVALID_ITEMS'; end if;
  end loop;
  if (select count(distinct (value->>'productId')::uuid) from jsonb_array_elements(p_request->'items')) <> jsonb_array_length(p_request->'items')
  then raise exception 'CHECKOUT_DUPLICATE_PRODUCT'; end if;
  normalized := jsonb_set(p_request,'{items}',(select jsonb_agg(value order by (value->>'productId')::uuid) from jsonb_array_elements(p_request->'items')));
  hash := encode(sha256(convert_to(normalized::text,'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_buyer_id::text || ':' || p_operation_key::text,0));
  select * into op from public.checkout_operations where buyer_id=p_buyer_id and operation_key=p_operation_key;
  if found then
    if op.request_hash <> hash then raise exception 'CHECKOUT_IDEMPOTENCY_CONFLICT'; end if;
    return op.result || jsonb_build_object('state',op.state,'expiresAt',op.expires_at);
  end if;
  select * into cfg from public.checkout_configuration where enabled for share;
  if not found then raise exception 'CHECKOUT_NOT_CONFIGURED'; end if;
  if cfg.buyer_authorization <> 'authenticated' then raise exception 'CHECKOUT_AUTHORIZATION_NOT_IMPLEMENTED'; end if;
  if (select count(*) from jsonb_array_elements(cfg.delivery_options) option where option->>'method'=p_request#>>'{shipping,method}' and coalesce(option->>'carrier','')=coalesce(p_request#>>'{shipping,carrier}','')) <> 1 then raise exception 'CHECKOUT_DELIVERY_NOT_CONFIGURED'; end if;
  select option into delivery from jsonb_array_elements(cfg.delivery_options) option
    where option->>'method' = p_request#>>'{shipping,method}'
      and coalesce(option->>'carrier','') = coalesce(p_request#>>'{shipping,carrier}','');
  if not found or delivery->>'method' not in ('pickup','shipping')
    or jsonb_typeof(delivery->'fee') is distinct from 'number'
    or (delivery->>'fee')::numeric < 0
    or (delivery->>'fee')::numeric <> round((delivery->>'fee')::numeric,2)
  then raise exception 'CHECKOUT_DELIVERY_NOT_CONFIGURED'; end if;
  fee := (delivery->>'fee')::numeric;
  if delivery->>'method'='pickup' and ((p_request->'shipping') - 'method') <> '{}'::jsonb then raise exception 'CHECKOUT_INVALID_SHIPPING'; end if;
  if delivery->>'method' = 'shipping' and (
    coalesce(length(trim(p_request#>>'{shipping,province}')),0)=0 or coalesce(length(trim(p_request#>>'{shipping,city}')),0)=0
    or coalesce(length(trim(p_request#>>'{shipping,address}')),0)=0 or coalesce(length(trim(p_request#>>'{shipping,postalCode}')),0)=0
  ) then raise exception 'CHECKOUT_INVALID_SHIPPING'; end if;
  if delivery->>'method'='shipping' then
    if jsonb_typeof(delivery->'allowedDestinations') is distinct from 'array' then raise exception 'CHECKOUT_DELIVERY_NOT_CONFIGURED'; end if;
    if not exists (select 1 from jsonb_array_elements(delivery->'allowedDestinations') destination
      where destination->>'province'=p_request#>>'{shipping,province}' and destination->>'city'=p_request#>>'{shipping,city}'
        and destination->>'postalCode'=p_request#>>'{shipping,postalCode}') then raise exception 'CHECKOUT_DELIVERY_NOT_CONFIGURED'; end if;
  end if;
  -- Global lock order matches existing inventory RPCs; category is also locked
  -- so deactivation cannot race the catalogue validation.
  for product in select p.*, c.name category_name, c.is_active category_active, c.slug category_slug
    from public.products p join public.categories c on c.id=p.category_id
    where p.id in (select (value->>'productId')::uuid from jsonb_array_elements(normalized->'items'))
    order by p.id for update of p for share of c
  loop
    if product.status <> 'active' or product.historical_identity or not product.category_active or product.category_slug = ''
      or product.slug = 'perfume-yara-rosa' or product.id='05b34469-3eb8-4148-8e97-9a19f1c2df6e'::uuid
    then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
    select (value->>'quantity')::integer into quantity from jsonb_array_elements(normalized->'items') where (value->>'productId')::uuid=product.id;
    if product.stock < quantity then raise exception 'CHECKOUT_STOCK_INSUFFICIENT'; end if;
    unit := coalesce(product.transfer_price,product.price);
    subtotal := subtotal + unit * quantity;
    -- Accounting base preserves total = subtotal - discount + shipping, even if
    -- a legacy transfer price exceeds list. Charged unit price is unchanged.
    list_total := list_total + greatest(product.price,unit) * quantity;
  end loop;
  if (select count(*) from public.products where id in (select (value->>'productId')::uuid from jsonb_array_elements(normalized->'items'))) <> jsonb_array_length(normalized->'items')
  then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
  expires := clock_timestamp() + make_interval(secs => cfg.reservation_seconds);
  insert into public.customers(id,full_name,phone,email,province,city,address,postal_code) values
    (customer_id,p_request#>>'{customer,fullName}',p_request#>>'{customer,phone}',p_request#>>'{customer,email}',
      p_request#>>'{shipping,province}',p_request#>>'{shipping,city}',p_request#>>'{shipping,address}',p_request#>>'{shipping,postalCode}');
  insert into public.orders(id,customer_id,order_number,channel,status,payment_status,payment_method,shipping_method,shipping_carrier,
    shipping_province,shipping_city,shipping_address,shipping_postal_code,subtotal,discount,shipping_cost,total,metadata)
    values(order_id,customer_id,order_number,'web','pending','pending','transfer',delivery->>'method',delivery->>'carrier',
      p_request#>>'{shipping,province}',p_request#>>'{shipping,city}',p_request#>>'{shipping,address}',p_request#>>'{shipping,postalCode}',
      list_total,greatest(0,list_total-subtotal),fee,subtotal+fee,jsonb_build_object('checkout_version',1,'configuration_revision',cfg.approved_revision));
  result := jsonb_build_object('id',order_id,'orderNumber',order_number,'subtotal',list_total,'discount',greatest(0,list_total-subtotal),'shippingCost',fee,'total',subtotal+fee,'state','pending','expiresAt',expires);
  for product in select p.*,c.name category_name from public.products p join public.categories c on c.id=p.category_id
    where p.id in (select (value->>'productId')::uuid from jsonb_array_elements(normalized->'items')) order by p.id
  loop
    select (value->>'quantity')::integer into quantity from jsonb_array_elements(normalized->'items') where (value->>'productId')::uuid=product.id;
    item_id := gen_random_uuid(); unit := coalesce(product.transfer_price,product.price);
    insert into public.order_items(id,order_id,product_id,product_name,product_slug,category_name,unit_price,quantity,subtotal)
      values(item_id,order_id,product.id,product.name,product.slug,product.category_name,unit,quantity,unit*quantity);
    update public.products set stock=stock-quantity where id=product.id;
    insert into public.inventory_movements(product_id,order_id,order_item_id,movement_type,quantity,previous_stock,new_stock,reason)
      values(product.id,order_id,item_id,'reservation',quantity,product.stock,product.stock-quantity,'PAY-01 pending reservation');
  end loop;
  insert into public.checkout_operations values(p_buyer_id,p_operation_key,hash,order_id,cfg.id,'pending',expires,result,clock_timestamp(),clock_timestamp());
  return result;
end $$;

-- Lifecycle is service-only. Confirmation is an integration primitive, NOT a
-- payment assertion: no public endpoint or Mercado Pago handler can invoke it.
create function public.transition_checkout_atomic(p_order_id uuid, p_target text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op public.checkout_operations%rowtype; movement record; current_stock integer;
begin
  if p_target not in ('expired','cancelled','confirmed') or p_target is null then raise exception 'CHECKOUT_INVALID_TRANSITION'; end if;
  perform 1 from public.orders where id=p_order_id for update;
  select * into op from public.checkout_operations where order_id=p_order_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if op.state=p_target then return op.result || jsonb_build_object('state',op.state); end if;
  if op.state <> 'pending' then raise exception 'CHECKOUT_INVALID_TRANSITION'; end if;
  if p_target='expired' and clock_timestamp() < op.expires_at then raise exception 'CHECKOUT_NOT_EXPIRED'; end if;
  if p_target='confirmed' and clock_timestamp() >= op.expires_at then raise exception 'CHECKOUT_EXPIRED'; end if;
  perform 1 from public.products where id in (select product_id from public.order_items where order_id=p_order_id) order by id for update;
  -- Recheck after waits: a blocked confirmation cannot outlive its reservation.
  if p_target='confirmed' and clock_timestamp() >= op.expires_at then raise exception 'CHECKOUT_EXPIRED'; end if;
  update public.checkout_operations set state=p_target,updated_at=clock_timestamp() where order_id=p_order_id;
  if p_target='confirmed' then
    -- Convert existing reservation evidence; stock was already deducted once.
    update public.inventory_movements set movement_type='sale',reason='PAY-01 confirmed reservation'
      where order_id=p_order_id and movement_type='reservation';
    update public.orders set status='confirmed', metadata=metadata || jsonb_build_object('stock_decrease_status','completed','stock_decreased_at',clock_timestamp()) where id=p_order_id;
  else
    for movement in select * from public.inventory_movements where order_id=p_order_id and movement_type='reservation' order by product_id,id loop
      select p.stock into current_stock from public.products p where p.id=movement.product_id;
      update public.products set stock=stock+movement.quantity where id=movement.product_id;
      insert into public.inventory_movements(product_id,order_id,order_item_id,movement_type,quantity,previous_stock,new_stock,reason)
        values(movement.product_id,p_order_id,movement.order_item_id,'release',movement.quantity,current_stock,current_stock+movement.quantity,'PAY-01 ' || p_target);
    end loop;
    -- Existing order workflow remains intact; checkout expiry is independently explicit.
    update public.orders set status='cancelled' where id=p_order_id;
  end if;
  return op.result || jsonb_build_object('state',p_target);
end $$;

create function public.guard_checkout_sale_movement() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if new.movement_type='sale' and exists (select 1 from public.checkout_operations where order_id=new.order_id and state <> 'confirmed')
  then raise exception 'CHECKOUT_NOT_CONFIRMED'; end if;
  return new;
end $$;
create trigger guard_checkout_sale_movement before insert or update on public.inventory_movements for each row execute function public.guard_checkout_sale_movement();
revoke all on function public.create_checkout_atomic(uuid,uuid,jsonb),public.transition_checkout_atomic(uuid,text),public.guard_checkout_sale_movement() from public,anon,authenticated;
grant execute on function public.create_checkout_atomic(uuid,uuid,jsonb),public.transition_checkout_atomic(uuid,text),public.guard_checkout_sale_movement() to service_role;
create function public.guard_checkout_order() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare checkout_state text;
begin
  select state into checkout_state from public.checkout_operations where order_id=old.id;
  if not found then return new; end if;
  if (to_jsonb(new) - array['status','metadata','updated_at']) is distinct from (to_jsonb(old) - array['status','metadata','updated_at'])
    or new.metadata->>'checkout_version' is distinct from '1'
    or (new.status is distinct from old.status and new.status is distinct from
      case checkout_state when 'pending' then 'pending' when 'confirmed' then 'confirmed' else 'cancelled' end)
  then raise exception 'CHECKOUT_USE_ATOMIC_LIFECYCLE'; end if;
  return new;
end $$;
create trigger guard_checkout_order before update on public.orders for each row execute function public.guard_checkout_order();
create function public.guard_checkout_item() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' then
    if exists (select 1 from public.checkout_operations where order_id=new.order_id) then raise exception 'CHECKOUT_IMMUTABLE_ITEMS'; end if;
    return new;
  end if;
  if exists (select 1 from public.checkout_operations where order_id=old.order_id) then raise exception 'CHECKOUT_IMMUTABLE_ITEMS'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_checkout_item before insert or update or delete on public.order_items for each row execute function public.guard_checkout_item();
revoke all on function public.guard_checkout_order(),public.guard_checkout_item() from public,anon,authenticated;
grant execute on function public.guard_checkout_order(),public.guard_checkout_item() to service_role;
commit;
