-- Additive only. Apply separately after review; never through the worker.
begin;
alter table public.product_storage_tasks add column result jsonb;
commit;
