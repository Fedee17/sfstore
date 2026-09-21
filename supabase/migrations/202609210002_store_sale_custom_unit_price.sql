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
  if v_item_count <> v_distinct_count then
    raise exception using errcode = 'P0001', message = 'STORE_SALE_DUPLICATE_PRODUCT';
  end if;

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
    unit_price, quantity, subtotal
  )
  select
    v_order_id,
    product.id,
    product.name,
    product.slug,
    category.name,
    item.unit_price::numeric(12, 2),
    item.quantity::integer,
    round(item.unit_price * item.quantity, 2)
  from jsonb_to_recordset(p_items)
    as item(product_id uuid, quantity numeric, unit_price numeric)
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

revoke all on function create_store_sale(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function create_store_sale(uuid, uuid, text, text, jsonb)
  to service_role;

comment on function create_store_sale(uuid, uuid, text, text, jsonb) is
  'Atomically creates an idempotent store sale using validated client-agreed unit price snapshots.';
