alter table inventory_movements
  add column if not exists order_item_id uuid references order_items(id) on delete restrict;

create unique index if not exists inventory_movements_sale_order_item_unique
  on inventory_movements(order_item_id)
  where movement_type = 'sale' and order_item_id is not null;

create or replace function apply_sale_inventory(
  p_order_id uuid,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_item_count integer;
  v_unlinked_count integer;
  v_invalid_count integer;
  v_locked_count integer := 0;
  v_movements_created integer := 0;
  v_product record;
  v_item record;
  v_new_stock integer;
  v_applied_at timestamptz := now();
begin
  if p_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'SALE_INVENTORY_ORDER_NOT_FOUND';
  end if;

  select *
    into v_order
  from orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SALE_INVENTORY_ORDER_NOT_FOUND';
  end if;

  if coalesce(v_order.metadata ->> 'stock_decrease_status', '') = 'completed'
     or exists (
       select 1
       from inventory_movements
       where order_id = p_order_id
         and movement_type = 'sale'
     ) then
    if coalesce(v_order.metadata ->> 'stock_decrease_status', '') <> 'completed' then
      update orders
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'stock_decrease_status', 'completed',
        'stock_decreased_at', coalesce(metadata ->> 'stock_decreased_at', v_applied_at::text),
        'stock_decrease_note', 'Movimiento de venta existente detectado.',
        'stock_decrease_error', null
      )
      where id = p_order_id;
    end if;

    return jsonb_build_object(
      'order_id', p_order_id,
      'status', 'already_applied',
      'movements_created', 0
    );
  end if;

  select count(*)
    into v_item_count
  from order_items
  where order_id = p_order_id;

  if v_item_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SALE_INVENTORY_NO_LINES';
  end if;

  select count(*)
    into v_unlinked_count
  from order_items
  where order_id = p_order_id
    and product_id is null;

  if v_unlinked_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SALE_INVENTORY_PRODUCT_MISSING';
  end if;

  select count(*)
    into v_invalid_count
  from order_items
  where order_id = p_order_id
    and quantity <= 0;

  if v_invalid_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SALE_INVENTORY_INVALID_QUANTITY';
  end if;

  for v_product in
    with item_totals as (
      select product_id, sum(quantity)::bigint as quantity
      from order_items
      where order_id = p_order_id
      group by product_id
    )
    select product.id, product.name, product.stock, item_totals.quantity
    from item_totals
    join products product on product.id = item_totals.product_id
    order by product.id
    for update of product
  loop
    v_locked_count := v_locked_count + 1;

    if v_product.quantity > 2147483647 then
      raise exception using
        errcode = 'P0001',
        message = 'SALE_INVENTORY_INVALID_QUANTITY';
    end if;

    if v_product.stock < v_product.quantity then
      raise exception using
        errcode = 'P0001',
        message = format(
          'SALE_INVENTORY_STOCK_INSUFFICIENT:%s:%s:%s',
          v_product.id,
          v_product.stock,
          v_product.quantity
        );
    end if;
  end loop;

  if v_locked_count <> (
    select count(distinct product_id)
    from order_items
    where order_id = p_order_id
      and product_id is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SALE_INVENTORY_PRODUCT_MISSING';
  end if;

  for v_product in
    select product.id, product.stock
    from products product
    where product.id in (
      select distinct product_id
      from order_items
      where order_id = p_order_id
        and product_id is not null
    )
    order by product.id
  loop
    for v_item in
      select id, quantity
      from order_items
      where order_id = p_order_id
        and product_id = v_product.id
      order by id
    loop
      v_new_stock := v_product.stock - v_item.quantity;

      if v_new_stock < 0 then
        raise exception using
          errcode = 'P0001',
          message = 'SALE_INVENTORY_STOCK_INSUFFICIENT';
      end if;

      insert into inventory_movements (
        product_id,
        order_id,
        order_item_id,
        movement_type,
        quantity,
        previous_stock,
        new_stock,
        reason,
        created_by
      ) values (
        v_product.id,
        p_order_id,
        v_item.id,
        'sale',
        v_item.quantity,
        v_product.stock,
        v_new_stock,
        'Venta confirmada',
        p_created_by
      );

      v_product.stock := v_new_stock;
      v_movements_created := v_movements_created + 1;
    end loop;

    update products
    set stock = v_product.stock
    where id = v_product.id;
  end loop;

  update orders
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'stock_decrease_status', 'completed',
    'stock_decreased_at', v_applied_at,
    'stock_decrease_error', null
  )
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'applied',
    'movements_created', v_movements_created
  );
end;
$$;

revoke all on function apply_sale_inventory(uuid, uuid)
  from public, anon, authenticated;
grant execute on function apply_sale_inventory(uuid, uuid)
  to service_role;

comment on function apply_sale_inventory(uuid, uuid) is
  'Atomically validates and applies sale stock movements once per order.';
