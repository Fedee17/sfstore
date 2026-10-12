begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- No rates seeded, banking credentials, scheduler or remote operation.
alter table public.checkout_shipping_quote_requests
 add column shipping_fee numeric(12,2) check(shipping_fee>=0),
 add column quoted_carrier text check(quoted_carrier in ('Correo Argentino','Andreani','Via Cargo')),
 add column quoted_total numeric(12,2) check(quoted_total>0),
 add column quote_key text unique check(quote_key ~ '^[a-f0-9]{64}$'),
 add column valid_until timestamptz,
 add column quoted_by uuid,
 add column accepted_order_id uuid references public.orders(id);
create table public.checkout_shipping_quote_audit (
 id uuid primary key default gen_random_uuid(),quote_id uuid not null references public.checkout_shipping_quote_requests(id),
 actor_id uuid not null,event text not null check(event in ('quoted','accepted')),details jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.checkout_shipping_quote_audit enable row level security;
revoke all on public.checkout_shipping_quote_audit from public,anon,authenticated;
grant select,insert on public.checkout_shipping_quote_audit to service_role;
create function public.approve_checkout_shipping_quote(p_quote_id uuid,p_admin_id uuid,p_fee numeric)
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
 for product in select p.*,c.is_active category_active from public.products p join public.categories c on c.id=p.category_id
 where p.id in (select (value->>'productId')::uuid from jsonb_array_elements(quote.request->'items')) order by p.id for share of p,c loop
  if product.status<>'active' or product.historical_identity or not product.category_active then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
  select (value->>'quantity')::integer into quantity from jsonb_array_elements(quote.request->'items') where (value->>'productId')::uuid=product.id;
  subtotal:=subtotal+round(product.price*0.75,2)*quantity;
 end loop;
 if subtotal<=0 or (select count(*) from public.products where id in(select (value->>'productId')::uuid from jsonb_array_elements(quote.request->'items')))<>jsonb_array_length(quote.request->'items') then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
 update public.checkout_shipping_quote_requests set status='resolved',shipping_fee=p_fee,quoted_carrier=request#>>'{shipping,carrier}',quoted_total=subtotal+p_fee,
 quote_key=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),valid_until=clock_timestamp()+interval '24 hours',quoted_by=p_admin_id where id=p_quote_id;
 insert into public.checkout_shipping_quote_audit(quote_id,actor_id,event,details) values(p_quote_id,p_admin_id,'quoted',jsonb_build_object('shippingFee',p_fee,'total',subtotal+p_fee));
 return jsonb_build_object('id',p_quote_id,'total',subtotal+p_fee,'shippingFee',p_fee);
end $$;
revoke all on function public.approve_checkout_shipping_quote(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.approve_checkout_shipping_quote(uuid,uuid,numeric) to service_role;
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
  perform pg_advisory_xact_lock(hashtextextended('checkout-buyer:'||p_buyer_id::text,0));
  select * into op from public.checkout_operations where buyer_id=p_buyer_id and operation_key=p_operation_key;
  if found then
    if op.request_hash <> hash then raise exception 'CHECKOUT_IDEMPOTENCY_CONFLICT'; end if;
    return op.result || jsonb_build_object('state',op.state,'expiresAt',op.expires_at);
  end if;
  perform public.enforce_checkout_limits(p_buyer_id,normalized);
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
    perform public.enforce_checkout_product_limit(p_buyer_id,product.id,quantity,product.stock);
    if product.stock < quantity then raise exception 'CHECKOUT_STOCK_INSUFFICIENT'; end if;
    unit := round(product.price * 0.75,2);
    subtotal := subtotal + unit * quantity;
    -- One discount from list price; never discount transfer_price again.
    -- Round each unit to cents before multiplying quantity and freeze on insert.
    list_total := list_total + greatest(product.price,unit) * quantity;
  end loop;
  if (select count(*) from public.products where id in (select (value->>'productId')::uuid from jsonb_array_elements(normalized->'items'))) <> jsonb_array_length(normalized->'items')
  then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
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
  for product in select p.*,c.name category_name from public.products p join public.categories c on c.id=p.category_id
    where p.id in (select (value->>'productId')::uuid from jsonb_array_elements(normalized->'items')) order by p.id
  loop
    select (value->>'quantity')::integer into quantity from jsonb_array_elements(normalized->'items') where (value->>'productId')::uuid=product.id;
    item_id := gen_random_uuid(); unit := round(product.price * 0.75,2);
    insert into public.order_items(id,order_id,product_id,product_name,product_slug,category_name,unit_price,quantity,subtotal)
      values(item_id,order_id,product.id,product.name,product.slug,product.category_name,unit,quantity,unit*quantity);
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

-- Existing RPC keeps its service-only ACL and security-invoker boundary.
commit;
