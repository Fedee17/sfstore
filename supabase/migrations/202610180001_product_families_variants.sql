-- Phase 1 only. No backfill, stock redistribution or historical reassignment.
-- Apply only after schema preflight and an explicitly authorized deployment.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.product_families (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  base_price numeric(12,2) not null check (base_price >= 0 and base_price <> 'NaN'::numeric),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.product_family_options (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.product_families(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 60),
  unique(id, family_id)
);
create unique index product_family_option_name on public.product_family_options(family_id, lower(btrim(name)));
create table public.product_family_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.product_family_options(id) on delete restrict,
  label text not null check (length(btrim(label)) between 1 and 80)
);
create unique index product_family_value_label on public.product_family_option_values(option_id, lower(btrim(label)));

alter table public.products
  add column family_id uuid references public.product_families(id) on delete restrict,
  add column variant_choices jsonb not null default '{}'::jsonb,
  add column list_price_override numeric(12,2) check (list_price_override >= 0 and list_price_override <> 'NaN'::numeric),
  add column web_visible boolean not null default true,
  add column commercial_blocked boolean not null default false,
  add constraint product_variant_shape check (
    jsonb_typeof(variant_choices) = 'object' and
    ((family_id is null and variant_choices = '{}'::jsonb and list_price_override is null) or
     (family_id is not null and sku is not null and length(btrim(sku)) > 0 and not historical_identity))
  );
create unique index product_family_combination_unique on public.products(family_id, variant_choices) where family_id is not null;
create index products_family_idx on public.products(family_id) where family_id is not null;

-- A common lock precedes catalog PRICE/configuration row locks. Stock-only updates do
-- not acquire it. Legacy writers fail fast on contention rather than invert locks.
create function public.lock_variant_catalog() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  -- Legacy product/image saves may already hold a SKU lock. Never wait here:
  -- abort that writer instead of forming a cycle with a family-price transaction.
  if not pg_try_advisory_xact_lock(718240180001::bigint) then
    raise exception 'VARIANT_CATALOG_BUSY_RETRY' using errcode='55P03';
  end if;
  return null;
end $$;
create trigger variant_catalog_product_insert before insert on public.products
for each statement execute function public.lock_variant_catalog();
create trigger variant_catalog_product_update before update of price, category_id, family_id, variant_choices,
  list_price_override, web_visible, commercial_blocked on public.products
for each statement execute function public.lock_variant_catalog();
create trigger variant_catalog_family before insert or update or delete on public.product_families
for each statement execute function public.lock_variant_catalog();
create trigger variant_catalog_option before insert or update or delete on public.product_family_options
for each statement execute function public.lock_variant_catalog();
create trigger variant_catalog_value before insert or update or delete on public.product_family_option_values
for each statement execute function public.lock_variant_catalog();

create function public.validate_product_variant() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare f public.product_families%rowtype; expected_price numeric; option_count integer;
begin
  if tg_op = 'UPDATE' and old.family_id is not null and
    (new.family_id is distinct from old.family_id or new.variant_choices <> old.variant_choices or new.sku is distinct from old.sku) then
    raise exception 'VARIANT_IDENTITY_IMMUTABLE';
  end if;
  if new.family_id is null then return new; end if;
  select * into strict f from public.product_families where id = new.family_id;
  if new.category_id <> f.category_id then raise exception 'VARIANT_CATEGORY_MISMATCH'; end if;
  select count(*) into option_count from public.product_family_options where family_id = f.id;
  if option_count = 0 or option_count > 6 or jsonb_typeof(new.variant_choices) <> 'object'
    or (select count(*) from jsonb_object_keys(new.variant_choices)) <> option_count then
    raise exception 'VARIANT_OPTIONS_INCOMPLETE';
  end if;
  if exists(select 1 from public.product_family_options o where o.family_id = f.id and not exists(
    select 1 from public.product_family_option_values v where v.option_id = o.id
      and new.variant_choices ->> o.id::text = v.id::text)) then
    raise exception 'VARIANT_OPTIONS_INVALID';
  end if;
  expected_price := coalesce(new.list_price_override, f.base_price);
  -- Existing editors/importers must not overwrite a derived operational price.
  if new.price is distinct from expected_price then raise exception 'VARIANT_PRICE_MANAGED_BY_FAMILY'; end if;
  return new;
end $$;
create trigger validate_product_variant before insert or update of family_id, variant_choices, sku, category_id, price, list_price_override, historical_identity
on public.products for each row execute function public.validate_product_variant();

create function public.protect_family_definition() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare f uuid;
begin
  if tg_table_name = 'product_family_options' then
    f := case when tg_op = 'DELETE' then old.family_id else new.family_id end;
  else
    select family_id into f from public.product_family_options where id = case when tg_op = 'DELETE' then old.option_id else new.option_id end;
  end if;
  if tg_op = 'UPDATE' then raise exception 'VARIANT_OPTION_IDENTITY_IMMUTABLE'; end if;
  if tg_op = 'INSERT' then
    if tg_table_name = 'product_family_options' then
      if (select count(*) from public.product_family_options where family_id=f) >= 6 then raise exception 'VARIANT_OPTIONS_LIMIT'; end if;
    else
      if (select count(*) from public.product_family_option_values where option_id=new.option_id) >= 100 then raise exception 'VARIANT_VALUES_LIMIT'; end if;
    end if;
  end if;
  if exists(select 1 from public.products where family_id = f) and
    (tg_table_name = 'product_family_options' or tg_op = 'DELETE') then
    raise exception 'VARIANT_DEFINITION_IN_USE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_family_options before insert or update or delete on public.product_family_options
for each row execute function public.protect_family_definition();
create trigger protect_family_values before insert or update or delete on public.product_family_option_values
for each row execute function public.protect_family_definition();

create function public.propagate_family_price() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if new.category_id <> old.category_id and exists(select 1 from public.products where family_id = old.id) then
    raise exception 'VARIANT_CATEGORY_IN_USE';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  -- The family row's new price is not yet visible in a BEFORE trigger.
  return new;
end $$;
create trigger version_product_family before update on public.product_families
for each row execute function public.propagate_family_price();
create function public.update_family_inherited_prices() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  -- Deterministic order shared with sale/checkout product locks.
  perform id from public.products where family_id = new.id and list_price_override is null order by id for update;
  update public.products set price = new.base_price where family_id = new.id and list_price_override is null and price is distinct from new.base_price;
  return null;
end $$;
create trigger update_family_inherited_prices after update of base_price on public.product_families
for each row execute function public.update_family_inherited_prices();

create function public.save_product_family(
 p_id uuid, p_revision bigint, p_name text, p_slug text, p_category uuid, p_price numeric
) returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  perform pg_advisory_xact_lock(718240180001::bigint);
  if p_price is null or p_price <> round(p_price,2) or p_price < 0 or p_price = 'NaN'::numeric then raise exception 'VARIANT_PRICE_INVALID'; end if;
  if p_revision = 0 then
    insert into public.product_families(id, name, slug, category_id, base_price) values(p_id,btrim(p_name),p_slug,p_category,p_price);
  else
    update public.product_families set name=btrim(p_name),slug=p_slug,category_id=p_category,base_price=p_price where id=p_id and revision=p_revision;
    if not found then raise exception 'VARIANT_STALE_VERSION'; end if;
  end if;
  return p_id;
end $$;

create function public.add_product_family_option(p_family uuid, p_name text, p_values text[])
returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
declare o uuid := gen_random_uuid(); value text;
begin
  perform pg_advisory_xact_lock(718240180001::bigint);
  if cardinality(p_values) is null or cardinality(p_values) < 1 or cardinality(p_values) > 100 or
    (select count(*) from public.product_family_options where family_id=p_family) >= 6 then raise exception 'VARIANT_OPTIONS_INVALID'; end if;
  insert into public.product_family_options(id,family_id,name) values(o,p_family,btrim(p_name));
  foreach value in array p_values loop
    insert into public.product_family_option_values(option_id,label) values(o,btrim(value));
  end loop;
  update public.product_families set updated_at=clock_timestamp() where id=p_family;
  return o;
end $$;

create function public.add_product_family_value(p_option uuid, p_label text)
returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(718240180001::bigint);
  if (select count(*) from public.product_family_option_values where option_id=p_option) >= 100 then raise exception 'VARIANT_OPTIONS_INVALID'; end if;
  insert into public.product_family_option_values(id,option_id,label) values(v,p_option,btrim(p_label));
  update public.product_families set updated_at=clock_timestamp() where id=(select family_id from public.product_family_options where id=p_option);
  return v;
end $$;

create function public.configure_product_variant(
 p_product uuid, p_family uuid, p_version text, p_choices jsonb, p_override numeric,
 p_web_visible boolean, p_blocked boolean, p_new jsonb default null
) returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
declare f public.product_families%rowtype; effective_price numeric; old_product public.products%rowtype;
begin
  perform pg_advisory_xact_lock(718240180001::bigint);
  select * into strict f from public.product_families where id=p_family;
  if p_override is not null and (p_override < 0 or p_override <> round(p_override,2) or p_override = 'NaN'::numeric) then raise exception 'VARIANT_PRICE_INVALID'; end if;
  effective_price := coalesce(p_override,f.base_price);
  if p_new is not null then
    if p_version is not null or jsonb_typeof(p_new) <> 'object' or
      exists(select 1 from jsonb_object_keys(p_new) k where k not in ('name','slug','sku')) or
      coalesce(length(btrim(p_new->>'name')),0) not between 1 and 160 then raise exception 'VARIANT_NEW_INVALID'; end if;
    insert into public.products(id,category_id,name,slug,short_description,sku,price,status,family_id,variant_choices,list_price_override,web_visible,commercial_blocked)
    values(p_product,f.category_id,btrim(p_new->>'name'),p_new->>'slug',f.name,p_new->>'sku',effective_price,'draft',p_family,p_choices,p_override,p_web_visible,p_blocked);
  else
    select * into strict old_product from public.products where id=p_product for update;
    if old_product.historical_identity then raise exception 'HISTORICAL_PRODUCT_IMMUTABLE'; end if;
    if p_version is null or public.get_product_save_version(p_product) is distinct from p_version then raise exception 'VARIANT_STALE_VERSION'; end if;
    -- Linking a simple SKU must preserve its current price via an explicit override.
    if old_product.family_id is null and p_override is distinct from old_product.price then raise exception 'VARIANT_LINK_MUST_PRESERVE_PRICE'; end if;
    update public.products set family_id=p_family,variant_choices=p_choices,list_price_override=p_override,
      price=effective_price,web_visible=p_web_visible,commercial_blocked=p_blocked where id=p_product;
  end if;
  return p_product;
end $$;

-- One bounded server-side read, including versions under row locks; no N+1 RPCs.
create function public.list_product_family_variants(p_family uuid, p_page integer default 1)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare result jsonb := '[]'::jsonb; p public.products%rowtype;
begin
  if p_page < 1 or p_page > 100000 or p_page is null then raise exception 'VARIANT_PAGE_INVALID'; end if;
  for p in select * from public.products where family_id=p_family order by id
    limit 25 offset (p_page-1)*25 for share
  loop
    result := result || jsonb_build_array(jsonb_build_object(
      'id',p.id,'name',p.name,'sku',p.sku,'stock',p.stock,'cost',p.cost,'price',p.price,'status',p.status,
      'family_id',p.family_id,'variant_choices',p.variant_choices,'list_price_override',p.list_price_override,
      'web_visible',p.web_visible,'commercial_blocked',p.commercial_blocked,
      'version',public.get_product_save_version(p.id)));
  end loop;
  return result;
end $$;
revoke all on function public.list_product_family_variants(uuid,integer) from public,anon,authenticated;
grant execute on function public.list_product_family_variants(uuid,integer) to service_role;

-- Additional defense for NEW order lines. Never rewrites checkout/store-sale RPCs,
-- old lines, held reservations, payment confirmations or expiry/release transitions.
create function public.guard_variant_new_sale() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare p public.products%rowtype; c text; h boolean;
begin
  if new.product_id is null then return new; end if;
  select * into strict p from public.products where id=new.product_id for share;
  select channel,historical_import into c,h from public.orders where id=new.order_id;
  if coalesce(h,false) then return new; end if;
  if p.commercial_blocked then raise exception 'VARIANT_COMMERCIALLY_BLOCKED'; end if;
  if c = 'web' and not p.web_visible then raise exception 'VARIANT_NOT_WEB_VISIBLE'; end if;
  return new;
end $$;
create trigger guard_variant_new_sale before insert on public.order_items for each row execute function public.guard_variant_new_sale();
-- Also covers an old physical-sale draft whose SKU was blocked after line creation.
-- Checkout payment confirmation updates the existing reservation movement, and releases
-- add units: neither path is intercepted or cancelled by this guard.
create function public.guard_variant_stock_sale() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare blocked boolean;
begin
  if new.movement_type in ('sale','reservation') and new.new_stock < new.previous_stock then
    select commercial_blocked into blocked from public.products where id=new.product_id for share;
    if blocked then raise exception 'VARIANT_COMMERCIALLY_BLOCKED'; end if;
  end if;
  return new;
end $$;
create trigger guard_variant_stock_sale before insert on public.inventory_movements
for each row execute function public.guard_variant_stock_sale();
revoke all on function public.guard_variant_stock_sale() from public,anon,authenticated;
grant execute on function public.guard_variant_stock_sale() to service_role;


alter table public.product_families enable row level security;
alter table public.product_family_options enable row level security;
alter table public.product_family_option_values enable row level security;
revoke all on public.product_families,public.product_family_options,public.product_family_option_values from public,anon,authenticated;
grant select,insert,update on public.product_families to service_role;
grant select,insert on public.product_family_options,public.product_family_option_values to service_role;
grant select (web_visible,commercial_blocked) on public.products to anon,authenticated;
grant select,update (family_id,variant_choices,list_price_override,web_visible,commercial_blocked) on public.products to service_role;
-- No SECURITY DEFINER: callers cannot acquire the owner's privileges.
revoke all on function public.lock_variant_catalog(),public.validate_product_variant(),public.protect_family_definition(),public.propagate_family_price(),public.update_family_inherited_prices(),public.guard_variant_new_sale() from public,anon,authenticated;
revoke all on function public.save_product_family(uuid,bigint,text,text,uuid,numeric),public.add_product_family_option(uuid,text,text[]),public.add_product_family_value(uuid,text),public.configure_product_variant(uuid,uuid,text,jsonb,numeric,boolean,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.lock_variant_catalog(),public.validate_product_variant(),public.protect_family_definition(),public.propagate_family_price(),public.update_family_inherited_prices(),public.guard_variant_new_sale(),public.save_product_family(uuid,bigint,text,text,uuid,numeric),public.add_product_family_option(uuid,text,text[]),public.add_product_family_value(uuid,text),public.configure_product_variant(uuid,uuid,text,jsonb,numeric,boolean,boolean,jsonb) to service_role;
commit;
