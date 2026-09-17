create index if not exists inventory_movements_created_at_idx
  on inventory_movements(created_at desc);

create index if not exists inventory_movements_product_created_at_idx
  on inventory_movements(product_id, created_at desc);

create index if not exists inventory_movements_type_created_at_idx
  on inventory_movements(movement_type, created_at desc);

create or replace function adjust_inventory_stock(
  p_product_id uuid,
  p_new_stock numeric,
  p_reason text,
  p_created_by uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product products%rowtype;
  v_new_stock integer;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_quantity integer;
  v_movement_id uuid;
begin
  if p_product_id is null then
    raise exception 'Falta el ID del producto.';
  end if;

  if p_created_by is null then
    raise exception 'Falta identificar al administrador.';
  end if;

  if p_new_stock is null or p_new_stock < 0 or p_new_stock <> trunc(p_new_stock) then
    raise exception 'El nuevo stock debe ser un numero entero mayor o igual a 0.';
  end if;

  if p_new_stock > 2147483647 then
    raise exception 'El nuevo stock supera el maximo permitido.';
  end if;

  if v_reason = '' then
    raise exception 'El motivo del ajuste es obligatorio.';
  end if;

  select * into v_product
  from products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'El producto no existe.';
  end if;

  v_new_stock := p_new_stock::integer;

  if v_product.stock = v_new_stock then
    return jsonb_build_object(
      'product_id', v_product.id,
      'status', 'no_change',
      'previous_stock', v_product.stock,
      'new_stock', v_new_stock,
      'quantity', 0,
      'movement_id', null
    );
  end if;

  v_quantity := abs(v_new_stock::bigint - v_product.stock::bigint)::integer;
  v_movement_id := gen_random_uuid();

  update products
  set stock = v_new_stock
  where id = v_product.id;

  insert into inventory_movements (
    id,
    product_id,
    movement_type,
    quantity,
    previous_stock,
    new_stock,
    reason,
    created_by
  ) values (
    v_movement_id,
    v_product.id,
    'adjustment',
    v_quantity,
    v_product.stock,
    v_new_stock,
    v_reason,
    p_created_by
  );

  return jsonb_build_object(
    'product_id', v_product.id,
    'status', 'adjusted',
    'previous_stock', v_product.stock,
    'new_stock', v_new_stock,
    'quantity', v_quantity,
    'movement_id', v_movement_id
  );
end;
$$;

revoke all on function adjust_inventory_stock(uuid, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function adjust_inventory_stock(uuid, numeric, text, uuid)
  to service_role;

comment on function adjust_inventory_stock(uuid, numeric, text, uuid) is
  'Atomically changes the materialized product stock and records one adjustment movement. Existing balances are not backfilled.';
