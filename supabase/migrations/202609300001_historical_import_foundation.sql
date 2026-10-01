-- Infrastructure only. This migration does not import business data.

create table historical_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_file text not null check (nullif(btrim(source_file), '') is not null),
  source_sha256 text not null unique check (source_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default now(),
  imported_by uuid,
  notes text
);

create table historical_import_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references historical_import_batches(id) on delete restrict,
  source_sheet text not null check (nullif(btrim(source_sheet), '') is not null),
  source_row integer not null check (source_row > 0),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  record_type text not null check (record_type in ('purchase', 'sale')),
  target_table text not null check (target_table in ('purchases', 'orders')),
  target_id uuid not null,
  result jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  unique (batch_id, source_sheet, source_row, record_type, fingerprint)
);

create index historical_import_records_batch_id_idx on historical_import_records(batch_id);
create unique index historical_import_records_fingerprint_unique
  on historical_import_records(fingerprint, record_type);

alter table historical_import_batches enable row level security;
alter table historical_import_records enable row level security;
revoke all on table historical_import_batches, historical_import_records from public, anon, authenticated;
grant select, insert on table historical_import_batches to service_role;
grant select, insert on table historical_import_records to service_role;

alter table products
  add column historical_identity boolean not null default false,
  add column historical_group_key text;

alter table products alter column price drop not null;
alter table products alter column short_description drop not null;
alter table products drop constraint if exists products_price_check;
alter table products add constraint products_price_nonnegative_check
  check (price is null or price >= 0);
alter table products add constraint products_historical_group_key_check check (
  (historical_identity = false and historical_group_key is null)
  or
  (historical_identity = true and nullif(btrim(historical_group_key), '') is not null)
);
alter table products add constraint products_operational_commercial_fields_check check (
  historical_identity = true
  or
  (price is not null and short_description is not null)
);
alter table products add constraint products_historical_identity_check check (
  historical_identity = false
  or
  (
    status = 'archived'
    and stock = 0
    and featured = false
    and price is null
    and transfer_price is null
    and compare_at_price is null
    and cost is null
    and cost_source_purchase_item_id is null
    and short_description is null
  )
);
create unique index products_historical_group_key_unique
  on products(historical_group_key)
  where historical_identity = true;

alter table orders
  add column historical_import boolean not null default false,
  add column historical_occurred_on date,
  add column affects_inventory boolean not null default true;

alter table orders drop constraint if exists orders_channel_check;
alter table orders add constraint orders_channel_check
  check (channel in ('web', 'store', 'order', 'historical'));
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (
  status in (
    'pending', 'confirmed', 'paid', 'preparing', 'shipped', 'completed',
    'ordered', 'ready', 'delivered', 'cancelled', 'historical'
  )
);
alter table orders add constraint orders_historical_provenance_check check (
  (historical_import = false and channel <> 'historical' and status <> 'historical' and affects_inventory = true)
  or
  (historical_import = true and channel = 'historical' and status = 'historical'
    and affects_inventory = false and historical_occurred_on is not null)
);
create index orders_historical_occurred_on_idx
  on orders(historical_occurred_on) where historical_import = true;

alter table purchases
  add column historical_import boolean not null default false,
  add column historical_occurred_on date,
  add column affects_inventory boolean not null default true;
alter table purchases alter column supplier_id drop not null;
alter table purchases alter column supplier_name_snapshot drop not null;
alter table purchases drop constraint if exists purchases_status_check;
alter table purchases add constraint purchases_status_check
  check (status in ('draft', 'confirmed', 'cancelled', 'historical'));
alter table purchases add constraint purchases_historical_provenance_check check (
  (historical_import = false and status <> 'historical' and affects_inventory = true
    and supplier_id is not null and nullif(btrim(supplier_name_snapshot), '') is not null)
  or
  (historical_import = true and status = 'historical' and affects_inventory = false
    and historical_occurred_on is not null and confirmed_at is null and cancelled_at is null)
);
create index purchases_historical_occurred_on_idx
  on purchases(historical_occurred_on) where historical_import = true;

create or replace function historical_import_context_enabled()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(current_setting('sfstore.historical_import', true), '') = 'on';
$$;

create or replace function prevent_historical_product_identity_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.historical_identity then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PRODUCT_IDENTITY_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_historical_product_identities
before update or delete on products
for each row execute function prevent_historical_product_identity_mutation();

create or replace function prevent_historical_order_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.historical_import and not historical_import_context_enabled() then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_ORDER_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_historical_orders
before update or delete on orders
for each row execute function prevent_historical_order_mutation();

create or replace function prevent_historical_order_item_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
begin
  if tg_op <> 'DELETE' and new.product_id is not null
     and exists (select 1 from products where id = new.product_id and historical_identity)
     and not (
       historical_import_context_enabled()
       and exists (select 1 from orders where id = new.order_id and historical_import)
     ) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_IDENTITY_REQUIRES_HISTORICAL_ORDER';
  end if;
  if exists (select 1 from orders where id = v_order_id and historical_import)
     and not historical_import_context_enabled() then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_ORDER_ITEM_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_historical_order_items
before insert or update or delete on order_items
for each row execute function prevent_historical_order_item_mutation();

create or replace function prevent_confirmed_purchase_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'confirmed' then
    raise exception 'Una compra confirmada no se puede modificar ni eliminar.';
  end if;
  if old.historical_import and not historical_import_context_enabled() then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PURCHASE_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function prevent_confirmed_purchase_item_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_purchase_id uuid := case when tg_op = 'DELETE' then old.purchase_id else new.purchase_id end;
  v_purchase purchases%rowtype;
begin
  select * into v_purchase from purchases where id = v_purchase_id;
  if tg_op <> 'DELETE' and new.product_id is not null
     and exists (select 1 from products where id = new.product_id and historical_identity)
     and not (historical_import_context_enabled() and v_purchase.historical_import) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_IDENTITY_REQUIRES_HISTORICAL_PURCHASE';
  end if;
  if v_purchase.status = 'confirmed' then
    raise exception 'Las lineas de una compra confirmada no se pueden modificar ni eliminar.';
  end if;
  if v_purchase.historical_import and not historical_import_context_enabled() then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PURCHASE_ITEM_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function prevent_historical_inventory_movement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from products where id = new.product_id and historical_identity) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_IDENTITY_CANNOT_AFFECT_INVENTORY';
  end if;
  if (new.order_id is not null and exists (
      select 1 from orders where id = new.order_id and historical_import
    )) or (new.purchase_id is not null and exists (
      select 1 from purchases where id = new.purchase_id and historical_import
    )) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_RECORD_CANNOT_AFFECT_INVENTORY';
  end if;
  return new;
end;
$$;

create trigger reject_historical_inventory_movements
before insert or update on inventory_movements
for each row execute function prevent_historical_inventory_movement();

create or replace function prevent_historical_import_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using errcode = 'P0001', message = 'HISTORICAL_IMPORT_AUDIT_IMMUTABLE';
end;
$$;

create trigger protect_historical_import_batches
before update or delete on historical_import_batches
for each row execute function prevent_historical_import_audit_mutation();
create trigger protect_historical_import_records
before update or delete on historical_import_records
for each row execute function prevent_historical_import_audit_mutation();

create or replace function import_historical_purchase(
  p_batch_id uuid,
  p_source_sheet text,
  p_source_row integer,
  p_fingerprint text,
  p_occurred_on date,
  p_supplier_id uuid,
  p_supplier_name text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing historical_import_records%rowtype;
  v_purchase_id uuid := gen_random_uuid();
  v_item_count integer;
  v_locked_count integer := 0;
  v_total_units bigint;
  v_total numeric(12, 2);
begin
  if p_batch_id is null or not exists (select 1 from historical_import_batches where id = p_batch_id) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_BATCH_NOT_FOUND';
  end if;
  if p_occurred_on is null then raise exception using errcode = 'P0001', message = 'HISTORICAL_DATE_REQUIRED'; end if;
  if nullif(btrim(p_source_sheet), '') is null or p_source_row is null or p_source_row <= 0 then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_SOURCE_INVALID';
  end if;
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_FINGERPRINT_INVALID';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PURCHASE_NO_ITEMS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('purchase:' || p_fingerprint, 0));
  select * into v_existing from historical_import_records
  where fingerprint = p_fingerprint and record_type = 'purchase';
  if found then
    return jsonb_build_object('purchase_id', v_existing.target_id, 'operation', 'already_imported');
  end if;

  select count(*), sum(quantity)::bigint, sum(source_total)::numeric(12, 2)
  into v_item_count, v_total_units, v_total
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric, source_total numeric);
  if v_item_count <> (select count(distinct product_id) from jsonb_to_recordset(p_items)
      as item(product_id uuid, quantity numeric, unit_cost numeric, source_total numeric)) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PURCHASE_DUPLICATE_PRODUCT';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items)
      as item(product_id uuid, quantity numeric, unit_cost numeric, source_total numeric)
      where product_id is null or quantity is null or quantity <= 0 or quantity <> trunc(quantity)
        or quantity > 2147483647 or unit_cost is null or unit_cost < 0 or unit_cost <> round(unit_cost, 2)
        or source_total is null or source_total < 0 or source_total <> round(source_total, 2)
        or unit_cost > 9999999999.99 or source_total > 9999999999.99) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PURCHASE_ITEM_INVALID';
  end if;
  if v_total_units > 2147483647 then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PURCHASE_TOTAL_UNITS_INVALID';
  end if;
  select count(*) into v_locked_count from products product
  join jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric, source_total numeric)
    on item.product_id = product.id;
  if v_locked_count <> v_item_count then raise exception using errcode = 'P0001', message = 'HISTORICAL_PRODUCT_NOT_FOUND'; end if;

  perform set_config('sfstore.historical_import', 'on', true);
  insert into purchases (
    id, supplier_id, supplier_name_snapshot, purchase_date, status, shipping_cost,
    supplier_subtotal, total_cost, total_units, notes, created_by,
    historical_import, historical_occurred_on, affects_inventory
  ) values (
    v_purchase_id, p_supplier_id, nullif(btrim(p_supplier_name), ''), p_occurred_on,
    'historical', 0, v_total, v_total, v_total_units::integer, nullif(btrim(p_notes), ''), null,
    true, p_occurred_on, false
  );
  insert into purchase_items (
    purchase_id, product_id, product_name_snapshot, product_slug_snapshot, sku_snapshot,
    quantity, unit_purchase_cost, supplier_line_total, allocated_shipping_total,
    allocated_shipping_per_unit, effective_unit_cost, effective_line_total
  )
  select v_purchase_id, product.id, product.name, product.slug, product.sku,
    item.quantity::integer, item.unit_cost, item.source_total, 0, 0, item.unit_cost, item.source_total
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric, source_total numeric)
  join products product on product.id = item.product_id;
  insert into historical_import_records (
    batch_id, source_sheet, source_row, fingerprint, record_type, target_table, target_id, result, notes
  ) values (
    p_batch_id, btrim(p_source_sheet), p_source_row, p_fingerprint, 'purchase', 'purchases', v_purchase_id,
    jsonb_build_object('items', v_item_count, 'source_total', v_total, 'affects_inventory', false), nullif(btrim(p_notes), '')
  );
  return jsonb_build_object('purchase_id', v_purchase_id, 'operation', 'imported', 'items', v_item_count);
end;
$$;

create or replace function import_historical_sale(
  p_batch_id uuid,
  p_source_sheet text,
  p_source_row integer,
  p_fingerprint text,
  p_occurred_on date,
  p_notes text,
  p_items jsonb,
  p_payment_method text default null,
  p_payment_amount numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing historical_import_records%rowtype;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_item_count integer;
  v_locked_count integer := 0;
  v_total numeric(12, 2);
  v_payment_status text := 'pending';
begin
  if p_batch_id is null or not exists (select 1 from historical_import_batches where id = p_batch_id) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_BATCH_NOT_FOUND';
  end if;
  if p_occurred_on is null then raise exception using errcode = 'P0001', message = 'HISTORICAL_DATE_REQUIRED'; end if;
  if nullif(btrim(p_source_sheet), '') is null or p_source_row is null or p_source_row <= 0 then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_SOURCE_INVALID';
  end if;
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_FINGERPRINT_INVALID';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_SALE_NO_ITEMS';
  end if;
  if (p_payment_method is null) <> (p_payment_amount is null) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PAYMENT_EVIDENCE_INCOMPLETE';
  end if;
  if p_payment_method is not null and p_payment_method not in ('cash', 'transfer', 'card', 'mercadopago', 'other') then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PAYMENT_METHOD_INVALID';
  end if;
  if p_payment_amount is not null and (p_payment_amount <= 0 or p_payment_amount <> round(p_payment_amount, 2)
      or p_payment_amount > 9999999999.99) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PAYMENT_AMOUNT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_fingerprint, 0));
  select * into v_existing from historical_import_records
  where fingerprint = p_fingerprint and record_type = 'sale';
  if found then return jsonb_build_object('order_id', v_existing.target_id, 'operation', 'already_imported'); end if;

  select count(*), sum(source_total)::numeric(12, 2) into v_item_count, v_total
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_price numeric, source_total numeric);
  if exists (select 1 from jsonb_to_recordset(p_items)
      as item(product_id uuid, quantity numeric, unit_price numeric, source_total numeric)
      where product_id is null or quantity is null or quantity <= 0 or quantity <> trunc(quantity)
        or quantity > 2147483647 or unit_price is null or unit_price < 0 or unit_price <> round(unit_price, 2)
        or source_total is null or source_total < 0 or source_total <> round(source_total, 2)
        or unit_price > 9999999999.99 or source_total > 9999999999.99) then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_SALE_ITEM_INVALID';
  end if;
  select count(*) into v_locked_count from products product
  join jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_price numeric, source_total numeric)
    on item.product_id = product.id;
  if v_locked_count <> v_item_count then raise exception using errcode = 'P0001', message = 'HISTORICAL_PRODUCT_NOT_FOUND'; end if;

  v_order_number := 'SF-H-' || upper(substr(p_fingerprint, 1, 20));
  if p_payment_amount is not null then
    v_payment_status := case when p_payment_amount >= v_total and v_total > 0 then 'paid' else 'partial' end;
  end if;
  perform set_config('sfstore.historical_import', 'on', true);
  insert into orders (
    id, customer_id, order_number, channel, status, payment_method, payment_status,
    shipping_method, subtotal, discount, shipping_cost, total, notes, metadata,
    historical_import, historical_occurred_on, affects_inventory
  ) values (
    v_order_id, null, v_order_number, 'historical', 'historical', null, v_payment_status,
    null, v_total, 0, 0, v_total, nullif(btrim(p_notes), ''),
    jsonb_build_object('source', 'historical_import', 'source_totals_preserved', true,
      'payment_evidence', p_payment_amount is not null), true, p_occurred_on, false
  );
  insert into order_items (
    order_id, product_id, product_name, product_slug, category_name, unit_price, quantity, subtotal
  )
  select v_order_id, product.id, product.name, product.slug, category.name,
    item.unit_price, item.quantity::integer, item.source_total
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_price numeric, source_total numeric)
  join products product on product.id = item.product_id
  join categories category on category.id = product.category_id;
  if p_payment_amount is not null then
    insert into order_payments (order_id, method, amount, status, reference, notes, paid_at)
    values (v_order_id, p_payment_method, p_payment_amount, 'approved',
      'historical:' || p_fingerprint, 'Pago histórico con evidencia en la fuente.', null);
  end if;
  insert into historical_import_records (
    batch_id, source_sheet, source_row, fingerprint, record_type, target_table, target_id, result, notes
  ) values (
    p_batch_id, btrim(p_source_sheet), p_source_row, p_fingerprint, 'sale', 'orders', v_order_id,
    jsonb_build_object('items', v_item_count, 'source_total', v_total, 'payment_created', p_payment_amount is not null,
      'affects_inventory', false), nullif(btrim(p_notes), '')
  );
  return jsonb_build_object('order_id', v_order_id, 'operation', 'imported', 'items', v_item_count);
end;
$$;

revoke all on function historical_import_context_enabled() from public, anon, authenticated;
grant execute on function historical_import_context_enabled() to service_role;
revoke all on function import_historical_purchase(uuid, text, integer, text, date, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function import_historical_purchase(uuid, text, integer, text, date, uuid, text, text, jsonb)
  to service_role;
revoke all on function import_historical_sale(uuid, text, integer, text, date, text, jsonb, text, numeric)
  from public, anon, authenticated;
grant execute on function import_historical_sale(uuid, text, integer, text, date, text, jsonb, text, numeric)
  to service_role;

comment on table historical_import_batches is 'Immutable identity of one reviewed historical source file.';
comment on table historical_import_records is 'Immutable idempotency and provenance ledger for historical imports.';
comment on function import_historical_purchase(uuid, text, integer, text, date, uuid, text, text, jsonb) is
  'Imports one reviewed historical purchase source row without inventory or product-cost effects.';
comment on function import_historical_sale(uuid, text, integer, text, date, text, jsonb, text, numeric) is
  'Imports one reviewed historical sale source row without inventory effects; payment is optional evidence.';
