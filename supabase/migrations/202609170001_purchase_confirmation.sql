alter table inventory_movements
  add column if not exists purchase_id uuid references purchases(id) on delete restrict,
  add column if not exists purchase_item_id uuid references purchase_items(id) on delete restrict,
  add column if not exists created_by uuid;

create index if not exists inventory_movements_purchase_id_idx
  on inventory_movements(purchase_id);

create unique index if not exists inventory_movements_purchase_item_id_unique
  on inventory_movements(purchase_item_id)
  where purchase_item_id is not null;

alter table products
  add column if not exists cost_source_purchase_item_id uuid
  references purchase_items(id) on delete set null;

create index if not exists products_cost_source_purchase_item_id_idx
  on products(cost_source_purchase_item_id);

create or replace function prevent_confirmed_purchase_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'confirmed' then
    raise exception 'Una compra confirmada no se puede modificar ni eliminar.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_confirmed_purchases on purchases;
create trigger protect_confirmed_purchases
before update or delete on purchases
for each row execute function prevent_confirmed_purchase_mutation();

create or replace function prevent_confirmed_purchase_item_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_purchase_id uuid := case when tg_op = 'DELETE' then old.purchase_id else new.purchase_id end;
  v_status text;
begin
  select status into v_status
  from purchases
  where id = v_purchase_id;

  if v_status = 'confirmed' then
    raise exception 'Las lineas de una compra confirmada no se pueden modificar ni eliminar.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_confirmed_purchase_items on purchase_items;
create trigger protect_confirmed_purchase_items
before insert or update or delete on purchase_items
for each row execute function prevent_confirmed_purchase_item_mutation();

create or replace function confirm_purchase(
  p_purchase_id uuid,
  p_created_by uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_purchase purchases%rowtype;
  v_item purchase_items%rowtype;
  v_product products%rowtype;
  v_item_count integer;
  v_new_stock bigint;
  v_confirmed_at timestamptz;
begin
  if p_purchase_id is null then
    raise exception 'Falta el ID de la compra.';
  end if;

  select * into v_purchase
  from purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'La compra no existe.';
  end if;

  if v_purchase.status = 'confirmed' then
    return jsonb_build_object(
      'purchase_id', v_purchase.id,
      'status', 'already_confirmed',
      'confirmed_at', v_purchase.confirmed_at,
      'movements_created', 0
    );
  end if;

  if v_purchase.status <> 'draft' then
    raise exception 'Solo se pueden confirmar compras en borrador.';
  end if;

  select count(*) into v_item_count
  from purchase_items
  where purchase_id = p_purchase_id;

  if v_item_count = 0 then
    raise exception 'La compra debe tener al menos un producto.';
  end if;

  if exists (
    select 1
    from purchase_items
    where purchase_id = p_purchase_id
      and (
        quantity <= 0
        or unit_purchase_cost < 0
        or supplier_line_total < 0
        or allocated_shipping_total < 0
        or allocated_shipping_per_unit < 0
        or effective_unit_cost < 0
        or effective_line_total < 0
      )
  ) then
    raise exception 'La compra contiene cantidades o importes invalidos.';
  end if;

  perform product.id
  from products product
  join purchase_items item on item.product_id = product.id
  where item.purchase_id = p_purchase_id
  order by product.id
  for update of product;

  if (
    select count(*)
    from products product
    join purchase_items item on item.product_id = product.id
    where item.purchase_id = p_purchase_id
  ) <> v_item_count then
    raise exception 'Uno o mas productos ya no existen.';
  end if;

  for v_item in
    select *
    from purchase_items
    where purchase_id = p_purchase_id
    order by product_id
  loop
    select * into strict v_product
    from products
    where id = v_item.product_id;

    v_new_stock := v_product.stock::bigint + v_item.quantity::bigint;
    if v_new_stock > 2147483647 then
      raise exception 'El stock resultante supera el maximo permitido.';
    end if;

    insert into inventory_movements (
      product_id,
      purchase_id,
      purchase_item_id,
      movement_type,
      quantity,
      previous_stock,
      new_stock,
      reason,
      created_by
    ) values (
      v_item.product_id,
      p_purchase_id,
      v_item.id,
      'purchase',
      v_item.quantity,
      v_product.stock,
      v_new_stock::integer,
      'Compra confirmada a ' || v_purchase.supplier_name_snapshot,
      p_created_by
    );

    update products set
      stock = v_new_stock::integer,
      cost = v_item.effective_unit_cost,
      cost_source_purchase_item_id = v_item.id
    where id = v_item.product_id;
  end loop;

  v_confirmed_at := now();
  update purchases set
    status = 'confirmed',
    confirmed_at = v_confirmed_at
  where id = p_purchase_id;

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'status', 'confirmed',
    'confirmed_at', v_confirmed_at,
    'movements_created', v_item_count
  );
end;
$$;

revoke all on function confirm_purchase(uuid, uuid) from public, anon, authenticated;
grant execute on function confirm_purchase(uuid, uuid) to service_role;
