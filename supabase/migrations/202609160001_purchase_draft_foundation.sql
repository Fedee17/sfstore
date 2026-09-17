create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  normalized_name text not null unique check (btrim(normalized_name) <> ''),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete restrict,
  supplier_name_snapshot text not null,
  purchase_date date not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  supplier_subtotal numeric(12, 2) not null default 0 check (supplier_subtotal >= 0),
  total_cost numeric(12, 2) not null default 0 check (total_cost >= 0),
  total_units integer not null default 0 check (total_units >= 0),
  notes text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'confirmed' or confirmed_at is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  product_name_snapshot text not null,
  product_slug_snapshot text not null,
  sku_snapshot text,
  quantity integer not null check (quantity > 0),
  unit_purchase_cost numeric(12, 2) not null check (unit_purchase_cost >= 0),
  supplier_line_total numeric(12, 2) not null check (supplier_line_total >= 0),
  allocated_shipping_total numeric(12, 2) not null default 0 check (allocated_shipping_total >= 0),
  allocated_shipping_per_unit numeric(18, 6) not null default 0 check (allocated_shipping_per_unit >= 0),
  effective_unit_cost numeric(12, 2) not null check (effective_unit_cost >= 0),
  effective_line_total numeric(12, 2) not null check (effective_line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_id, product_id)
);

alter table suppliers enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;

create index if not exists purchases_supplier_id_idx on purchases(supplier_id);
create index if not exists purchases_status_idx on purchases(status);
create index if not exists purchases_purchase_date_idx on purchases(purchase_date desc);
create index if not exists purchase_items_purchase_id_idx on purchase_items(purchase_id);
create index if not exists purchase_items_product_id_idx on purchase_items(product_id);

drop trigger if exists set_suppliers_updated_at on suppliers;
create trigger set_suppliers_updated_at before update on suppliers
for each row execute function set_updated_at();

drop trigger if exists set_purchases_updated_at on purchases;
create trigger set_purchases_updated_at before update on purchases
for each row execute function set_updated_at();

drop trigger if exists set_purchase_items_updated_at on purchase_items;
create trigger set_purchase_items_updated_at before update on purchase_items
for each row execute function set_updated_at();

create or replace function save_purchase_draft(
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_purchase_date date,
  p_shipping_cost numeric,
  p_notes text,
  p_created_by uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_supplier_name text;
  v_status text;
  v_item jsonb;
  v_product record;
  v_quantity integer;
  v_unit_cost numeric(12, 2);
  v_shipping_cents bigint;
  v_total_units bigint;
  v_supplier_subtotal numeric(12, 2);
  v_total_cost numeric(12, 2);
begin
  if p_purchase_date is null then
    raise exception 'La fecha de compra es requerida.';
  end if;

  if p_shipping_cost is null or p_shipping_cost < 0 or p_shipping_cost > 9999999999.99 then
    raise exception 'El costo de envio no es valido.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra debe tener al menos un producto.';
  end if;

  select name into v_supplier_name
  from suppliers
  where id = p_supplier_id and is_active = true;

  if v_supplier_name is null then
    raise exception 'El proveedor no existe o esta inactivo.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    group by item ->> 'product_id'
    having count(*) > 1
  ) then
    raise exception 'No se puede repetir un producto en la misma compra.';
  end if;

  if p_purchase_id is null then
    insert into purchases (
      supplier_id, supplier_name_snapshot, purchase_date, status,
      shipping_cost, notes, created_by
    ) values (
      p_supplier_id, v_supplier_name, p_purchase_date, 'draft',
      round(p_shipping_cost, 2), nullif(btrim(p_notes), ''), p_created_by
    ) returning id into v_purchase_id;
  else
    select status into v_status
    from purchases
    where id = p_purchase_id
    for update;

    if not found then
      raise exception 'La compra no existe.';
    end if;

    if v_status <> 'draft' then
      raise exception 'Solo se pueden modificar compras en borrador.';
    end if;

    v_purchase_id := p_purchase_id;

    update purchases set
      supplier_id = p_supplier_id,
      supplier_name_snapshot = v_supplier_name,
      purchase_date = p_purchase_date,
      shipping_cost = round(p_shipping_cost, 2),
      notes = nullif(btrim(p_notes), '')
    where id = v_purchase_id;

    delete from purchase_items where purchase_id = v_purchase_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item ->> 'product_id', '') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'El producto de una linea no es valido.';
    end if;

    if coalesce(v_item ->> 'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'La cantidad debe ser un entero mayor que cero.';
    end if;

    if coalesce(v_item ->> 'unit_purchase_cost', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'El costo unitario no es valido.';
    end if;

    v_quantity := (v_item ->> 'quantity')::integer;
    v_unit_cost := round((v_item ->> 'unit_purchase_cost')::numeric, 2);

    if v_quantity > 1000000 or v_unit_cost > 9999999999.99 then
      raise exception 'Una linea supera el maximo permitido.';
    end if;

    select id, name, slug, sku into v_product
    from products
    where id = (v_item ->> 'product_id')::uuid;

    if not found then
      raise exception 'Uno de los productos ya no existe.';
    end if;

    insert into purchase_items (
      purchase_id, product_id, product_name_snapshot, product_slug_snapshot,
      sku_snapshot, quantity, unit_purchase_cost,
      supplier_line_total, allocated_shipping_total,
      allocated_shipping_per_unit, effective_unit_cost, effective_line_total
    ) values (
      v_purchase_id, v_product.id, v_product.name, v_product.slug,
      v_product.sku, v_quantity, v_unit_cost,
      v_unit_cost * v_quantity, 0, 0, v_unit_cost, v_unit_cost * v_quantity
    );
  end loop;

  select sum(quantity)::bigint into v_total_units
  from purchase_items where purchase_id = v_purchase_id;

  v_shipping_cents := round(p_shipping_cost * 100)::bigint;

  with raw_allocations as (
    select
      id,
      product_id,
      ((v_shipping_cents * quantity) / v_total_units)::bigint as base_cents,
      ((v_shipping_cents * quantity) % v_total_units)::bigint as remainder
    from purchase_items
    where purchase_id = v_purchase_id
  ),
  ranked as (
    select
      id,
      base_cents,
      row_number() over (order by remainder desc, product_id asc) as allocation_rank,
      v_shipping_cents - sum(base_cents) over () as remaining_cents
    from raw_allocations
  ),
  final_allocations as (
    select
      id,
      base_cents + case when allocation_rank <= remaining_cents then 1 else 0 end as allocated_cents
    from ranked
  )
  update purchase_items item set
    allocated_shipping_total = allocation.allocated_cents / 100.0,
    allocated_shipping_per_unit = round(
      (allocation.allocated_cents / 100.0) / item.quantity,
      6
    ),
    effective_unit_cost = round(
      (item.supplier_line_total + allocation.allocated_cents / 100.0) / item.quantity,
      2
    ),
    effective_line_total = item.supplier_line_total + allocation.allocated_cents / 100.0
  from final_allocations allocation
  where item.id = allocation.id;

  select
    sum(supplier_line_total),
    sum(effective_line_total)
  into v_supplier_subtotal, v_total_cost
  from purchase_items
  where purchase_id = v_purchase_id;

  update purchases set
    shipping_cost = v_shipping_cents / 100.0,
    supplier_subtotal = v_supplier_subtotal,
    total_cost = v_total_cost,
    total_units = v_total_units
  where id = v_purchase_id;

  return v_purchase_id;
end;
$$;

create or replace function cancel_purchase_draft(p_purchase_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'La compra no existe.';
  end if;

  if v_status <> 'draft' then
    raise exception 'Solo se pueden cancelar compras en borrador.';
  end if;

  update purchases set status = 'cancelled', cancelled_at = now()
  where id = p_purchase_id;

  return p_purchase_id;
end;
$$;

revoke all on function save_purchase_draft(uuid, uuid, date, numeric, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function cancel_purchase_draft(uuid) from public, anon, authenticated;
grant execute on function save_purchase_draft(uuid, uuid, date, numeric, text, uuid, jsonb) to service_role;
grant execute on function cancel_purchase_draft(uuid) to service_role;
