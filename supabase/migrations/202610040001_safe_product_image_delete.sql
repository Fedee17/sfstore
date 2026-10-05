begin;

create or replace function delete_product_image_metadata(
  p_product_id uuid,
  p_image_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_image product_images%rowtype;
  v_next_primary_id uuid;
  v_remaining_images integer;
  v_remaining_url_references integer;
begin
  perform id
  from products
  where id = p_product_id
    and historical_identity = false
  for update;

  if not found then
    raise exception 'Product not found or historical identities cannot be modified';
  end if;

  perform id
  from product_images
  where product_id = p_product_id
  order by sort_order, created_at, id
  for update;

  select *
  into v_image
  from product_images
  where id = p_image_id
    and product_id = p_product_id;

  if not found then
    raise exception 'Product image not found';
  end if;

  perform id
  from product_images
  where url = v_image.url
  for update;

  delete from product_images
  where id = p_image_id
    and product_id = p_product_id;

  with ordered as (
    select
      id,
      (row_number() over (order by sort_order, created_at, id) - 1)::integer as normalized_order
    from product_images
    where product_id = p_product_id
  )
  update product_images as image
  set sort_order = ordered.normalized_order
  from ordered
  where image.id = ordered.id
    and image.sort_order is distinct from ordered.normalized_order;

  select id
  into v_next_primary_id
  from product_images
  where product_id = p_product_id
  order by sort_order, created_at, id
  limit 1;

  if v_next_primary_id is not null then
    update product_images
    set is_primary = (id = v_next_primary_id)
    where product_id = p_product_id
      and is_primary is distinct from (id = v_next_primary_id);
  end if;

  select count(*)::integer
  into v_remaining_images
  from product_images
  where product_id = p_product_id;

  select count(*)::integer
  into v_remaining_url_references
  from product_images
  where url = v_image.url;

  return jsonb_build_object(
    'id', v_image.id,
    'product_id', v_image.product_id,
    'url', v_image.url,
    'alt', v_image.alt,
    'sort_order', v_image.sort_order,
    'is_primary', v_image.is_primary,
    'created_at', v_image.created_at,
    'updated_at', v_image.updated_at,
    'remaining_images', v_remaining_images,
    'remaining_url_references', v_remaining_url_references
  );
end;
$$;

create or replace function restore_product_image_metadata(
  p_id uuid,
  p_product_id uuid,
  p_url text,
  p_alt text,
  p_sort_order integer,
  p_is_primary boolean,
  p_created_at timestamptz,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_primary_id uuid;
  v_restored product_images%rowtype;
begin
  perform id
  from products
  where id = p_product_id
    and historical_identity = false
  for update;

  if not found then
    raise exception 'Product not found or historical identities cannot be modified';
  end if;

  perform id
  from product_images
  where product_id = p_product_id
  order by sort_order, created_at, id
  for update;

  insert into product_images (
    id,
    product_id,
    url,
    alt,
    sort_order,
    is_primary,
    created_at,
    updated_at
  )
  values (
    p_id,
    p_product_id,
    p_url,
    p_alt,
    p_sort_order,
    p_is_primary,
    p_created_at,
    p_updated_at
  )
  on conflict (id) do nothing;

  with ordered as (
    select
      id,
      (row_number() over (order by sort_order, created_at, id) - 1)::integer as normalized_order
    from product_images
    where product_id = p_product_id
  )
  update product_images as image
  set sort_order = ordered.normalized_order
  from ordered
  where image.id = ordered.id
    and image.sort_order is distinct from ordered.normalized_order;

  select id
  into v_primary_id
  from product_images
  where product_id = p_product_id
  order by
    case when p_is_primary and id = p_id then 0 else 1 end,
    case when is_primary then 0 else 1 end,
    sort_order,
    created_at,
    id
  limit 1;

  if v_primary_id is not null then
    update product_images
    set is_primary = (id = v_primary_id)
    where product_id = p_product_id
      and is_primary is distinct from (id = v_primary_id);
  end if;

  select *
  into v_restored
  from product_images
  where id = p_id
    and product_id = p_product_id;

  if not found then
    raise exception 'Product image metadata could not be restored';
  end if;

  return jsonb_build_object(
    'id', v_restored.id,
    'product_id', v_restored.product_id,
    'url', v_restored.url,
    'sort_order', v_restored.sort_order,
    'is_primary', v_restored.is_primary
  );
end;
$$;

revoke all on function delete_product_image_metadata(uuid, uuid)
  from public, anon, authenticated;
grant execute on function delete_product_image_metadata(uuid, uuid)
  to service_role;

revoke all on function restore_product_image_metadata(
  uuid, uuid, text, text, integer, boolean, timestamptz, timestamptz
)
  from public, anon, authenticated;
grant execute on function restore_product_image_metadata(
  uuid, uuid, text, text, integer, boolean, timestamptz, timestamptz
)
  to service_role;

comment on function delete_product_image_metadata(uuid, uuid) is
  'Atomically deletes product image metadata, normalizes ordering and assigns exactly one primary image when images remain.';
comment on function restore_product_image_metadata(
  uuid, uuid, text, text, integer, boolean, timestamptz, timestamptz
) is
  'Compensates a failed Storage deletion by restoring metadata and re-establishing coherent ordering and primary state.';

commit;
