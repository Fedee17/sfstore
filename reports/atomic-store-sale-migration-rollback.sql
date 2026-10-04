-- Schema-only rollback for 202610030001_atomic_store_sale_checkout.sql.
-- This does not modify business data or restore the previous application code.

begin;

drop function if exists public.record_store_sale_payment_atomic(
  uuid, uuid, text, numeric, text
);

drop function if exists public.create_store_sale_atomic(
  uuid, uuid, text, text, jsonb, jsonb
);

commit;

