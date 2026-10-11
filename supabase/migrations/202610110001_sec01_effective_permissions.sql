-- SEC-01 candidate. LOCAL VALIDATION ONLY until reviewed alongside PAY-01.
-- Applying this intentionally denies the legacy anonymous checkout inserts.
-- No business rows, Storage objects, roles or credentials are changed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = r and not rolsuper and not rolbypassrls) then
      raise exception 'SEC01_UNSAFE_OR_MISSING_ROLE:%', r;
    end if;
    if exists (select 1 from pg_roles trusted where (trusted.rolsuper or trusted.rolbypassrls)
      and pg_has_role(r, trusted.oid, 'MEMBER')) then
      raise exception 'SEC01_PRIVILEGED_ROLE_MEMBERSHIP:%', r;
    end if;
  end loop;
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls) then
    raise exception 'SEC01_SERVICE_ROLE_MUST_BYPASS_RLS';
  end if;
  if not exists (select 1 from pg_class where oid = to_regclass('storage.objects') and relrowsecurity) then
    raise exception 'SEC01_STORAGE_OBJECTS_RLS_REQUIRED';
  end if;
  if exists (select 1 from pg_class c join pg_roles r on r.oid = c.relowner
    where c.oid = to_regclass('storage.objects') and r.rolname in ('anon', 'authenticated')) then
    raise exception 'SEC01_UNTRUSTED_STORAGE_OWNER';
  end if;
  if exists (select 1 from pg_class c where c.oid = to_regclass('storage.objects')
    and (pg_has_role('anon', c.relowner, 'MEMBER') or pg_has_role('authenticated', c.relowner, 'MEMBER'))) then
    raise exception 'SEC01_STORAGE_OWNER_MEMBERSHIP';
  end if;
end $$;

-- Untrusted roles must not create objects used by application functions.
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  t text;
  cols text;
begin
  foreach t in array array[
    'categories', 'products', 'product_images', 'product_attributes',
    'customers', 'orders', 'order_items', 'settings', 'inventory_movements', 'analytics_events',
    'suppliers', 'purchases', 'purchase_items', 'order_payments',
    'historical_import_batches', 'historical_import_records', 'product_save_operations', 'product_storage_tasks'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception 'SEC01_MISSING_REQUIRED_TABLE:%', t;
    end if;
    if exists (select 1 from pg_class c join pg_roles r on r.oid = c.relowner
      where c.oid = to_regclass(format('public.%I', t)) and r.rolname in ('anon', 'authenticated')) then
      raise exception 'SEC01_UNTRUSTED_TABLE_OWNER:%', t;
    end if;
    if exists (select 1 from pg_class c where c.oid = to_regclass(format('public.%I', t))
      and (pg_has_role('anon', c.relowner, 'MEMBER') or pg_has_role('authenticated', c.relowner, 'MEMBER'))) then
      raise exception 'SEC01_TABLE_OWNER_MEMBERSHIP:%', t;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', t);
    -- Table REVOKE alone leaves legacy column-level grants in place.
    select string_agg(quote_ident(attname), ', ' order by attnum) into cols
      from pg_attribute where attrelid = to_regclass(format('public.%I', t))
      and attnum > 0 and not attisdropped;
    execute format('revoke all privileges (%s) on table public.%I from public, anon, authenticated', cols, t);
    if t not in ('categories', 'products', 'product_images', 'product_attributes') then
      execute format('drop policy if exists sec01_private_boundary on public.%I', t);
      execute format('create policy sec01_private_boundary on public.%I as restrictive for all
        to anon, authenticated using (false) with check (false)', t);
    end if;
  end loop;
end $$;

-- Match the explicit projection consumed by services/products.ts. In particular,
-- no product cost, supplier source, SKU or historical audit fields are public.
grant select (id, name, slug, is_active) on public.categories to anon, authenticated;
grant select (id, name, slug, short_description, description, price, transfer_price,
  stock, featured, status, historical_identity, category_id) on public.products to anon, authenticated;
grant select (product_id, url, alt, sort_order, is_primary) on public.product_images to anon, authenticated;
grant select (product_id, name, value, sort_order) on public.product_attributes to anon, authenticated;

-- Existing server operations use these base tables. Preserve narrower existing
-- grants on payments, purchases, audit logs and Storage task queues.
grant select, insert, update, delete on public.categories, public.products,
  public.product_images, public.product_attributes, public.customers,
  public.orders, public.order_items, public.settings to service_role;
grant select, insert on public.inventory_movements, public.analytics_events to service_role;
grant select, insert, update on public.suppliers, public.purchases to service_role;
grant select, insert, update, delete on public.purchase_items to service_role;

do $$
declare
  t text;
  predicate text;
begin
  foreach t in array array['categories', 'products', 'product_images', 'product_attributes'] loop
    predicate := case t
      when 'categories' then 'is_active and slug <> '''''
      when 'products' then $p$status = 'active' and not historical_identity
        and slug <> 'perfume-yara-rosa' and id <> '05b34469-3eb8-4148-8e97-9a19f1c2df6e'::uuid
        and exists (select 1 from public.categories c where c.id = category_id and c.is_active and c.slug <> '')$p$
      else 'exists (select 1 from public.products p where p.id = product_id)'
    end;
    execute format('drop policy if exists sec01_catalog_read on public.%I', t);
    execute format('create policy sec01_catalog_read on public.%I for select
      to anon, authenticated using (%s)', t, predicate);
    -- Restrictive guard prevents an old permissive USING(true) from exposing rows.
    execute format('drop policy if exists sec01_catalog_visibility on public.%I', t);
    execute format('create policy sec01_catalog_visibility on public.%I as restrictive for select
      to anon, authenticated using (%s)', t, predicate);
    execute format('drop policy if exists sec01_catalog_insert_denied on public.%I', t);
    execute format('create policy sec01_catalog_insert_denied on public.%I as restrictive for insert
      to anon, authenticated with check (false)', t);
    execute format('drop policy if exists sec01_catalog_update_denied on public.%I', t);
    execute format('create policy sec01_catalog_update_denied on public.%I as restrictive for update
      to anon, authenticated using (false) with check (false)', t);
    execute format('drop policy if exists sec01_catalog_delete_denied on public.%I', t);
    execute format('create policy sec01_catalog_delete_denied on public.%I as restrictive for delete
      to anon, authenticated using (false)', t);
  end loop;
end $$;

-- Service-role uploads only. This guards listing/mutation of this bucket even
-- if an old authenticated-wide policy exists. Public URL downloads in Supabase
-- bypass object SELECT RLS for a public bucket: they are not revoked here.
drop policy if exists sec01_product_images_server_only on storage.objects;
create policy sec01_product_images_server_only on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'product-images') with check (bucket_id <> 'product-images');

-- Explicit application inventory, including every overload; extension functions
-- and unrelated schemas are untouched. Trigger execution keeps working.
do $$
declare
  f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    and p.proname = any(array[
      'set_updated_at', 'save_purchase_draft', 'cancel_purchase_draft', 'confirm_purchase',
      'prevent_confirmed_purchase_mutation', 'prevent_confirmed_purchase_item_mutation',
      'adjust_inventory_stock', 'apply_sale_inventory', 'record_order_payment',
      'create_store_sale', 'complete_store_sale', 'save_customer_order', 'transition_customer_order', 'deliver_order',
      'historical_import_context_enabled', 'prevent_historical_product_identity_mutation',
      'prevent_historical_order_mutation', 'prevent_historical_order_item_mutation',
      'prevent_historical_inventory_movement', 'prevent_historical_import_audit_mutation',
      'import_historical_purchase', 'import_historical_sale', 'create_store_sale_atomic', 'record_store_sale_payment_atomic',
      'delete_product_image_metadata', 'restore_product_image_metadata', 'get_product_save_version',
      'prepare_product_save_operation', 'resolve_product_save_operation', 'abort_product_save_operation',
      'enqueue_product_storage_task', 'save_product_atomic_internal', 'create_product_atomic', 'update_product_atomic',
      'delete_product_image_metadata_and_queue'
    ]) loop
    execute format('revoke all privileges on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
    if has_function_privilege('anon', f.signature, 'EXECUTE')
      or has_function_privilege('authenticated', f.signature, 'EXECUTE') then
      raise exception 'SEC01_INHERITED_FUNCTION_ACCESS:%', f.signature;
    end if;
  end loop;
end $$;

-- Reject inherited grants that explicit REVOKEs cannot neutralize; rollback the
-- whole candidate rather than pretending the resulting matrix is safe.
do $$
declare
  r text;
  c record;
  a record;
  allowed_columns text[];
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_schema_privilege(r, 'public', 'CREATE') then
      raise exception 'SEC01_INHERITED_SCHEMA_CREATE:%', r;
    end if;
    for c in select gc.oid, gc.relname from pg_class gc join pg_namespace n on n.oid = gc.relnamespace
      where n.nspname = 'public' and gc.relname = any(array[
        'categories', 'products', 'product_images', 'product_attributes', 'customers', 'orders', 'order_items',
        'settings', 'inventory_movements', 'analytics_events', 'suppliers', 'purchases', 'purchase_items',
        'order_payments', 'historical_import_batches', 'historical_import_records', 'product_save_operations', 'product_storage_tasks'
      ]) loop
      if has_table_privilege(r, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(r, c.oid, 'INSERT,UPDATE,REFERENCES')
        or (c.relname not in ('categories', 'products', 'product_images', 'product_attributes')
          and has_any_column_privilege(r, c.oid, 'SELECT')) then
        raise exception 'SEC01_INHERITED_TABLE_ACCESS:%:%', r, c.relname;
      end if;
    end loop;
    for c in select oid, relname from pg_class where oid in (
      'public.categories'::regclass, 'public.products'::regclass,
      'public.product_images'::regclass, 'public.product_attributes'::regclass) loop
      allowed_columns := case c.relname
        when 'categories' then array['id','name','slug','is_active']
        when 'products' then array['id','name','slug','short_description','description','price','transfer_price',
          'stock','featured','status','historical_identity','category_id']
        when 'product_images' then array['product_id','url','alt','sort_order','is_primary']
        else array['product_id','name','value','sort_order'] end;
      for a in select attnum, attname from pg_attribute where attrelid = c.oid and attnum > 0 and not attisdropped loop
        if not (a.attname = any(allowed_columns)) and has_column_privilege(r, c.oid, a.attnum, 'SELECT') then
          raise exception 'SEC01_INHERITED_CATALOG_COLUMN_ACCESS:%:%.%', r, c.relname, a.attname;
        end if;
      end loop;
    end loop;
  end loop;
end $$;
commit;
