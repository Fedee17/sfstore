-- Phase A only: no existing rows, triggers or Storage objects are modified.
begin;

-- product_id intentionally has no FK: uploads can be prepared before a product exists.
create table public.product_save_operations (
  operation_key uuid primary key,
  operation_type text not null check (operation_type in ('create_product', 'update_product')),
  product_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'prepared' check (status in ('prepared', 'committed', 'aborted')),
  result jsonb,
  recovery_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(recovery_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'committed' and result is not null) or (status <> 'committed' and result is null)),
  unique (operation_key, product_id)
);
create index product_save_operations_product_idx on public.product_save_operations(product_id, created_at);
create index product_save_operations_pending_idx on public.product_save_operations(created_at)
  where status = 'prepared';

create table public.product_storage_tasks (
  id uuid primary key default gen_random_uuid(),
  operation_key uuid not null,
  product_id uuid not null,
  action text not null check (action in ('delete_object', 'reconcile')),
  bucket text not null default 'product-images' check (bucket = 'product-images'),
  storage_path text not null check (
    storage_path <> '' and storage_path !~ '(^/|(^|/)\.\.(/|$)|[?#])'
  ),
  image_id uuid,
  expected_metadata jsonb not null check (
    jsonb_typeof(expected_metadata) = 'object'
    and expected_metadata ? 'path'
    and expected_metadata ->> 'path' = storage_path
  ),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (operation_key, product_id)
    references public.product_save_operations(operation_key, product_id) on delete restrict,
  unique (operation_key, action, storage_path)
);
create index product_storage_tasks_pending_idx on public.product_storage_tasks(status, created_at)
  where status in ('pending', 'failed');

alter table public.product_save_operations enable row level security;
alter table public.product_storage_tasks enable row level security;
revoke all on public.product_save_operations, public.product_storage_tasks from public, anon, authenticated, service_role;
grant select, insert, update on public.product_save_operations, public.product_storage_tasks to service_role;
create trigger product_save_operations_updated_at before update on public.product_save_operations
  for each row execute function public.set_updated_at();
create trigger product_storage_tasks_updated_at before update on public.product_storage_tasks
  for each row execute function public.set_updated_at();

-- An opaque aggregate version catches legacy gallery/attribute writes without changing updated_at.
-- VOLATILE is deliberate: the result must see writes made earlier by the atomic RPC.
create function public.get_product_save_version(p_product_id uuid)
returns text language sql volatile security invoker set search_path = pg_catalog, public set timezone = 'UTC' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'product', to_jsonb(p),
    'attributes', coalesce((select jsonb_agg(to_jsonb(a) order by a.id)
      from public.product_attributes a where a.product_id = p.id), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(to_jsonb(i) order by i.id)
      from public.product_images i where i.product_id = p.id), '[]'::jsonb)
  )::text, 'UTF8')), 'hex') from public.products p where p.id = p_product_id;
$$;

create function public.prepare_product_save_operation(
  p_operation_key uuid, p_operation_type text, p_product_id uuid,
  p_payload jsonb, p_expected_version text default null
)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_hash text;
  v_operation public.product_save_operations%rowtype;
begin
  if p_operation_key is null or p_product_id is null
    or p_operation_type is null or p_operation_type not in ('create_product', 'update_product')
    or jsonb_typeof(p_payload) is distinct from 'object'
    or (p_operation_type = 'update_product' and (p_expected_version is null or p_expected_version !~ '^[0-9a-f]{64}$'))
    or (p_operation_type = 'create_product' and p_expected_version is not null) then
    raise exception 'PRODUCT_INVALID_OPERATION';
  end if;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'operation_type', p_operation_type, 'product_id', p_product_id,
    'expected_version', p_expected_version, 'payload', p_payload
  )::text, 'UTF8')), 'hex');
  insert into public.product_save_operations(operation_key, operation_type, product_id, payload_hash)
    values (p_operation_key, p_operation_type, p_product_id, v_hash)
    on conflict (operation_key) do nothing;
  select * into v_operation from public.product_save_operations
    where operation_key = p_operation_key for update;
  if v_operation.payload_hash <> v_hash or v_operation.product_id <> p_product_id
    or v_operation.operation_type <> p_operation_type then
    raise exception 'PRODUCT_IDEMPOTENCY_CONFLICT';
  end if;
  if v_operation.status = 'aborted' then raise exception 'PRODUCT_OPERATION_ABORTED'; end if;
  return to_jsonb(v_operation);
end;
$$;

-- The row lock waits for an in-flight save to commit/rollback before reporting its state.
create function public.resolve_product_save_operation(p_operation_key uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_operation public.product_save_operations%rowtype;
begin
  select * into v_operation from public.product_save_operations
    where operation_key = p_operation_key for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return to_jsonb(v_operation);
end;
$$;

-- Fence a prepared operation before compensating uploads. A committed save cannot be aborted.
create function public.abort_product_save_operation(p_operation_key uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_operation public.product_save_operations%rowtype;
begin
  select * into v_operation from public.product_save_operations
    where operation_key = p_operation_key for update;
  if not found then raise exception 'PRODUCT_OPERATION_NOT_FOUND'; end if;
  if v_operation.status = 'committed' then raise exception 'PRODUCT_OPERATION_ALREADY_COMMITTED'; end if;
  update public.product_save_operations set status = 'aborted'
    where operation_key = p_operation_key returning * into v_operation;
  return to_jsonb(v_operation);
end;
$$;

create function public.enqueue_product_storage_task(
  p_operation_key uuid, p_product_id uuid, p_action text, p_storage_path text,
  p_expected_metadata jsonb, p_image_id uuid default null
)
returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_task public.product_storage_tasks%rowtype;
begin
  if p_action is null or p_action not in ('delete_object', 'reconcile')
    or p_storage_path is null or p_storage_path = ''
    or p_storage_path ~ '(^/|(^|/)\.\.(/|$)|[?#])'
    or jsonb_typeof(p_expected_metadata) is distinct from 'object'
    or p_expected_metadata ->> 'path' is distinct from p_storage_path
    or exists (select 1 from jsonb_object_keys(p_expected_metadata) k
      where k not in ('path', 'etag', 'content_hash', 'size', 'mime'))
    or (p_expected_metadata ? 'size' and (
      jsonb_typeof(p_expected_metadata->'size') <> 'number'
      or (p_expected_metadata->>'size')::numeric <= 0
      or (p_expected_metadata->>'size')::numeric <> trunc((p_expected_metadata->>'size')::numeric)))
    or (p_expected_metadata ? 'mime' and nullif(p_expected_metadata->>'mime', '') is null) then
    raise exception 'PRODUCT_INVALID_STORAGE_TASK';
  end if;
  if p_action = 'delete_object' and exists (select 1 from public.product_images i
    where split_part(i.url, '/storage/v1/object/public/product-images/', 2) = p_storage_path) then
    raise exception 'PRODUCT_STORAGE_DELETE_NOT_UNREFERENCED';
  end if;
  insert into public.product_storage_tasks(operation_key, product_id, action, storage_path, expected_metadata, image_id)
    values (p_operation_key, p_product_id, p_action, p_storage_path, p_expected_metadata, p_image_id)
    on conflict (operation_key, action, storage_path) do nothing;
  select * into v_task from public.product_storage_tasks
    where operation_key = p_operation_key and action = p_action and storage_path = p_storage_path for update;
  if v_task.product_id <> p_product_id or v_task.expected_metadata <> p_expected_metadata
    or v_task.image_id is distinct from p_image_id then
    raise exception 'PRODUCT_STORAGE_TASK_CONFLICT';
  end if;
  return v_task.id;
end;
$$;

-- Private shared implementation; exposed create/update entry points remain separate.
create function public.save_product_atomic_internal(
  p_operation_key uuid, p_operation_type text, p_product_id uuid,
  p_expected_version text, p_payload jsonb
)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_operation jsonb;
  v_old public.products%rowtype;
  v_product public.products%rowtype;
  v_category_slug text;
  v_attributes jsonb;
  v_images jsonb;
  v_tasks jsonb;
  v_attribute jsonb;
  v_image jsonb;
  v_removed jsonb;
  v_task jsonb;
  v_result jsonb;
  v_primary uuid;
  v_allowed jsonb;
  v_name text;
  v_value text;
  v_path text;
  v_index integer;
  v_managed text[] := array['Marca', 'Tipo', U&'Categor\00EDa comercial',
    'commercial_category', 'olfactory_family', 'intensity', 'occasion', 'gender',
    'mate_type', 'material', 'color', 'use_case'];
begin
  v_operation := public.prepare_product_save_operation(
    p_operation_key, p_operation_type, p_product_id, p_payload, p_expected_version);
  if v_operation->>'status' = 'committed' then return v_operation->'result'; end if;
  if p_product_id = '05b34469-3eb8-4148-8e97-9a19f1c2df6e'::uuid then
    raise exception 'PRODUCT_NOT_OPERATIONAL';
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload) k
    where k not in ('product', 'attributes', 'images', 'storage_tasks'))
    or jsonb_typeof(p_payload->'product') is distinct from 'object' then
    raise exception 'PRODUCT_INVALID_PAYLOAD';
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload->'product') k
    where k not in ('category_id', 'name', 'slug', 'short_description', 'description',
      'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status'))
    or not ((p_payload->'product') ?& array['category_id', 'name', 'slug', 'short_description', 'description',
      'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status']) then
    raise exception 'PRODUCT_INVALID_FIELDS';
  end if;
  foreach v_name in array array['price', 'transfer_price', 'compare_at_price', 'cost'] loop
    if p_payload->'product' ? v_name and p_payload->'product'->v_name <> 'null'::jsonb
      and (jsonb_typeof(p_payload->'product'->v_name) <> 'number'
        or (p_payload->'product'->>v_name)::numeric < 0) then
      raise exception 'PRODUCT_INVALID_MONEY';
    end if;
  end loop;
  if jsonb_typeof(p_payload->'product'->'featured') <> 'boolean' then
    raise exception 'PRODUCT_INVALID_FIELDS';
  end if;
  v_product := jsonb_populate_record(null::public.products, p_payload->'product');
  if nullif(btrim(v_product.name), '') is null or nullif(btrim(v_product.slug), '') is null
    or v_product.category_id is null or v_product.short_description is null
    or v_product.price is null or v_product.status is null
    or v_product.status not in ('draft', 'active', 'archived') then
    raise exception 'PRODUCT_INVALID_FIELDS';
  end if;
  select slug into v_category_slug from public.categories where id = v_product.category_id;
  if not found then raise exception 'PRODUCT_CATEGORY_NOT_FOUND'; end if;

  if p_operation_type = 'update_product' then
    select * into v_old from public.products where id = p_product_id for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_old.historical_identity then raise exception 'HISTORICAL_PRODUCT_IDENTITY_IMMUTABLE'; end if;
    perform id from public.product_attributes where product_id = p_product_id order by id for update;
    perform id from public.product_images where product_id = p_product_id order by id for update;
    if public.get_product_save_version(p_product_id) is distinct from p_expected_version then
      raise exception 'PRODUCT_STALE_VERSION';
    end if;
    update public.products set
      category_id = v_product.category_id, name = v_product.name, slug = v_product.slug,
      short_description = v_product.short_description, description = v_product.description,
      price = v_product.price, transfer_price = v_product.transfer_price,
      compare_at_price = v_product.compare_at_price, cost = v_product.cost,
      sku = v_product.sku, featured = v_product.featured, status = v_product.status,
      cost_source_purchase_item_id = case when cost is distinct from v_product.cost
        then null else cost_source_purchase_item_id end
      where id = p_product_id;
  else
    insert into public.products(id, category_id, name, slug, short_description, description,
      price, transfer_price, compare_at_price, cost, sku, featured, status)
    values (p_product_id, v_product.category_id, v_product.name, v_product.slug,
      v_product.short_description, v_product.description, v_product.price, v_product.transfer_price,
      v_product.compare_at_price, v_product.cost, v_product.sku, v_product.featured, v_product.status);
  end if;

  v_attributes := coalesce(p_payload->'attributes', '[]'::jsonb);
  if jsonb_typeof(v_attributes) <> 'array' then raise exception 'PRODUCT_INVALID_ATTRIBUTES'; end if;
  v_allowed := case v_category_slug
    when 'perfumes' then '{"commercial_category":["arabe","disenador","nicho","inspirado","otro"],"olfactory_family":["dulce","fresco","frutal","citrico","amaderado","especiado","ambarado","floral","aromatico","acuatico","gourmand","cuero"],"intensity":["suave","media","intensa"],"occasion":["diario","trabajo","salida","cita","noche","evento","regalo"],"gender":["masculino","femenino","unisex"]}'::jsonb
    when 'mates' then '{"mate_type":["imperial","camionero","torpedo","criollo","algarrobo"],"material":["cuero","calabaza","algarrobo","acero","alpaca"],"color":["negro","borravino","suela","marron","animal-print","natural"],"use_case":["uso-diario","para-regalar","premium"]}'::jsonb
    else '{}'::jsonb end;
  for v_attribute in select value from jsonb_array_elements(v_attributes) loop
    if jsonb_typeof(v_attribute) <> 'object' or exists (select 1 from jsonb_object_keys(v_attribute) k
      where k not in ('name', 'value', 'sort_order'))
      or jsonb_typeof(v_attribute->'name') is distinct from 'string'
      or jsonb_typeof(v_attribute->'value') is distinct from 'string' then
      raise exception 'PRODUCT_INVALID_ATTRIBUTE';
    end if;
    v_name := v_attribute->>'name'; v_value := v_attribute->>'value';
    if nullif(btrim(v_value), '') is null or
      (v_name not in ('Marca', 'Tipo') and not coalesce((v_allowed->v_name) ? v_value, false)) then
      raise exception 'PRODUCT_INVALID_ATTRIBUTE';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(v_attributes) a
    group by a->>'name', a->>'value' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(v_attributes) a
      where a->>'name' not in ('olfactory_family', 'occasion', 'material', 'use_case')
      group by a->>'name' having count(*) > 1) then
    raise exception 'PRODUCT_DUPLICATE_ATTRIBUTE';
  end if;
  delete from public.product_attributes where product_id = p_product_id and name = any(v_managed);
  insert into public.product_attributes(product_id, name, value, sort_order)
    select p_product_id, value->>'name', value->>'value',
      coalesce((value->>'sort_order')::integer, (ordinality - 1)::integer)
    from jsonb_array_elements(v_attributes) with ordinality;

  -- Missing/null images preserves the gallery; [] explicitly removes all metadata.
  v_images := p_payload->'images';
  v_tasks := coalesce(p_payload->'storage_tasks', '[]'::jsonb);
  if jsonb_typeof(v_tasks) <> 'array' then raise exception 'PRODUCT_INVALID_STORAGE_TASK'; end if;
  if v_images is not null and v_images <> 'null'::jsonb then
    if jsonb_typeof(v_images) <> 'array' then raise exception 'PRODUCT_INVALID_IMAGES'; end if;
    for v_image in select value from jsonb_array_elements(v_images) loop
      if jsonb_typeof(v_image) <> 'object' or exists (select 1 from jsonb_object_keys(v_image) k
        where k not in ('id', 'url', 'alt', 'is_primary', 'path', 'etag', 'content_hash', 'size', 'mime'))
        or nullif(v_image->>'id', '') is null or nullif(v_image->>'url', '') is null
        or (v_image ? 'is_primary' and jsonb_typeof(v_image->'is_primary') <> 'boolean') then
        raise exception 'PRODUCT_INVALID_IMAGE';
      end if;
      if exists (select 1 from public.product_images where id = (v_image->>'id')::uuid
        and (product_id <> p_product_id or url <> v_image->>'url')) then
        raise exception 'PRODUCT_IMAGE_ID_CONFLICT';
      end if;
      if not exists (select 1 from public.product_images where id = (v_image->>'id')::uuid) then
        v_path := v_image->>'path';
        if v_path is null or v_path not like 'products/' || p_product_id::text || '/%'
          or v_path ~ '(^/|(^|/)\.\.(/|$)|[?#])'
          or v_image->>'url' not like 'https://%/storage/v1/object/public/product-images/' || v_path
          or jsonb_typeof(v_image->'size') is distinct from 'number'
          or (v_image->>'size')::numeric <= 0 or (v_image->>'size')::numeric > 5242880
          or (v_image->>'size')::numeric <> trunc((v_image->>'size')::numeric)
          or v_image->>'mime' is null or v_image->>'mime' not in ('image/jpeg', 'image/png', 'image/webp') then
          raise exception 'PRODUCT_INVALID_IMAGE_MANIFEST';
        end if;
      end if;
    end loop;
    if exists (select 1 from jsonb_array_elements(v_images) i group by (i->>'id')::uuid having count(*) > 1)
      or exists (select 1 from jsonb_array_elements(v_images) i group by i->>'url' having count(*) > 1)
      or exists (select 1 from jsonb_array_elements(v_images) i
        where coalesce(i->>'path', nullif(split_part(i->>'url', '/storage/v1/object/public/product-images/', 2), '')) is not null
        group by coalesce(i->>'path', nullif(split_part(i->>'url', '/storage/v1/object/public/product-images/', 2), ''))
        having count(*) > 1)
      or exists (select 1 from jsonb_array_elements(v_images) i where nullif(i->>'content_hash', '') is not null
        group by i->>'content_hash', i->>'size', i->>'mime' having count(*) > 1)
      or (select count(*) from jsonb_array_elements(v_images) i where (i->>'is_primary')::boolean) > 1 then
      raise exception 'PRODUCT_DUPLICATE_IMAGE_OR_PRIMARY';
    end if;
    select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_removed from public.product_images i
      where product_id = p_product_id
        and not exists (select 1 from jsonb_array_elements(v_images) x where (x->>'id')::uuid = i.id);
    -- Every removed managed object needs a durable task unless another/final image still uses its URL.
    for v_image in select value from jsonb_array_elements(v_removed) loop
      v_path := split_part(v_image->>'url', '/storage/v1/object/public/product-images/', 2);
      if v_path <> ''
        and not exists (select 1 from public.product_images i where i.product_id <> p_product_id and i.url = v_image->>'url')
        and not exists (select 1 from jsonb_array_elements(v_images) x where x->>'url' = v_image->>'url')
        and not exists (select 1 from jsonb_array_elements(v_tasks) t where t->>'path' = v_path) then
        raise exception 'PRODUCT_STORAGE_TASK_REQUIRED';
      end if;
    end loop;
    delete from public.product_images where product_id = p_product_id
      and not exists (select 1 from jsonb_array_elements(v_images) x where (x->>'id')::uuid = id);
    select (value->>'id')::uuid into v_primary from jsonb_array_elements(v_images)
      with ordinality order by coalesce((value->>'is_primary')::boolean, false) desc, ordinality limit 1;
    v_index := 0;
    for v_image in select value from jsonb_array_elements(v_images) with ordinality order by ordinality loop
      insert into public.product_images(id, product_id, url, alt, sort_order, is_primary)
        values ((v_image->>'id')::uuid, p_product_id, v_image->>'url', v_image->>'alt', v_index,
          (v_image->>'id')::uuid = v_primary)
        on conflict (id) do update set alt = excluded.alt, sort_order = excluded.sort_order,
          is_primary = excluded.is_primary
        where public.product_images.product_id = excluded.product_id
          and public.product_images.url = excluded.url;
      if not found then raise exception 'PRODUCT_IMAGE_ID_CONFLICT'; end if;
      v_index := v_index + 1;
    end loop;
  end if;
  if exists (select 1 from public.product_images where product_id = p_product_id
    group by product_id having count(*) filter (where is_primary) <> 1)
    or exists (select 1 from (select sort_order,
      (row_number() over (order by sort_order, created_at, id) - 1)::integer as expected_order
      from public.product_images where product_id = p_product_id) ordered
      where sort_order <> expected_order) then
    raise exception 'PRODUCT_GALLERY_REQUIRES_RECONCILIATION';
  end if;
  for v_task in select value from jsonb_array_elements(v_tasks) loop
    if jsonb_typeof(v_task) <> 'object' or exists (select 1 from jsonb_object_keys(v_task) k
      where k not in ('action', 'path', 'image_id', 'expected_metadata')) then
      raise exception 'PRODUCT_INVALID_STORAGE_TASK';
    end if;
    if v_task->>'action' = 'delete_object' and (
      v_removed is null or not exists (select 1 from jsonb_array_elements(v_removed) i
        where split_part(i->>'url', '/storage/v1/object/public/product-images/', 2) = v_task->>'path')
      or exists (select 1 from public.product_images i
        where split_part(i.url, '/storage/v1/object/public/product-images/', 2) = v_task->>'path')) then
      raise exception 'PRODUCT_STORAGE_DELETE_NOT_UNREFERENCED';
    end if;
    perform public.enqueue_product_storage_task(p_operation_key, p_product_id,
      v_task->>'action', v_task->>'path', v_task->'expected_metadata', (v_task->>'image_id')::uuid);
  end loop;
  select * into v_product from public.products where id = p_product_id;
  v_result := jsonb_build_object('operation_key', p_operation_key, 'product_id', p_product_id,
    'operation_type', p_operation_type, 'version', public.get_product_save_version(p_product_id),
    'product', jsonb_build_object('id', v_product.id, 'slug', v_product.slug, 'status', v_product.status,
      'category_id', v_product.category_id, 'updated_at', v_product.updated_at),
    'attributes_count', (select count(*) from public.product_attributes where product_id = p_product_id),
    'images_count', (select count(*) from public.product_images where product_id = p_product_id),
    'storage_tasks_count', (select count(*) from public.product_storage_tasks where operation_key = p_operation_key));
  update public.product_save_operations set status = 'committed', result = v_result
    where operation_key = p_operation_key;
  return v_result;
end;
$$;

create function public.create_product_atomic(p_operation_key uuid, p_product_id uuid, p_payload jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public as $$
  select public.save_product_atomic_internal(p_operation_key, 'create_product', p_product_id, null, p_payload);
$$;
create function public.update_product_atomic(
  p_operation_key uuid, p_product_id uuid, p_expected_version text, p_payload jsonb
)
returns jsonb language sql security invoker set search_path = pg_catalog, public as $$
  select public.save_product_atomic_internal(p_operation_key, 'update_product', p_product_id, p_expected_version, p_payload);
$$;

revoke all on function public.get_product_save_version(uuid) from public, anon, authenticated;
revoke all on function public.prepare_product_save_operation(uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.resolve_product_save_operation(uuid) from public, anon, authenticated;
revoke all on function public.abort_product_save_operation(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_product_storage_task(uuid, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.save_product_atomic_internal(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_product_atomic(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.update_product_atomic(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.get_product_save_version(uuid) to service_role;
grant execute on function public.prepare_product_save_operation(uuid, text, uuid, jsonb, text) to service_role;
grant execute on function public.resolve_product_save_operation(uuid) to service_role;
grant execute on function public.abort_product_save_operation(uuid) to service_role;
grant execute on function public.enqueue_product_storage_task(uuid, uuid, text, text, jsonb, uuid) to service_role;
grant execute on function public.save_product_atomic_internal(uuid, text, uuid, text, jsonb) to service_role;
grant execute on function public.create_product_atomic(uuid, uuid, jsonb) to service_role;
grant execute on function public.update_product_atomic(uuid, uuid, text, jsonb) to service_role;

commit;
