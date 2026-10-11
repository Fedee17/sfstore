begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Additive payment method; historical Mercado Pago rows remain representable.
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('transfer','cash','mercadopago'));
-- No price or duration defaults, configuration seed or activation.
alter table public.checkout_configuration add column cash_price_policy text check (cash_price_policy in ('list','transfer'));
create table public.checkout_manual_payments (
  order_id uuid primary key references public.orders(id) on delete restrict,
  operation_key uuid not null unique,
  admin_id uuid not null,
  payment_method text not null check(payment_method in ('transfer','cash')),
  amount numeric(12,2) not null check(amount > 0),
  external_reference text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create unique index checkout_manual_payment_reference on public.checkout_manual_payments(payment_method,external_reference) where external_reference is not null;
alter table public.checkout_manual_payments enable row level security;
revoke all on public.checkout_manual_payments from public,anon,authenticated;
grant select,insert,update on public.checkout_manual_payments to service_role;
create policy checkout_manual_payments_private on public.checkout_manual_payments as restrictive for all to anon,authenticated using(false) with check(false);

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
begin
  if p_buyer_id is null or p_operation_key is null then raise exception 'CHECKOUT_UNAUTHORIZED'; end if;
  if jsonb_typeof(p_request) <> 'object' or p_request is null
    or (p_request - array['customer','shipping','paymentMethod','items']) <> '{}'::jsonb
    or jsonb_typeof(p_request->'items') <> 'array'
    or coalesce(jsonb_array_length(p_request->'items'),0) not between 1 and 100
    or coalesce(p_request->>'paymentMethod','') not in ('transfer','cash')
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
  if p_request->>'paymentMethod'='cash' and (p_request#>>'{shipping,method}' is distinct from 'pickup' or cfg.cash_price_policy is null) then raise exception 'CHECKOUT_CASH_NOT_CONFIGURED'; end if;
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
    unit := case when p_request->>'paymentMethod'='cash' and cfg.cash_price_policy='list' then product.price else coalesce(product.transfer_price,product.price) end;
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
    values(order_id,customer_id,order_number,'web','pending','pending',p_request->>'paymentMethod',delivery->>'method',delivery->>'carrier',
      p_request#>>'{shipping,province}',p_request#>>'{shipping,city}',p_request#>>'{shipping,address}',p_request#>>'{shipping,postalCode}',
      list_total,greatest(0,list_total-subtotal),fee,subtotal+fee,jsonb_build_object('checkout_version',1,'configuration_revision',cfg.approved_revision));
  result := jsonb_build_object('paymentMethod',p_request->>'paymentMethod','id',order_id,'orderNumber',order_number,'subtotal',list_total,'discount',greatest(0,list_total-subtotal),'shippingCost',fee,'total',subtotal+fee,'state','pending','expiresAt',expires);
  for product in select p.*,c.name category_name from public.products p join public.categories c on c.id=p.category_id
    where p.id in (select (value->>'productId')::uuid from jsonb_array_elements(normalized->'items')) order by p.id
  loop
    select (value->>'quantity')::integer into quantity from jsonb_array_elements(normalized->'items') where (value->>'productId')::uuid=product.id;
    item_id := gen_random_uuid(); unit := case when p_request->>'paymentMethod'='cash' and cfg.cash_price_policy='list' then product.price else coalesce(product.transfer_price,product.price) end;
    insert into public.order_items(id,order_id,product_id,product_name,product_slug,category_name,unit_price,quantity,subtotal)
      values(item_id,order_id,product.id,product.name,product.slug,product.category_name,unit,quantity,unit*quantity);
    update public.products set stock=stock-quantity where id=product.id;
    insert into public.inventory_movements(product_id,order_id,order_item_id,movement_type,quantity,previous_stock,new_stock,reason)
      values(product.id,order_id,item_id,'reservation',quantity,product.stock,product.stock-quantity,'PAY-01 pending reservation');
  end loop;
  insert into public.checkout_operations values(p_buyer_id,p_operation_key,hash,order_id,cfg.id,'pending',expires,result,clock_timestamp(),clock_timestamp());
  return result;
end $$;

create or replace function public.guard_checkout_order() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare checkout_state text;
begin
  select state into checkout_state from public.checkout_operations where order_id=old.id;
  if not found then return new; end if;
  if (to_jsonb(new) - array['status','payment_status','metadata','updated_at']) is distinct from (to_jsonb(old) - array['status','payment_status','metadata','updated_at'])
    or new.metadata->>'checkout_version' is distinct from '1'
    or (new.status is distinct from old.status and new.status is distinct from
      case checkout_state when 'pending' then 'pending' when 'confirmed' then 'confirmed' else 'cancelled' end)
  then raise exception 'CHECKOUT_USE_ATOMIC_LIFECYCLE'; end if;
  if new.payment_status is distinct from old.payment_status and not (
    new.payment_status='paid' and checkout_state='confirmed'
    and exists(select 1 from public.checkout_manual_payments where order_id=old.id and amount=new.total)
    and (select coalesce(sum(amount),0) from public.order_payments where order_id=old.id and status='approved')=new.total
  ) then raise exception 'CHECKOUT_MANUAL_PAYMENT_REQUIRED'; end if;
  return new;
end $$;

create function public.guard_checkout_payment_entry() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare target uuid;
begin
  if tg_op in ('UPDATE','DELETE') and exists(select 1 from public.checkout_operations where order_id=old.order_id) then raise exception 'CHECKOUT_MANUAL_PAYMENT_IMMUTABLE'; end if;
  target := case when tg_op='DELETE' then old.order_id else new.order_id end;
  if not exists(select 1 from public.checkout_operations where order_id=target) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op <> 'INSERT' then raise exception 'CHECKOUT_MANUAL_PAYMENT_IMMUTABLE'; end if;
  if not exists(select 1 from public.checkout_manual_payments receipt
      join public.checkout_operations op on op.order_id=receipt.order_id
      where receipt.order_id=new.order_id and receipt.payment_method=new.method and receipt.amount=new.amount
        and new.status='approved' and op.state='confirmed'
        and new.reference='manual-checkout:' || receipt.operation_key::text)
  then raise exception 'CHECKOUT_MANUAL_PAYMENT_REQUIRED'; end if;
  return new;
end $$;
create trigger guard_checkout_payment_entry before insert or update or delete on public.order_payments for each row execute function public.guard_checkout_payment_entry();

create function public.confirm_checkout_manual_payment(p_order_id uuid,p_operation_key uuid,p_admin_id uuid,p_amount numeric,p_reference text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare ord public.orders%rowtype; op public.checkout_operations%rowtype; receipt public.checkout_manual_payments%rowtype; payment_result jsonb; reference text:=nullif(trim(p_reference),'');
begin
  if p_admin_id is null or p_operation_key is null then raise exception 'CHECKOUT_MANUAL_UNAUTHORIZED'; end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into op from public.checkout_operations where order_id=p_order_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into receipt from public.checkout_manual_payments where order_id=p_order_id;
  if found then
    if receipt.operation_key=p_operation_key and receipt.admin_id=p_admin_id and receipt.amount=p_amount and receipt.external_reference is not distinct from reference then return receipt.result; end if;
    raise exception 'CHECKOUT_MANUAL_ALREADY_RECORDED';
  end if;
  if ord.payment_method not in ('transfer','cash') or (ord.payment_method='cash' and ord.shipping_method<>'pickup') then raise exception 'CHECKOUT_MANUAL_METHOD_INVALID'; end if;
  if p_amount is null or p_amount<=0 or p_amount is distinct from ord.total then raise exception 'CHECKOUT_MANUAL_AMOUNT_MISMATCH'; end if;
  if ord.payment_method='transfer' and reference is null then raise exception 'CHECKOUT_MANUAL_REFERENCE_REQUIRED'; end if;
  if length(reference)>200 then raise exception 'CHECKOUT_MANUAL_REFERENCE_INVALID'; end if;
  if op.state<>'pending' then raise exception 'CHECKOUT_INVALID_TRANSITION'; end if;
  insert into public.checkout_manual_payments(order_id,operation_key,admin_id,payment_method,amount,external_reference)
    values(p_order_id,p_operation_key,p_admin_id,ord.payment_method,p_amount,reference);
  perform public.transition_checkout_atomic(p_order_id,'confirmed');
  payment_result:=public.record_order_payment(p_order_id,ord.payment_method,p_amount,'approved','manual-checkout:' || p_operation_key::text,
    'Manual payment verified by authorized administrator',clock_timestamp(),false);
  update public.checkout_manual_payments set result=payment_result || jsonb_build_object('checkout_state','confirmed','verified_by',p_admin_id) where order_id=p_order_id;
  return payment_result || jsonb_build_object('checkout_state','confirmed','verified_by',p_admin_id);
end $$;

-- Explicit single-run operation only; no cron or unattended caller.
create function public.expire_checkout_reservations(p_limit integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare candidate record; released integer:=0; failures jsonb:='[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'CHECKOUT_INVALID_BATCH_LIMIT'; end if;
  for candidate in select o.id from public.orders o join public.checkout_operations op on op.order_id=o.id
    where op.state='pending' and op.expires_at<=clock_timestamp()
    order by o.id limit p_limit for update of o skip locked
  loop
    begin
      perform public.transition_checkout_atomic(candidate.id,'expired'); released:=released+1;
    exception when others then
      failures:=failures || jsonb_build_array(jsonb_build_object('orderId',candidate.id,'code','CHECKOUT_EXPIRATION_FAILED'));
    end;
  end loop;
  return jsonb_build_object('released',released,'failures',failures);
end $$;
revoke all on function public.create_checkout_atomic(uuid,uuid,jsonb),public.guard_checkout_order(),public.guard_checkout_payment_entry(),public.confirm_checkout_manual_payment(uuid,uuid,uuid,numeric,text),public.expire_checkout_reservations(integer) from public,anon,authenticated;
grant execute on function public.create_checkout_atomic(uuid,uuid,jsonb),public.guard_checkout_order(),public.guard_checkout_payment_entry(),public.confirm_checkout_manual_payment(uuid,uuid,uuid,numeric,text),public.expire_checkout_reservations(integer) to service_role;
commit;
