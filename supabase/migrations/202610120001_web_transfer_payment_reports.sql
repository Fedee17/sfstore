begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Local/remote application is always an operator action; never resets existing data.
create table public.checkout_reservation_policy (
 id boolean primary key default true check(id),
 max_pending integer not null default 2 check(max_pending between 1 and 20),
 max_units integer not null default 6 check(max_units between 1 and 100),
 max_product_units integer not null default 2 check(max_product_units between 1 and 100),
 max_per_minute integer not null default 2 check(max_per_minute between 1 and 20),
 max_per_hour integer not null default 6 check(max_per_hour between 1 and 100),
 max_reports integer not null default 1 check(max_reports between 1 and 20),
 max_rejections_week integer not null default 2 check(max_rejections_week between 1 and 100),
 cooldown_seconds integer not null default 3600 check(cooldown_seconds between 0 and 604800),
 max_reserved_percent integer not null default 80 check(max_reserved_percent between 1 and 100),
 review_hours integer not null default 48 check(review_hours between 1 and 168)
);
insert into public.checkout_reservation_policy(id) values(true);
create table public.checkout_buyer_exceptions (
 buyer_id uuid primary key, expires_at timestamptz not null,
 max_pending integer not null check(max_pending between 1 and 20),
 max_units integer not null check(max_units between 1 and 100),
 max_product_units integer not null check(max_product_units between 1 and 100),
 max_reports integer not null check(max_reports between 1 and 20),
 reason text not null check(length(btrim(reason)) between 5 and 500), admin_id uuid not null
);
create table public.checkout_payment_reports (
 order_id uuid primary key references public.orders(id) on delete restrict,
 buyer_id uuid not null, operation_key uuid not null unique,
 object_path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 bytes integer not null check(bytes between 1 and 5242880),
 status text not null default 'uploading' check(status in ('uploading','pending','accepted','rejected')),
 created_at timestamptz not null default clock_timestamp(), reported_at timestamptz,
 reviewed_at timestamptz, reviewed_by uuid, rejection_reason text,
 check((status='uploading' and reported_at is null) or (status<>'uploading' and reported_at is not null)),
 check(status<>'rejected' or (reviewed_by is not null and length(btrim(rejection_reason)) between 5 and 500))
);
create index checkout_report_buyer on public.checkout_payment_reports(buyer_id,status,reported_at);
create table public.checkout_audit (
 id bigint generated always as identity primary key,
 order_id uuid references public.orders(id) on delete restrict,
 actor_id uuid, event text not null, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp()
);
create index checkout_audit_order on public.checkout_audit(order_id,created_at);
do $$ declare t text; begin
 foreach t in array array['checkout_reservation_policy','checkout_buyer_exceptions','checkout_payment_reports','checkout_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert on public.%I to service_role',t);
  if t<>'checkout_audit' then execute format('grant update on public.%I to service_role',t); end if;
  execute format('create policy %I on public.%I as restrictive for all to anon,authenticated using(false) with check(false)',t||'_private',t);
 end loop;
end $$;
grant usage on sequence public.checkout_audit_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('checkout-payment-proofs','checkout-payment-proofs',false,5242880,array['application/pdf','image/png','image/jpeg']);
create policy checkout_payment_proofs_private on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'checkout-payment-proofs') with check(bucket_id<>'checkout-payment-proofs');
create policy checkout_payment_bucket_private on storage.buckets as restrictive for all to anon,authenticated
 using(id<>'checkout-payment-proofs') with check(id<>'checkout-payment-proofs');

create function public.enforce_checkout_limits(p_buyer_id uuid,p_request jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare cfg public.checkout_reservation_policy%rowtype; exception public.checkout_buyer_exceptions%rowtype; units bigint;
begin
 select * into cfg from public.checkout_reservation_policy where id for share;
 select * into exception from public.checkout_buyer_exceptions where buyer_id=p_buyer_id and expires_at>clock_timestamp() for share;
 if found then cfg.max_pending:=exception.max_pending; cfg.max_units:=exception.max_units; cfg.max_product_units:=exception.max_product_units; end if;
 if (select count(*) from public.checkout_operations where buyer_id=p_buyer_id and state='pending')>=cfg.max_pending then raise exception 'CHECKOUT_PENDING_LIMIT'; end if;
 select coalesce(sum(i.quantity),0) into units from public.order_items i join public.checkout_operations op on op.order_id=i.order_id where op.buyer_id=p_buyer_id and op.state='pending';
 if units+(select sum((value->>'quantity')::bigint) from jsonb_array_elements(p_request->'items'))>cfg.max_units then raise exception 'CHECKOUT_UNITS_LIMIT'; end if;
 if (select count(*) from public.checkout_operations where buyer_id=p_buyer_id and created_at>clock_timestamp()-interval '1 minute')>=cfg.max_per_minute
 or (select count(*) from public.checkout_operations where buyer_id=p_buyer_id and created_at>clock_timestamp()-interval '1 hour')>=cfg.max_per_hour then raise exception 'CHECKOUT_FREQUENCY_LIMIT'; end if;
 if not exists(select 1 from public.checkout_buyer_exceptions where buyer_id=p_buyer_id and expires_at>clock_timestamp()) and (
 (select count(*) from public.checkout_payment_reports where buyer_id=p_buyer_id and status='rejected' and reviewed_at>clock_timestamp()-interval '7 days')>=cfg.max_rejections_week
 or exists(select 1 from public.checkout_operations op join public.order_items i on i.order_id=op.order_id where op.buyer_id=p_buyer_id and op.state in ('expired','cancelled') and op.updated_at>clock_timestamp()-make_interval(secs=>cfg.cooldown_seconds) and i.product_id in (select (value->>'productId')::uuid from jsonb_array_elements(p_request->'items')))
 ) then raise exception 'CHECKOUT_REVIEW_REQUIRED'; end if;
end $$;
create function public.enforce_checkout_product_limit(p_buyer_id uuid,p_product_id uuid,p_quantity integer,p_stock integer)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare cfg public.checkout_reservation_policy%rowtype; cap integer; reserved bigint;
begin
 select * into cfg from public.checkout_reservation_policy where id;
 select max_product_units into cap from public.checkout_buyer_exceptions where buyer_id=p_buyer_id and expires_at>clock_timestamp();
 cap:=coalesce(cap,cfg.max_product_units);
 if p_quantity+(select coalesce(sum(i.quantity),0) from public.order_items i join public.checkout_operations op on op.order_id=i.order_id where op.buyer_id=p_buyer_id and op.state='pending' and i.product_id=p_product_id)>cap then raise exception 'CHECKOUT_PRODUCT_LIMIT'; end if;
 -- Caller holds this product's row lock. Sessions share this inventory budget.
 select coalesce(sum(i.quantity),0) into reserved from public.order_items i join public.checkout_operations op on op.order_id=i.order_id where op.state='pending' and i.product_id=p_product_id;
 if reserved+p_quantity>greatest(1,floor((p_stock+reserved)*cfg.max_reserved_percent/100.0)) then raise exception 'CHECKOUT_GLOBAL_RESERVATION_LIMIT'; end if;
end $$;

create function public.prepare_checkout_payment_report(p_buyer_id uuid,p_order_id uuid,p_operation_key uuid,p_sha256 text,p_mime text,p_bytes integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op public.checkout_operations%rowtype; report public.checkout_payment_reports%rowtype; cfg public.checkout_reservation_policy%rowtype; cap integer; path text;
begin
 if p_buyer_id is null or p_operation_key is null then raise exception 'CHECKOUT_UNAUTHORIZED'; end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_mime is null or p_mime not in ('application/pdf','image/png','image/jpeg') or p_bytes is null or p_bytes not between 1 and 5242880 then raise exception 'CHECKOUT_INVALID_PROOF'; end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout-buyer:'||p_buyer_id::text,0));
 -- Ownership checked before locking orders: foreign identifiers disclose nothing.
 select * into op from public.checkout_operations where order_id=p_order_id and buyer_id=p_buyer_id;
 if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 perform 1 from public.orders where id=p_order_id for update;
 select * into op from public.checkout_operations where order_id=p_order_id for update;
 select * into report from public.checkout_payment_reports where order_id=p_order_id;
 if found then
  if report.operation_key<>p_operation_key or report.sha256<>p_sha256 or report.mime_type<>p_mime or report.bytes<>p_bytes then raise exception 'CHECKOUT_IDEMPOTENCY_CONFLICT'; end if;
  if report.status<>'uploading' then return jsonb_build_object('path',report.object_path,'status',report.status); end if;
 end if;
 if op.state<>'pending' or clock_timestamp()>=op.expires_at then raise exception 'CHECKOUT_EXPIRED'; end if;
 if op.result->>'paymentMethod'<>'transfer' then raise exception 'CHECKOUT_INVALID_REQUEST'; end if;
 select * into cfg from public.checkout_reservation_policy where id;
 select max_reports into cap from public.checkout_buyer_exceptions where buyer_id=p_buyer_id and expires_at>clock_timestamp();
 cap:=coalesce(cap,cfg.max_reports);
 if (select count(*) from public.checkout_payment_reports r join public.checkout_operations o on o.order_id=r.order_id where r.buyer_id=p_buyer_id and o.state='pending' and r.status in ('uploading','pending') and r.order_id<>p_order_id)>=cap then raise exception 'CHECKOUT_REPORT_LIMIT'; end if;
 if cap=cfg.max_reports and (select count(*) from public.checkout_payment_reports where buyer_id=p_buyer_id and status='rejected' and reviewed_at>clock_timestamp()-interval '7 days')>=cfg.max_rejections_week then raise exception 'CHECKOUT_REVIEW_REQUIRED'; end if;
 path:=p_order_id::text||'/'||p_operation_key::text||case p_mime when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end;
 insert into public.checkout_payment_reports(order_id,buyer_id,operation_key,object_path,sha256,mime_type,bytes) values(p_order_id,p_buyer_id,p_operation_key,path,p_sha256,p_mime,p_bytes) on conflict(order_id) do nothing;
 insert into public.checkout_audit(order_id,actor_id,event,details) select p_order_id,p_buyer_id,'proof_prepared',jsonb_build_object('sha256',p_sha256,'bytes',p_bytes) where not exists(select 1 from public.checkout_audit where order_id=p_order_id and event='proof_prepared');
 return jsonb_build_object('path',path,'status','uploading');
end $$;
create function public.submit_checkout_payment_report(p_buyer_id uuid,p_order_id uuid,p_operation_key uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op public.checkout_operations%rowtype; report public.checkout_payment_reports%rowtype;
begin
 if p_buyer_id is null then raise exception 'CHECKOUT_UNAUTHORIZED'; end if;
 perform 1 from public.checkout_operations where order_id=p_order_id and buyer_id=p_buyer_id;
 if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 perform 1 from public.orders where id=p_order_id for update;
 select * into op from public.checkout_operations where order_id=p_order_id for update;
 select * into report from public.checkout_payment_reports where order_id=p_order_id and buyer_id=p_buyer_id and operation_key=p_operation_key for update;
 if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 if report.status<>'uploading' then return jsonb_build_object('status',report.status); end if;
 if op.state<>'pending' or clock_timestamp()>=op.expires_at then raise exception 'CHECKOUT_EXPIRED'; end if;
 if not exists(select 1 from storage.objects where bucket_id='checkout-payment-proofs' and name=report.object_path and (metadata->>'size')::bigint=report.bytes and metadata->>'mimetype'=report.mime_type) then raise exception 'CHECKOUT_PROOF_REQUIRED'; end if;
 update public.checkout_payment_reports set status='pending',reported_at=clock_timestamp() where order_id=p_order_id;
 insert into public.checkout_audit(order_id,actor_id,event,details) values(p_order_id,p_buyer_id,'payment_reported',jsonb_build_object('proof',report.object_path,'sha256',report.sha256));
 return jsonb_build_object('status','pending');
end $$;
create function public.reject_checkout_payment_report(p_order_id uuid,p_admin_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare report public.checkout_payment_reports%rowtype; buyer uuid;
begin
 if p_admin_id is null then raise exception 'CHECKOUT_MANUAL_UNAUTHORIZED'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 5 and 500 then raise exception 'CHECKOUT_REJECTION_REASON_REQUIRED'; end if;
 select buyer_id into buyer from public.checkout_operations where order_id=p_order_id;
 if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout-buyer:'||buyer::text,0));
 perform 1 from public.orders where id=p_order_id for update;
 select * into report from public.checkout_payment_reports where order_id=p_order_id for update;
 if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 if report.status='rejected' and report.reviewed_by=p_admin_id and report.rejection_reason=btrim(p_reason) then return jsonb_build_object('status','rejected'); end if;
 if report.status<>'pending' then raise exception 'CHECKOUT_INVALID_TRANSITION'; end if;
 update public.checkout_payment_reports set status='rejected',reviewed_at=clock_timestamp(),reviewed_by=p_admin_id,rejection_reason=btrim(p_reason) where order_id=p_order_id;
 perform public.transition_checkout_atomic(p_order_id,'cancelled');
 insert into public.checkout_audit(order_id,actor_id,event,details) values(p_order_id,p_admin_id,'payment_rejected',jsonb_build_object('reason',btrim(p_reason)));
 return jsonb_build_object('status','rejected');
end $$;
create function public.set_checkout_buyer_exception(p_buyer_id uuid,p_admin_id uuid,p_hours integer,p_pending integer,p_units integer,p_product_units integer,p_reports integer,p_reason text)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_buyer_id is null or p_admin_id is null or p_hours is null or p_hours not between 1 and 24 or p_reason is null or length(btrim(p_reason)) not between 5 and 500 then raise exception 'CHECKOUT_INVALID_EXCEPTION'; end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout-buyer:'||p_buyer_id::text,0));
 insert into public.checkout_buyer_exceptions values(p_buyer_id,clock_timestamp()+make_interval(hours=>p_hours),p_pending,p_units,p_product_units,p_reports,btrim(p_reason),p_admin_id)
 on conflict(buyer_id) do update set expires_at=excluded.expires_at,max_pending=excluded.max_pending,max_units=excluded.max_units,max_product_units=excluded.max_product_units,max_reports=excluded.max_reports,reason=excluded.reason,admin_id=excluded.admin_id;
 insert into public.checkout_audit(actor_id,event,details) values(p_admin_id,'buyer_exception',jsonb_build_object('buyerId',p_buyer_id,'hours',p_hours,'pending',p_pending,'units',p_units,'productUnits',p_product_units,'reports',p_reports,'reason',btrim(p_reason)));
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

create or replace function public.transition_checkout_atomic(p_order_id uuid, p_target text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op public.checkout_operations%rowtype; movement record; current_stock integer;
begin
  if p_target not in ('expired','cancelled','confirmed') or p_target is null then raise exception 'CHECKOUT_INVALID_TRANSITION'; end if;
  perform 1 from public.orders where id=p_order_id for update;
  select * into op from public.checkout_operations where order_id=p_order_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if op.state=p_target then return op.result || jsonb_build_object('state',op.state); end if;
  if op.state <> 'pending' then raise exception 'CHECKOUT_INVALID_TRANSITION'; end if;
  if p_target in ('expired','cancelled') and (
    exists(select 1 from public.orders where id=p_order_id and payment_status='paid')
    or exists(select 1 from public.order_payments where order_id=p_order_id and status='approved')
    or exists(select 1 from public.checkout_manual_payments where order_id=p_order_id)
  ) then raise exception 'CHECKOUT_PAID_RESERVATION_PROTECTED'; end if;
  if p_target in ('expired','cancelled') and exists(select 1 from public.checkout_payment_reports where order_id=p_order_id and status='pending') then raise exception 'CHECKOUT_PAYMENT_REPORT_PROTECTED'; end if;
  if p_target='expired' and clock_timestamp() < op.expires_at then raise exception 'CHECKOUT_NOT_EXPIRED'; end if;
  if p_target='confirmed' and clock_timestamp() >= op.expires_at and not exists(select 1 from public.checkout_payment_reports where order_id=p_order_id and status='pending' and reported_at<op.expires_at) then raise exception 'CHECKOUT_EXPIRED'; end if;
  perform 1 from public.products where id in (select product_id from public.order_items where order_id=p_order_id) order by id for update;
  -- Recheck after waits: a blocked confirmation cannot outlive its reservation.
  if p_target='confirmed' and clock_timestamp() >= op.expires_at and not exists(select 1 from public.checkout_payment_reports where order_id=p_order_id and status='pending' and reported_at<op.expires_at) then raise exception 'CHECKOUT_EXPIRED'; end if;
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
  insert into public.checkout_audit(order_id,event,details) values(p_order_id,'reservation_'||p_target,jsonb_build_object('state',p_target));
  return op.result || jsonb_build_object('state',p_target);
end $$;

create or replace function public.expire_checkout_reservations(p_limit integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare candidate record; released integer:=0; failures jsonb:='[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'CHECKOUT_INVALID_BATCH_LIMIT'; end if;
  for candidate in select o.id from public.orders o join public.checkout_operations op on op.order_id=o.id
    where op.state='pending' and op.expires_at<=clock_timestamp()
      and not exists(select 1 from public.checkout_payment_reports r where r.order_id=o.id and r.status='pending')
      and o.payment_status<>'paid'
      and not exists(select 1 from public.order_payments p where p.order_id=o.id and p.status='approved')
      and not exists(select 1 from public.checkout_manual_payments m where m.order_id=o.id)
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

create or replace function public.confirm_checkout_manual_payment(p_order_id uuid,p_operation_key uuid,p_admin_id uuid,p_amount numeric,p_reference text)
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
  if ord.payment_method<>'transfer' then raise exception 'CHECKOUT_MANUAL_METHOD_INVALID'; end if;
  if p_amount is null or p_amount<=0 or p_amount is distinct from ord.total then raise exception 'CHECKOUT_MANUAL_AMOUNT_MISMATCH'; end if;
  if ord.payment_method='transfer' and reference is null then raise exception 'CHECKOUT_MANUAL_REFERENCE_REQUIRED'; end if;
  if length(reference)>200 then raise exception 'CHECKOUT_MANUAL_REFERENCE_INVALID'; end if;
  if op.state<>'pending' then raise exception 'CHECKOUT_INVALID_TRANSITION'; end if;
  insert into public.checkout_manual_payments(order_id,operation_key,admin_id,payment_method,amount,external_reference)
    values(p_order_id,p_operation_key,p_admin_id,ord.payment_method,p_amount,reference);
  perform public.transition_checkout_atomic(p_order_id,'confirmed');
  payment_result:=public.record_order_payment(p_order_id,ord.payment_method,p_amount,'approved','manual-checkout:' || p_operation_key::text,
    'Manual payment verified by authorized administrator',clock_timestamp(),false);
  update public.checkout_payment_reports set status='accepted',reviewed_at=clock_timestamp(),reviewed_by=p_admin_id where order_id=p_order_id and status='pending';
  insert into public.checkout_audit(order_id,actor_id,event,details) values(p_order_id,p_admin_id,'payment_confirmed',jsonb_build_object('amount',p_amount,'operationKey',p_operation_key));
  update public.checkout_manual_payments set result=payment_result || jsonb_build_object('checkout_state','confirmed','verified_by',p_admin_id) where order_id=p_order_id;
  return payment_result || jsonb_build_object('checkout_state','confirmed','verified_by',p_admin_id);
end $$;
-- All RPCs use a trusted server identity; buyer/admin sessions never execute directly.
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('enforce_checkout_limits','enforce_checkout_product_limit','prepare_checkout_payment_report','submit_checkout_payment_report','reject_checkout_payment_report','set_checkout_buyer_exception','create_checkout_atomic','transition_checkout_atomic','expire_checkout_reservations','confirm_checkout_manual_payment') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
