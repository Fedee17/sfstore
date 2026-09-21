alter table orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists estimated_date date,
  add column if not exists delivered_at timestamptz;

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (
  status in (
    'pending', 'confirmed', 'paid', 'preparing', 'shipped', 'completed',
    'ordered', 'ready', 'delivered', 'cancelled'
  )
);

alter table orders drop constraint if exists orders_store_idempotency_check;
alter table orders add constraint orders_idempotency_channel_check
  check (idempotency_key is null or channel in ('store', 'order'));
alter table orders add constraint orders_order_customer_name_check
  check (channel <> 'order' or nullif(btrim(customer_name), '') is not null);

create index if not exists orders_order_status_idx
  on orders(status, created_at desc) where channel = 'order';
create index if not exists orders_order_estimated_date_idx
  on orders(estimated_date) where channel = 'order' and estimated_date is not null;

create or replace function save_customer_order(
  p_order_id uuid,
  p_idempotency_key uuid,
  p_created_by uuid,
  p_customer_name text,
  p_customer_phone text,
  p_estimated_date date,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_order_id uuid := coalesce(p_order_id, gen_random_uuid());
  v_order_number text;
  v_item_count integer;
  v_distinct_count integer;
  v_locked_count integer := 0;
  v_total numeric(12, 2) := 0;
  v_total_paid numeric(12, 2) := 0;
  v_payment_status text := 'pending';
  v_line record;
  v_operation text;
begin
  if nullif(btrim(p_customer_name), '') is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_CUSTOMER_REQUIRED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_NO_ITEMS';
  end if;

  select count(*), count(distinct product_id) into v_item_count, v_distinct_count
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_price numeric);
  if v_item_count <> v_distinct_count then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_DUPLICATE_PRODUCT';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_price numeric)
    where product_id is null or quantity is null or quantity <= 0
      or quantity <> trunc(quantity) or quantity > 2147483647
      or unit_price is null or unit_price <= 0
  ) then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_ITEM_INVALID';
  end if;

  for v_line in
    select product.id, product.status, item.quantity::integer as quantity,
      round(item.unit_price, 2)::numeric(12, 2) as unit_price
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_price numeric)
    join products product on product.id = item.product_id
    order by product.id for share of product
  loop
    v_locked_count := v_locked_count + 1;
    if v_line.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_PRODUCT_INACTIVE';
    end if;
    v_total := v_total + round(v_line.unit_price * v_line.quantity, 2);
  end loop;
  if v_locked_count <> v_item_count then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_PRODUCT_NOT_FOUND';
  end if;

  if p_order_id is null then
    if p_idempotency_key is null then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_IDEMPOTENCY_REQUIRED';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
    select * into v_order from orders where idempotency_key = p_idempotency_key for update;
    if found then
      if v_order.channel <> 'order' then
        raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_IDEMPOTENCY_CONFLICT';
      end if;
      return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
        'operation', 'already_applied', 'total', v_order.total,
        'payment_status', v_order.payment_status);
    end if;

    v_order_number := 'SF-P-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 6));
    insert into orders (
      id, customer_id, order_number, channel, status, payment_method,
      payment_status, shipping_method, subtotal, discount, shipping_cost,
      total, notes, metadata, idempotency_key, customer_name,
      customer_phone, estimated_date
    ) values (
      v_order_id, null, v_order_number, 'order', 'pending', null,
      'pending', null, v_total, 0, 0, v_total, nullif(btrim(p_notes), ''),
      jsonb_build_object('source', 'sfstore_admin_order', 'created_by', p_created_by),
      p_idempotency_key, btrim(p_customer_name), nullif(btrim(p_customer_phone), ''), p_estimated_date
    );
    v_operation := 'created';
  else
    select * into v_order from orders where id = p_order_id for update;
    if not found or v_order.channel <> 'order' then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_NOT_FOUND';
    end if;
    if v_order.status in ('delivered', 'cancelled') then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_READ_ONLY';
    end if;
    select coalesce(sum(amount), 0)::numeric(12, 2) into v_total_paid
    from order_payments where order_id = p_order_id and status = 'approved';
    if v_total < v_total_paid then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_TOTAL_BELOW_PAID';
    end if;
    if v_total_paid >= v_total and v_total > 0 then
      v_payment_status := 'paid';
    elsif v_total_paid > 0 then
      v_payment_status := 'partial';
    elsif exists (select 1 from order_payments where order_id = p_order_id and status = 'refunded') then
      v_payment_status := 'refunded';
    end if;

    update orders set customer_name = btrim(p_customer_name),
      customer_phone = nullif(btrim(p_customer_phone), ''), estimated_date = p_estimated_date,
      notes = nullif(btrim(p_notes), ''), subtotal = v_total, total = v_total,
      payment_status = v_payment_status where id = p_order_id;
    delete from order_items where order_id = p_order_id;
    v_order_number := v_order.order_number;
    v_operation := 'updated';
  end if;

  insert into order_items (
    order_id, product_id, product_name, product_slug, category_name,
    unit_price, quantity, subtotal
  )
  select v_order_id, product.id, product.name, product.slug, category.name,
    round(item.unit_price, 2), item.quantity::integer,
    round(item.unit_price * item.quantity, 2)
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_price numeric)
  join products product on product.id = item.product_id
  join categories category on category.id = product.category_id
  order by product.id;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
    'operation', v_operation, 'total', v_total, 'payment_status', v_payment_status);
end;
$$;

create or replace function transition_customer_order(
  p_order_id uuid, p_next_status text, p_changed_by uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.channel <> 'order' then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_NOT_FOUND';
  end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_READ_ONLY';
  end if;
  if p_next_status = 'delivered' then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_USE_DELIVERY';
  end if;
  if not (
    (v_order.status = 'pending' and p_next_status in ('ordered', 'cancelled')) or
    (v_order.status = 'ordered' and p_next_status in ('ready', 'cancelled')) or
    (v_order.status = 'ready' and p_next_status = 'cancelled')
  ) then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_TRANSITION_INVALID';
  end if;
  update orders set status = p_next_status,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'last_status_changed_by', p_changed_by, 'last_status_changed_at', now()
    ) where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'status', p_next_status);
end;
$$;

create or replace function deliver_order(p_order_id uuid, p_delivered_by uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_order orders%rowtype; v_inventory jsonb; v_delivered_at timestamptz := now();
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.channel <> 'order' then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_NOT_FOUND';
  end if;
  if v_order.status = 'delivered' then
    return jsonb_build_object('order_id', p_order_id, 'status', 'already_delivered',
      'inventory', jsonb_build_object('status', 'already_applied', 'movements_created', 0));
  end if;
  if v_order.status <> 'ready' then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_NOT_READY';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ORDER_PAYMENT_INCOMPLETE';
  end if;
  select apply_sale_inventory(p_order_id, p_delivered_by) into v_inventory;
  update orders set status = 'delivered', delivered_at = coalesce(delivered_at, v_delivered_at),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'delivered_by', p_delivered_by, 'delivered_at', v_delivered_at
    ) where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'status', 'delivered', 'inventory', v_inventory);
end;
$$;

revoke all on function save_customer_order(uuid, uuid, uuid, text, text, date, text, jsonb)
  from public, anon, authenticated;
grant execute on function save_customer_order(uuid, uuid, uuid, text, text, date, text, jsonb)
  to service_role;
revoke all on function transition_customer_order(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function transition_customer_order(uuid, text, uuid) to service_role;
revoke all on function deliver_order(uuid, uuid) from public, anon, authenticated;
grant execute on function deliver_order(uuid, uuid) to service_role;

comment on function save_customer_order(uuid, uuid, uuid, text, text, date, text, jsonb) is
  'Atomically creates or edits an order-channel customer order without reserving or changing stock.';
comment on function deliver_order(uuid, uuid) is
  'Atomically delivers one paid ready customer order and applies sale inventory once.';
