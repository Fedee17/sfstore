create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete restrict,
  name text not null,
  slug text not null unique,
  short_description text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  transfer_price numeric(12, 2) check (transfer_price is null or transfer_price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  cost numeric(12, 2) check (cost is null or cost >= 0),
  stock integer not null default 0 check (stock >= 0),
  sku text unique,
  featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  alt text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  province text,
  city text,
  address text,
  postal_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,
  order_number text not null unique,
  status text not null default 'pending' check (
    status in ('pending', 'confirmed', 'paid', 'preparing', 'shipped', 'completed', 'cancelled')
  ),
  payment_method text not null check (payment_method in ('transfer', 'mercadopago')),
  payment_status text not null default 'pending' check (
    payment_status in ('pending', 'approved', 'rejected', 'refunded')
  ),
  shipping_method text not null check (shipping_method in ('pickup', 'shipping')),
  shipping_carrier text check (shipping_carrier in ('Correo Argentino', 'Andreani', 'Via Cargo') or shipping_carrier is null),
  shipping_province text,
  shipping_city text,
  shipping_address text,
  shipping_postal_code text,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  product_slug text not null,
  category_name text,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  movement_type text not null check (
    movement_type in ('purchase', 'sale', 'adjustment', 'return', 'reservation', 'release')
  ),
  quantity integer not null,
  previous_stock integer not null check (previous_stock >= 0),
  new_stock integer not null check (new_stock >= 0),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  session_id text,
  customer_id uuid references customers(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists products_category_id_idx on products(category_id);
create index if not exists products_slug_idx on products(slug);
create index if not exists products_status_idx on products(status);
create index if not exists product_images_product_id_idx on product_images(product_id);
create index if not exists product_attributes_product_id_idx on product_attributes(product_id);
create index if not exists customers_email_idx on customers(email);
create index if not exists customers_phone_idx on customers(phone);
create index if not exists orders_customer_id_idx on orders(customer_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_payment_method_idx on orders(payment_method);
create index if not exists order_items_order_id_idx on order_items(order_id);
create index if not exists order_items_product_id_idx on order_items(product_id);
create index if not exists inventory_movements_product_id_idx on inventory_movements(product_id);
create index if not exists inventory_movements_order_id_idx on inventory_movements(order_id);
create index if not exists analytics_events_event_name_idx on analytics_events(event_name);
create index if not exists analytics_events_created_at_idx on analytics_events(created_at);

drop trigger if exists set_categories_updated_at on categories;
create trigger set_categories_updated_at
before update on categories
for each row execute function set_updated_at();

drop trigger if exists set_products_updated_at on products;
create trigger set_products_updated_at
before update on products
for each row execute function set_updated_at();

drop trigger if exists set_product_images_updated_at on product_images;
create trigger set_product_images_updated_at
before update on product_images
for each row execute function set_updated_at();

drop trigger if exists set_product_attributes_updated_at on product_attributes;
create trigger set_product_attributes_updated_at
before update on product_attributes
for each row execute function set_updated_at();

drop trigger if exists set_customers_updated_at on customers;
create trigger set_customers_updated_at
before update on customers
for each row execute function set_updated_at();

drop trigger if exists set_orders_updated_at on orders;
create trigger set_orders_updated_at
before update on orders
for each row execute function set_updated_at();

drop trigger if exists set_order_items_updated_at on order_items;
create trigger set_order_items_updated_at
before update on order_items
for each row execute function set_updated_at();

drop trigger if exists set_settings_updated_at on settings;
create trigger set_settings_updated_at
before update on settings
for each row execute function set_updated_at();
