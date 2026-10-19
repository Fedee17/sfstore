-- Additive wrapper only; no existing rows are changed by applying this migration.
-- Apply manually after separate review. Never runs a Storage DELETE or a worker.
begin;

create function public.delete_product_image_metadata_and_queue(
  p_product_id uuid, p_image_id uuid, p_expected_url text, p_storage_path text
)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_deleted jsonb;
  v_operation_key uuid := gen_random_uuid();
  v_task_id uuid;
begin
  -- Same lock order as the worker: operation table before gallery writes.
  lock table public.product_save_operations in row exclusive mode;
  if p_expected_url like '%/product-images/%' and p_storage_path is null then
    raise exception 'PRODUCT_INVALID_STORAGE_TASK';
  end if;
  -- Retain the existing gallery ordering, primary selection and historical guard.
  v_deleted := public.delete_product_image_metadata(p_product_id, p_image_id);
  if v_deleted->>'url' is distinct from p_expected_url then
    raise exception 'PRODUCT_IMAGE_CHANGED';
  end if;
  if p_storage_path is not null then
    if p_storage_path = '' or p_storage_path ~ '(^/|(^|/)\.\.?(/|$)|[?#\\])' then
      raise exception 'PRODUCT_INVALID_STORAGE_TASK';
    end if;
    -- This is an already-finished metadata update, never a resumable product save.
    -- Aborted fences the operation against create/update RPC retries. The source
    -- distinguishes it from normal save compensation and preserves the old FK.
    insert into public.product_save_operations(
      operation_key, operation_type, product_id, payload_hash, status, recovery_metadata
    ) values (
      v_operation_key, 'update_product', p_product_id,
      encode(sha256(convert_to(v_deleted::text, 'UTF8')), 'hex'), 'aborted',
      jsonb_build_object('source', 'admin_image_delete', 'image', v_deleted)
    );
    -- Legacy image rows have no trusted content identity. Record path-only intent
    -- durably; the worker must retain existing objects, not infer an identity.
    v_task_id := public.enqueue_product_storage_task(
      v_operation_key, p_product_id, 'reconcile', p_storage_path,
      jsonb_build_object('path', p_storage_path), p_image_id
    );
  end if;
  return v_deleted || jsonb_build_object('storage_task_id', v_task_id);
end;
$$;

revoke all on function public.delete_product_image_metadata_and_queue(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.delete_product_image_metadata_and_queue(uuid, uuid, text, text)
  to service_role;
commit;
