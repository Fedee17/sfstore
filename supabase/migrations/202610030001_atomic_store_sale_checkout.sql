create or replace function create_store_sale_atomic(
  p_idempotency_key uuid,
  p_created_by uuid,
  p_customer_name text,
  p_notes text,
  p_items jsonb,
  p_payments jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_existing public.orders%rowtype;
  v_sale jsonb;
  v_payment_result jsonb;
  v_inventory jsonb := null;
  v_payment_entry record;
  v_order_id uuid;
  v_payment_method text;
  v_payment_amount numeric;
  v_payment_status text := 'pending';
  v_total_paid numeric(12, 2) := 0;
  v_remaining_amount numeric(12, 2) := 0;
  v_request_fingerprint text;
begin
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_IDEMPOTENCY_REQUIRED';
  end if;

  if p_created_by is null then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_ACTOR_REQUIRED';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_NO_ITEMS';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_PAYMENT_INVALID';
  end if;

  for v_payment_entry in
    select value, ordinality
    from jsonb_array_elements(p_payments) with ordinality
  loop
    if jsonb_typeof(v_payment_entry.value) <> 'object'
       or jsonb_typeof(v_payment_entry.value -> 'amount') is distinct from 'number' then
      raise exception using errcode = 'P0001', message = 'STORE_SALE_PAYMENT_INVALID';
    end if;

    v_payment_method := v_payment_entry.value ->> 'method';
    v_payment_amount := (v_payment_entry.value ->> 'amount')::numeric;

    if v_payment_method is null
       or v_payment_method not in ('cash', 'transfer', 'card', 'other')
       or v_payment_amount <= 0
       or v_payment_amount > 9999999999.99
       or v_payment_amount <> round(v_payment_amount, 2) then
      raise exception using errcode = 'P0001', message = 'STORE_SALE_PAYMENT_INVALID';
    end if;
  end loop;

  if jsonb_typeof(p_items) = 'array' and exists (
    select 1
    from jsonb_array_elements(p_items) item
    join public.products product on product.id::text = (item ->> 'product_id')
    where product.historical_identity
  ) then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_PRODUCT_HISTORICAL';
  end if;

  v_request_fingerprint := md5(jsonb_build_object(
    'customer_name', nullif(btrim(p_customer_name), ''),
    'notes', nullif(btrim(p_notes), ''),
    'items', p_items,
    'payments', p_payments
  )::text);

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select *
    into v_existing
  from public.orders
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.channel <> 'store'
       or v_existing.historical_import
       or v_existing.metadata ->> 'store_sale_request_fingerprint'
          is distinct from v_request_fingerprint then
      raise exception using errcode = 'P0001', message = 'STORE_SALE_IDEMPOTENCY_CONFLICT';
    end if;

    select coalesce(sum(amount), 0)::numeric(12, 2)
      into v_total_paid
    from public.order_payments
    where order_id = v_existing.id
      and status = 'approved';

    v_payment_status := v_existing.payment_status;
    v_remaining_amount := greatest(v_existing.total - v_total_paid, 0)::numeric(12, 2);

    if v_payment_status = 'paid' then
      select public.complete_store_sale(v_existing.id, p_created_by) -> 'inventory'
        into v_inventory;
    end if;

    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'operation', 'already_created',
      'total', v_existing.total,
      'total_paid', v_total_paid,
      'remaining_amount', v_remaining_amount,
      'payment_status', v_payment_status,
      'inventory', v_inventory
    );
  end if;

  -- Lock products exclusively in a stable order before the legacy creator takes
  -- its shared locks. This avoids lock-upgrade deadlocks between paid checkouts
  -- and makes the later stock check/deduction serialize per product.
  perform product.id
  from public.products product
  join jsonb_to_recordset(p_items) as item(product_id uuid)
    on product.id = item.product_id
  order by product.id
  for update of product;

  select public.create_store_sale(
    p_idempotency_key,
    p_created_by,
    p_customer_name,
    p_notes,
    p_items
  ) into v_sale;

  v_order_id := (v_sale ->> 'order_id')::uuid;
  v_remaining_amount := (v_sale ->> 'total')::numeric(12, 2);

  update public.orders
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'store_sale_request_fingerprint', v_request_fingerprint
  )
  where id = v_order_id;

  for v_payment_entry in
    select value, ordinality
    from jsonb_array_elements(p_payments) with ordinality
    order by ordinality
  loop
    v_payment_method := v_payment_entry.value ->> 'method';
    v_payment_amount := (v_payment_entry.value ->> 'amount')::numeric;

    select public.record_order_payment(
      v_order_id,
      v_payment_method,
      v_payment_amount,
      'approved',
      format('store:%s:payment:%s', p_idempotency_key, v_payment_entry.ordinality),
      null,
      null,
      false
    ) into v_payment_result;

    v_total_paid := (v_payment_result ->> 'total_paid')::numeric(12, 2);
    v_remaining_amount := (v_payment_result ->> 'remaining_amount')::numeric(12, 2);
    v_payment_status := v_payment_result ->> 'payment_status';
  end loop;

  if v_payment_status = 'paid' then
    select public.complete_store_sale(v_order_id, p_created_by) -> 'inventory'
      into v_inventory;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_sale ->> 'order_number',
    'operation', 'created',
    'total', (v_sale ->> 'total')::numeric(12, 2),
    'total_paid', v_total_paid,
    'remaining_amount', v_remaining_amount,
    'payment_status', v_payment_status,
    'inventory', v_inventory
  );
end;
$$;

create or replace function record_store_sale_payment_atomic(
  p_order_id uuid,
  p_created_by uuid,
  p_method text,
  p_amount numeric,
  p_reference text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_existing_payment public.order_payments%rowtype;
  v_reference text := nullif(btrim(p_reference), '');
  v_payment_result jsonb;
  v_inventory jsonb := null;
  v_reference_count integer;
begin
  if p_order_id is null or p_created_by is null then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_NOT_FOUND';
  end if;

  if p_method is null
     or p_method not in ('cash', 'transfer', 'card', 'other')
     or p_amount is null
     or p_amount <= 0
     or p_amount > 9999999999.99
     or p_amount <> round(p_amount, 2)
     or v_reference is null then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_PAYMENT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));

  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_order.channel <> 'store' or v_order.historical_import then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_NOT_FOUND';
  end if;

  -- Serialize the idempotency reference even when two requests target
  -- different orders. The table's (method, reference) unique index remains the
  -- final database constraint for callers of the lower-level legacy RPC.
  perform pg_advisory_xact_lock(hashtextextended(v_reference, 0));

  select count(*)
    into v_reference_count
  from public.order_payments
  where reference = v_reference;

  if v_reference_count > 1 then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_PAYMENT_REFERENCE_CONFLICT';
  end if;

  select *
    into v_existing_payment
  from public.order_payments
  where reference = v_reference
  limit 1
  for update;

  if found and (
    v_existing_payment.order_id <> p_order_id
    or v_existing_payment.method <> p_method
    or v_existing_payment.amount <> round(p_amount, 2)
    or v_existing_payment.status <> 'approved'
  ) then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_PAYMENT_REFERENCE_CONFLICT';
  end if;

  select public.record_order_payment(
    p_order_id,
    p_method,
    p_amount,
    'approved',
    v_reference,
    null,
    null,
    false
  ) into v_payment_result;

  if v_payment_result ->> 'payment_status' = 'paid' then
    select public.complete_store_sale(p_order_id, p_created_by) -> 'inventory'
      into v_inventory;
  end if;

  return v_payment_result || jsonb_build_object('inventory', v_inventory);
end;
$$;

revoke all on function create_store_sale_atomic(uuid, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function create_store_sale_atomic(uuid, uuid, text, text, jsonb, jsonb)
  to service_role;

revoke all on function record_store_sale_payment_atomic(uuid, uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function record_store_sale_payment_atomic(uuid, uuid, text, numeric, text)
  to service_role;

comment on function create_store_sale_atomic(uuid, uuid, text, text, jsonb, jsonb) is
  'Atomically creates an idempotent store sale, its items and initial payments, applying inventory only when fully paid.';
comment on function record_store_sale_payment_atomic(uuid, uuid, text, numeric, text) is
  'Atomically records an idempotent store-sale payment and applies inventory when that payment completes the sale.';
