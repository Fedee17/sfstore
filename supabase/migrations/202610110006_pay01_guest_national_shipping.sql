begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- No Auth activation, rate seed, orders, reservations, worker or real shipping API.
create table public.checkout_shipping_quote_requests (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null,
 operation_key uuid not null,
 request_hash text not null,
 request jsonb not null,
 status text not null default 'requested' check(status in ('requested','resolved','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 unique(buyer_id,operation_key)
);
alter table public.checkout_shipping_quote_requests enable row level security;
revoke all on public.checkout_shipping_quote_requests from public,anon,authenticated,service_role;
grant select,insert,update on public.checkout_shipping_quote_requests to service_role;
create policy checkout_shipping_quotes_private on public.checkout_shipping_quote_requests as restrictive for all to anon,authenticated using(false) with check(false);

create function public.get_checkout_shipping_quote(p_buyer_id uuid,p_destination jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare cfg public.checkout_configuration%rowtype; option jsonb; rate jsonb; rates jsonb:='[]'::jsonb; fee numeric(12,2); key text;
begin
 if p_buyer_id is null then raise exception 'CHECKOUT_UNAUTHORIZED'; end if;
 if jsonb_typeof(p_destination) is distinct from 'object' or (p_destination-array['province','city','postalCode'])<>'{}'::jsonb
  or coalesce(length(btrim(p_destination->>'city')),0) not between 1 and 300
  or coalesce(length(btrim(p_destination->>'postalCode')),0) not between 1 and 300
  or not coalesce(p_destination->>'province'=any(array['Buenos Aires','Ciudad Autónoma de Buenos Aires','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán']),false)
 then raise exception 'CHECKOUT_INVALID_DESTINATION'; end if;
 select * into cfg from public.checkout_configuration where enabled for share;
 if not found then raise exception 'CHECKOUT_NOT_CONFIGURED'; end if;
 if cfg.price_policy<>'manual_25_frozen' or cfg.reservation_seconds<>86400 then raise exception 'CHECKOUT_POLICY_NOT_CONFIGURED'; end if;
 if cfg.buyer_authorization<>'authenticated' then raise exception 'CHECKOUT_AUTHORIZATION_NOT_IMPLEMENTED'; end if;
 for option in select value from jsonb_array_elements(cfg.delivery_options) loop
  if option->>'method' is distinct from 'shipping' or option->'enabled' is distinct from 'true'::jsonb or option->>'country' is distinct from 'AR' or coalesce(option->>'carrier','') not in ('Correo Argentino','Andreani','Via Cargo') or jsonb_typeof(option->'destinationRates') is distinct from 'array' then continue; end if;
  for rate in select value from jsonb_array_elements(option->'destinationRates') loop
   if rate->'enabled' is distinct from 'true'::jsonb or jsonb_typeof(rate->'fee') is distinct from 'number'
    or rate->>'province' is distinct from p_destination->>'province'
    or (rate->>'city' is not null and lower(btrim(rate->>'city'))<>lower(btrim(p_destination->>'city')))
    or (rate->>'postalCode' is not null and upper(replace(btrim(rate->>'postalCode'),' ',''))<>upper(replace(btrim(p_destination->>'postalCode'),' ','')))
   then continue; end if;
   begin
   fee:=(rate->>'fee')::numeric;
   if fee<0 or (rate->>'fee')::numeric<>round((rate->>'fee')::numeric,2) then continue; end if;
   if rate->>'validUntil' is not null and (rate->>'validUntil')::timestamptz<=clock_timestamp() then continue; end if;
   exception when invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then continue;
   end;
   key:=encode(sha256(convert_to(jsonb_build_object('configuration',cfg.id,'revision',cfg.approved_revision,'option',option,'rate',rate)::text,'UTF8')),'hex');
   rates:=rates||jsonb_build_array(jsonb_build_object('carrier',option->>'carrier','fee',fee,'quoteKey',key));
  end loop;
 end loop;
 return jsonb_build_object('status',case when jsonb_array_length(rates)=0 then 'quotation_required' else 'available' end,'rates',rates,'country','AR');
end $$;

create function public.request_checkout_shipping_quote(p_buyer_id uuid,p_operation_key uuid,p_request jsonb)
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
  if jsonb_typeof(line) is distinct from 'object' or (line-array['productId','quantity'])<>'{}'::jsonb
   or coalesce(line->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(line->'quantity') is distinct from 'number' or coalesce(line->>'quantity','') !~ '^[1-9][0-9]{0,9}$' or (line->>'quantity')::numeric>2147483647
  then raise exception 'CHECKOUT_INVALID_ITEMS'; end if;
 end loop;
 if (select count(distinct (value->>'productId')::uuid) from jsonb_array_elements(p_request->'items'))<>jsonb_array_length(p_request->'items') then raise exception 'CHECKOUT_DUPLICATE_PRODUCT'; end if;
 normalized:=jsonb_set(p_request,'{items}',(select jsonb_agg(value order by (value->>'productId')::uuid) from jsonb_array_elements(p_request->'items')));
 hash:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('shipping-quote:'||p_buyer_id::text||':'||p_operation_key::text,0));
 select * into existing from public.checkout_shipping_quote_requests where buyer_id=p_buyer_id and operation_key=p_operation_key;
 if found then
  if existing.request_hash<>hash then raise exception 'CHECKOUT_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',existing.id,'status',existing.status,'createsOrder',false);
 end if;
 perform public.get_checkout_shipping_quote(p_buyer_id,jsonb_build_object('province',p_request#>>'{shipping,province}','city',p_request#>>'{shipping,city}','postalCode',p_request#>>'{shipping,postalCode}'));
 if exists(select 1 from jsonb_array_elements(normalized->'items') item left join public.products p on p.id=(item->>'productId')::uuid left join public.categories c on c.id=p.category_id
  where p.id is null or p.status<>'active' or p.historical_identity or not c.is_active or c.slug='' or p.slug='perfume-yara-rosa' or p.id='05b34469-3eb8-4148-8e97-9a19f1c2df6e'::uuid)
 then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
 insert into public.checkout_shipping_quote_requests(id,buyer_id,operation_key,request_hash,request) values(id,p_buyer_id,p_operation_key,hash,normalized);
 return jsonb_build_object('id',id,'status','requested','createsOrder',false);
end $$;
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
  quoted jsonb;
  selected_quote jsonb;
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
  select * into op from public.checkout_operations where buyer_id=p_buyer_id and operation_key=p_operation_key;
  if found then
    if op.request_hash <> hash then raise exception 'CHECKOUT_IDEMPOTENCY_CONFLICT'; end if;
    return op.result || jsonb_build_object('state',op.state,'expiresAt',op.expires_at);
  end if;
  select * into cfg from public.checkout_configuration where enabled for share;
  if not found then raise exception 'CHECKOUT_NOT_CONFIGURED'; end if;
  if cfg.price_policy <> 'manual_25_frozen' or cfg.reservation_seconds <> 86400 then raise exception 'CHECKOUT_POLICY_NOT_CONFIGURED'; end if;
  if p_request->>'paymentMethod'='cash' and p_request#>>'{shipping,method}' is distinct from 'pickup' then raise exception 'CHECKOUT_INVALID_SHIPPING'; end if;
  if cfg.buyer_authorization <> 'authenticated' then raise exception 'CHECKOUT_AUTHORIZATION_NOT_IMPLEMENTED'; end if;
  if p_request#>>'{shipping,method}'='shipping' then
    quoted:=public.get_checkout_shipping_quote(p_buyer_id,jsonb_build_object('province',p_request#>>'{shipping,province}','city',p_request#>>'{shipping,city}','postalCode',p_request#>>'{shipping,postalCode}'));
  end if;
  if p_request#>>'{shipping,method}'='shipping' and exists(select 1 from jsonb_array_elements(cfg.delivery_options) option where option->>'method'='shipping' and option ? 'destinationRates') then
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
    if product.stock < quantity then raise exception 'CHECKOUT_STOCK_INSUFFICIENT'; end if;
    unit := round(product.price * 0.75,2);
    subtotal := subtotal + unit * quantity;
    -- One discount from list price; never discount transfer_price again.
    -- Round each unit to cents before multiplying quantity and freeze on insert.
    list_total := list_total + greatest(product.price,unit) * quantity;
  end loop;
  if (select count(*) from public.products where id in (select (value->>'productId')::uuid from jsonb_array_elements(normalized->'items'))) <> jsonb_array_length(normalized->'items')
  then raise exception 'CHECKOUT_PRODUCT_UNAVAILABLE'; end if;
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
  return result;
end $$;


revoke all on function public.get_checkout_shipping_quote(uuid,jsonb),public.request_checkout_shipping_quote(uuid,uuid,jsonb),public.create_checkout_atomic(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_checkout_shipping_quote(uuid,jsonb),public.request_checkout_shipping_quote(uuid,uuid,jsonb),public.create_checkout_atomic(uuid,uuid,jsonb) to service_role;
commit;
