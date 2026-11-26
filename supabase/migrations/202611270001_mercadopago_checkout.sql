-- Mercado Pago for web orders, prepared 25/11 and adapted 26/11/2026 to the stored cash prices of 202611260001.
-- Disabled by default (checkout_payment_settings.mercadopago_enabled = false) and also gated by server environment.
-- 1) Web checkout accepts paymentMethod 'mercadopago' and an optional priceMode: 'contado' (default; the stored cash
--    price, one payment, Checkout Pro) or 'financiado' (list price, 2-3 credit card installments, Checkout API).
-- 2) A Mercado Pago payment confirms the order only if amount, installments, method and reservation match the
--    stored order; anything else is kept for review. Confirmation reuses the reservation, transition and ledger.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.checkout_payment_settings (
  id boolean primary key default true check (id),
  mercadopago_enabled boolean not null default false,
  -- Installments stay off until SFSTORE finances them: today Mercado Pago adds interest over the list price.
  mercadopago_installments_enabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.checkout_payment_settings default values;
alter table public.checkout_payment_settings enable row level security;
comment on table public.checkout_payment_settings is
  'Single row. mercadopago_enabled only with approved production credentials and costs; mercadopago_installments_enabled only once the account finances 2-3 installments without buyer interest.';

create function public.mercadopago_payments_enabled() returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce((select mercadopago_enabled from public.checkout_payment_settings where id), false)
$$;

create function public.mercadopago_installments_enabled() returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce((select mercadopago_enabled and mercadopago_installments_enabled from public.checkout_payment_settings where id), false)
$$;

-- provider_payment_id: Checkout Pro payment id (digits) or Orders API order id (ORD…/ORDTST…).
-- A 'review' row is money Mercado Pago charged that did not confirm the order. review_kind says what it needs:
-- 'refund' (duplicate, expired, cancelled or unknown order: the store cannot keep it) or 'review' (mismatch to inspect).
-- Nothing is refunded automatically; an administrator records the outcome in resolved_at/resolution.
create table public.checkout_mercadopago_payments (
  provider_payment_id text primary key check (provider_payment_id ~ '^([0-9]{1,20}|ORD[A-Z0-9]{8,60})$'),
  order_id uuid references public.orders(id) on delete restrict,
  status text not null check (status in ('approved', 'review')),
  review_kind text check (review_kind in ('refund', 'review')),
  price_mode text check (price_mode in ('contado', 'financiado')),
  method text check (length(method) between 1 and 40),
  installments integer check (installments between 1 and 36),
  amount numeric(12,2) check (amount > 0),
  reason text check (length(reason) <= 300),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text check (length(resolution) between 3 and 300),
  check (status = 'review' or (order_id is not null and reason is null and amount is not null and installments is not null and price_mode is not null and review_kind is null)),
  check (status = 'approved' or review_kind is not null),
  check ((resolved_at is null) = (resolution is null) and (resolved_at is null or status = 'review'))
);
create unique index checkout_mercadopago_one_approved on public.checkout_mercadopago_payments(order_id) where status = 'approved';
create index checkout_mercadopago_open_reviews on public.checkout_mercadopago_payments(created_at) where status = 'review' and resolved_at is null;
alter table public.checkout_mercadopago_payments enable row level security;

-- Checkout Pro links created for an order. One open link per order is reused, and every link is expired in
-- Mercado Pago once the order is paid, so a paid order cannot be paid again from a link SFSTORE handed out.
create table public.checkout_mercadopago_preferences (
  preference_id text primary key check (preference_id ~ '^[0-9]{1,20}-[0-9a-f-]{36}$'),
  order_id uuid not null references public.orders(id) on delete restrict,
  init_point text not null check (init_point ~ '^https://'),
  created_at timestamptz not null default clock_timestamp(),
  expired_at timestamptz
);
create unique index checkout_mercadopago_one_open_preference on public.checkout_mercadopago_preferences(order_id) where expired_at is null;
alter table public.checkout_mercadopago_preferences enable row level security;

create or replace function pg_temp.patch_once(source text, anchor text, replacement text) returns text language plpgsql as $$
begin
  if source is null or position(anchor in source) = 0
    or (length(source) - length(replace(source, anchor, ''))) <> length(anchor) then
    raise exception 'MERCADOPAGO_BASE_CONTRACT_CHANGED: %', left(anchor, 80);
  end if;
  return replace(source, anchor, replacement);
end $$;

do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.create_checkout_atomic(uuid,uuid,jsonb)'::regprocedure);
  definition := pg_temp.patch_once(definition,
    $a$(p_request - array['customer','shipping','paymentMethod','items']) <> '{}'::jsonb$a$,
    $a$(p_request - array['customer','shipping','paymentMethod','priceMode','items']) <> '{}'::jsonb$a$);
  definition := pg_temp.patch_once(definition,
    $a$or coalesce(p_request->>'paymentMethod','') <> 'transfer'$a$,
    $a$or coalesce(p_request->>'paymentMethod','') not in ('transfer','mercadopago')
    or (p_request ? 'priceMode' and coalesce(p_request->>'priceMode','') not in ('contado','financiado'))
    or (p_request->>'priceMode' = 'financiado' and p_request->>'paymentMethod' <> 'mercadopago')$a$);
  definition := pg_temp.patch_once(definition,
    $a$fee := (delivery->>'fee')::numeric;$a$,
    $a$-- Mercado Pago only when enabled (installments need their own switch); manually quoted shipping stays transfer-only.
  if p_request->>'paymentMethod' = 'mercadopago' and (not public.mercadopago_payments_enabled() or approved.id is not null
    or (p_request->>'priceMode' = 'financiado' and not public.mercadopago_installments_enabled()))
  then raise exception 'CHECKOUT_PAYMENT_METHOD_DISABLED'; end if;
  fee := (delivery->>'fee')::numeric;$a$);
  definition := pg_temp.patch_once(definition,
    $a$priced_lines:=public.resolve_commercial_lines(normalized->'items',true,'web');$a$,
    $a$priced_lines:=public.resolve_commercial_lines(normalized->'items',coalesce(normalized->>'priceMode','contado')='contado','web');$a$);
  definition := pg_temp.patch_once(definition,
    $a$'price_policy','manual_25_frozen','discount_percent',25,$a$,
    $a$'price_policy','manual_25_frozen','discount_percent',25,'price_mode',coalesce(p_request->>'priceMode','contado'),$a$);
  definition := pg_temp.patch_once(definition,
    $a$result := jsonb_build_object('paymentMethod',p_request->>'paymentMethod','id',order_id,$a$,
    $a$result := jsonb_build_object('paymentMethod',p_request->>'paymentMethod','priceMode',coalesce(p_request->>'priceMode','contado'),'id',order_id,$a$);
  execute definition;

  definition := pg_get_functiondef('public.transition_checkout_atomic(uuid,text)'::regprocedure);
  definition := pg_temp.patch_once(definition,
    $a$or exists(select 1 from public.checkout_manual_payments where order_id=p_order_id)$a$,
    $a$or exists(select 1 from public.checkout_manual_payments where order_id=p_order_id)
    or exists(select 1 from public.checkout_mercadopago_payments where order_id=p_order_id)$a$);
  execute definition;

  -- Each checkout order accepts exactly one evidence: the manual receipt or the approved Mercado Pago payment.
  definition := pg_get_functiondef('public.guard_checkout_order()'::regprocedure);
  definition := pg_temp.patch_once(definition,
    $a$and exists(select 1 from public.checkout_manual_payments where order_id=old.id and amount=new.total)$a$,
    $a$and (exists(select 1 from public.checkout_manual_payments where order_id=old.id and amount=new.total)
      or exists(select 1 from public.checkout_mercadopago_payments where order_id=old.id and status='approved' and amount=new.total))$a$);
  execute definition;

  definition := pg_get_functiondef('public.guard_checkout_payment_entry()'::regprocedure);
  definition := pg_temp.patch_once(definition,
    $a$then raise exception 'CHECKOUT_MANUAL_PAYMENT_REQUIRED'; end if;$a$,
    $a$and not exists(select 1 from public.checkout_mercadopago_payments receipt
      join public.checkout_operations op on op.order_id=receipt.order_id
      where receipt.order_id=new.order_id and receipt.status='approved' and new.method='mercadopago'
        and receipt.amount=new.amount and new.status='approved' and op.state='confirmed'
        and new.reference='mercadopago:' || receipt.provider_payment_id)
  then raise exception 'CHECKOUT_MANUAL_PAYMENT_REQUIRED'; end if;$a$);
  execute definition;
end;
$migration$;

-- Order data needed to start a Mercado Pago payment: only the buyer's own pending, unexpired Mercado Pago order.
create function public.checkout_mercadopago_order(p_buyer_id uuid, p_order_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare ord public.orders%rowtype; op public.checkout_operations%rowtype;
begin
  if not public.mercadopago_payments_enabled() then raise exception 'CHECKOUT_PAYMENT_METHOD_DISABLED'; end if;
  select * into op from public.checkout_operations where order_id=p_order_id and buyer_id=p_buyer_id;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into ord from public.orders where id=p_order_id;
  if ord.payment_method is distinct from 'mercadopago' then raise exception 'CHECKOUT_PAYMENT_METHOD_DISABLED'; end if;
  -- A paid order never starts another payment attempt (Mercado Pago itself would accept a second charge).
  if op.state = 'confirmed' or ord.payment_status = 'paid'
    or exists(select 1 from public.checkout_mercadopago_payments where order_id=p_order_id and status='approved')
  then raise exception 'CHECKOUT_ALREADY_PAID'; end if;
  if op.state <> 'pending' or clock_timestamp() >= op.expires_at then raise exception 'CHECKOUT_EXPIRED'; end if;
  if ord.metadata->>'price_mode' = 'financiado' and not public.mercadopago_installments_enabled() then raise exception 'CHECKOUT_PAYMENT_METHOD_DISABLED'; end if;
  return jsonb_build_object('reference', ord.order_number, 'priceMode', coalesce(ord.metadata->>'price_mode','contado'),
    'total', ord.total, 'expiresAt', op.expires_at,
    'preferenceUrl', (select init_point from public.checkout_mercadopago_preferences where order_id=p_order_id and expired_at is null));
end $$;

-- Checkout Pro link bookkeeping (service role only).
create function public.record_checkout_mercadopago_preference(p_order_id uuid, p_preference_id text, p_init_point text) returns void
language sql security invoker set search_path = pg_catalog, public as $$
  insert into public.checkout_mercadopago_preferences(preference_id, order_id, init_point) values(p_preference_id, p_order_id, p_init_point)
$$;

create function public.open_checkout_mercadopago_preferences(p_order_id uuid) returns setof text
language sql stable security invoker set search_path = pg_catalog, public as $$
  select preference_id from public.checkout_mercadopago_preferences where order_id=p_order_id and expired_at is null order by created_at
$$;

create function public.expire_checkout_mercadopago_preference(p_preference_id text) returns void
language sql security invoker set search_path = pg_catalog, public as $$
  update public.checkout_mercadopago_preferences set expired_at=clock_timestamp() where preference_id=p_preference_id and expired_at is null
$$;

-- Stored order data for a notified payment (webhook): service role only, never exposed to the browser.
create function public.checkout_mercadopago_order_by_reference(p_reference text) returns jsonb
language sql stable security invoker set search_path = pg_catalog, public as $$
  select jsonb_build_object('reference', o.order_number, 'priceMode', coalesce(o.metadata->>'price_mode','contado'),
    'total', o.total, 'expiresAt', op.expires_at)
  from public.orders o join public.checkout_operations op on op.order_id=o.id
  where o.order_number=p_reference and o.channel='web' and o.payment_method='mercadopago'
$$;

-- Idempotent per Mercado Pago payment/order id. Re-validates everything against the stored order and reservation.
-- A charge that cannot confirm the order (second payment, expired reservation, mismatch) is kept for an administrator:
-- the order, its stock and its sale are never touched a second time.
create function public.confirm_checkout_mercadopago_payment(p_provider_payment_id text, p_reference text, p_amount numeric,
  p_installments integer, p_method text, p_currency text) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare ord public.orders%rowtype; op public.checkout_operations%rowtype; existing public.checkout_mercadopago_payments%rowtype;
  mode text; reason text; kind text; payment_result jsonb;
begin
  if coalesce(p_provider_payment_id,'') !~ '^([0-9]{1,20}|ORD[A-Z0-9]{8,60})$' then raise exception 'MERCADOPAGO_PAYMENT_INVALID'; end if;
  if not public.mercadopago_payments_enabled() then raise exception 'CHECKOUT_PAYMENT_METHOD_DISABLED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mercadopago-payment:' || p_provider_payment_id, 0));
  select * into existing from public.checkout_mercadopago_payments where provider_payment_id=p_provider_payment_id;
  if found then return jsonb_build_object('status', existing.status, 'orderId', existing.order_id, 'replayed', true); end if;
  select * into ord from public.orders where order_number=p_reference and channel='web' for update;
  if not found then
    insert into public.checkout_mercadopago_payments(provider_payment_id,status,review_kind,method,installments,amount,reason)
      values(p_provider_payment_id,'review','refund',left(p_method,40),p_installments,nullif(greatest(coalesce(p_amount,0),0),0),'Pago aprobado sin pedido asociado.');
    return jsonb_build_object('status','review','reason','Pago aprobado sin pedido asociado.');
  end if;
  select * into op from public.checkout_operations where order_id=ord.id for update;
  mode := coalesce(ord.metadata->>'price_mode','contado');
  -- Order matters: a second charge on a paid order is a refund even if its amount also differs.
  -- The order cannot accept this charge at all: it needs a refund decision.
  reason := case
    when not found or ord.payment_method is distinct from 'mercadopago' then 'El pedido no se paga con Mercado Pago.'
    when exists(select 1 from public.checkout_mercadopago_payments where order_id=ord.id and status='approved') or op.state='confirmed' then 'Pago duplicado: el pedido ya estaba pagado.'
    when op.state <> 'pending' then 'El pedido ya no está pendiente.'
    when clock_timestamp() >= op.expires_at then 'La reserva venció antes de confirmar el pago.'
  end;
  kind := case when reason is not null then 'refund' end;
  -- The order is still payable but the charge does not match it: someone must inspect it.
  if reason is null then
    reason := case
      when p_currency is distinct from 'ARS' then 'Moneda no admitida.'
      when p_amount is null or p_amount <> ord.total then 'El importe no coincide con el total del pedido.'
      when mode='contado' and (p_installments is distinct from 1 or p_method not in ('account_money','debit_card','credit_card')) then 'El medio o las cuotas no corresponden al precio de contado.'
      when mode='financiado' and (p_method is distinct from 'credit_card' or p_installments is null or p_installments not between 2 and 3) then 'El medio o las cuotas no corresponden al precio de lista.'
    end;
    kind := case when reason is not null then 'review' end;
  end if;
  if reason is not null then
    insert into public.checkout_mercadopago_payments(provider_payment_id,order_id,status,review_kind,price_mode,method,installments,amount,reason)
      values(p_provider_payment_id,ord.id,'review',kind,mode,left(p_method,40),p_installments,nullif(greatest(coalesce(p_amount,0),0),0),reason);
    insert into public.checkout_audit(order_id,event,details) values(ord.id,'mercadopago_payment_review',jsonb_build_object('paymentId',p_provider_payment_id,'reason',reason,'kind',kind));
    return jsonb_build_object('status','review','orderId',ord.id,'reason',reason,'kind',kind);
  end if;
  insert into public.checkout_mercadopago_payments(provider_payment_id,order_id,status,price_mode,method,installments,amount)
    values(p_provider_payment_id,ord.id,'approved',mode,p_method,p_installments,p_amount);
  perform public.transition_checkout_atomic(ord.id,'confirmed');
  payment_result := public.record_order_payment(ord.id,'mercadopago',p_amount,'approved','mercadopago:' || p_provider_payment_id,
    'Mercado Pago, ' || p_method || ', ' || p_installments || ' cuota(s)', clock_timestamp(), false);
  insert into public.checkout_audit(order_id,event,details) values(ord.id,'payment_confirmed',jsonb_build_object('amount',p_amount,'paymentId',p_provider_payment_id,'installments',p_installments));
  return payment_result || jsonb_build_object('status','approved','checkout_state','confirmed','orderId',ord.id);
end $$;

-- An approved charge that could not be read as a valid payment for its order (unknown method, several transactions…).
create function public.review_checkout_mercadopago_payment(p_provider_payment_id text, p_reference text, p_reason text, p_amount numeric) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare target uuid;
begin
  if coalesce(p_provider_payment_id,'') !~ '^([0-9]{1,20}|ORD[A-Z0-9]{8,60})$' then raise exception 'MERCADOPAGO_PAYMENT_INVALID'; end if;
  select id into target from public.orders where order_number=p_reference and channel='web';
  -- p_amount: what Mercado Pago charged (null when unreadable), shown to the administrator for the refund decision.
  insert into public.checkout_mercadopago_payments(provider_payment_id,order_id,status,review_kind,reason,amount)
    values(p_provider_payment_id,target,'review','review',left(coalesce(nullif(trim(p_reason),''),'Pago no coincidente.'),300),
      case when p_amount > 0 then round(p_amount,2) end)
    on conflict (provider_payment_id) do nothing;
  return jsonb_build_object('status','review','orderId',target);
end $$;

-- Administrator closes a reviewed charge after acting in Mercado Pago (refund or other decision). Records only:
-- it never refunds, confirms the order or moves stock.
create function public.resolve_checkout_mercadopago_review(p_provider_payment_id text, p_admin_id uuid, p_resolution text) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare row public.checkout_mercadopago_payments%rowtype;
begin
  if p_admin_id is null or length(trim(coalesce(p_resolution,''))) not between 3 and 300 then raise exception 'MERCADOPAGO_REVIEW_INVALID'; end if;
  update public.checkout_mercadopago_payments set resolved_at=clock_timestamp(), resolved_by=p_admin_id, resolution=trim(p_resolution)
    where provider_payment_id=p_provider_payment_id and status='review' and resolved_at is null returning * into row;
  if not found then raise exception 'MERCADOPAGO_REVIEW_NOT_FOUND'; end if;
  if row.order_id is not null then
    insert into public.checkout_audit(order_id,event,details) values(row.order_id,'mercadopago_review_resolved',jsonb_build_object('paymentId',p_provider_payment_id,'adminId',p_admin_id,'resolution',row.resolution));
  end if;
  return jsonb_build_object('status','resolved','paymentId',p_provider_payment_id);
end $$;

-- Explicit grants (lesson of 202611260002): service role only.
revoke all on table public.checkout_payment_settings, public.checkout_mercadopago_payments, public.checkout_mercadopago_preferences from public, anon, authenticated;
grant select, insert, update on table public.checkout_payment_settings, public.checkout_mercadopago_payments, public.checkout_mercadopago_preferences to service_role;
revoke all on function public.mercadopago_payments_enabled(), public.mercadopago_installments_enabled(), public.checkout_mercadopago_order(uuid,uuid),
  public.checkout_mercadopago_order_by_reference(text), public.confirm_checkout_mercadopago_payment(text,text,numeric,integer,text,text),
  public.review_checkout_mercadopago_payment(text,text,text,numeric), public.resolve_checkout_mercadopago_review(text,uuid,text),
  public.record_checkout_mercadopago_preference(uuid,text,text), public.open_checkout_mercadopago_preferences(uuid),
  public.expire_checkout_mercadopago_preference(text) from public, anon, authenticated;
grant execute on function public.mercadopago_payments_enabled(), public.mercadopago_installments_enabled(), public.checkout_mercadopago_order(uuid,uuid),
  public.checkout_mercadopago_order_by_reference(text), public.confirm_checkout_mercadopago_payment(text,text,numeric,integer,text,text),
  public.review_checkout_mercadopago_payment(text,text,text,numeric), public.resolve_checkout_mercadopago_review(text,uuid,text),
  public.record_checkout_mercadopago_preference(uuid,text,text), public.open_checkout_mercadopago_preferences(uuid),
  public.expire_checkout_mercadopago_preference(text) to service_role;
commit;
