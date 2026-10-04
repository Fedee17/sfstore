-- Transactional smoke test for 202610030001_atomic_store_sale_checkout.sql.
-- Run the whole file as one SQL Editor execution after the migration.
-- It temporarily assumes service_role and finishes with ROLLBACK.
-- This validates rollback and sequential idempotency, not true two-session
-- concurrency. Concurrent locking should be tested only in an isolated DB.

begin;
set local role service_role;

do $test$
declare
  v_product public.products%rowtype;
  v_actor uuid := '00000000-0000-4000-8000-000000000099'::uuid;
  v_success_key uuid := '00000000-0000-4000-8000-000000000101'::uuid;
  v_stock_key uuid := '00000000-0000-4000-8000-000000000102'::uuid;
  v_payment_key uuid := '00000000-0000-4000-8000-000000000103'::uuid;
  v_result jsonb;
  v_stock_after_success integer;
  v_expected_error boolean;
begin
  select product.*
    into v_product
  from public.products product
  where product.status = 'active'
    and product.historical_identity = false
    and product.stock >= 2
    and product.price is not null
    and product.price > 0
  order by product.id
  limit 1;

  if not found then
    raise exception 'ATOMIC_TEST_REQUIRES_ACTIVE_PRODUCT_WITH_STOCK_2';
  end if;

  -- A. Complete success: order, item, payment and inventory are visible inside
  -- the transaction and will all be removed by the final ROLLBACK.
  select public.create_store_sale_atomic(
    v_success_key,
    v_actor,
    'Atomic transaction test',
    'ROLLBACK-only test',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'quantity', 1,
      'unit_price', 1.00
    )),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 1.00))
  ) into v_result;

  if v_result ->> 'operation' <> 'created'
     or v_result ->> 'payment_status' <> 'paid'
     or v_result #>> '{inventory,status}' <> 'applied' then
    raise exception 'ATOMIC_TEST_SUCCESS_RESULT_INVALID:%', v_result;
  end if;

  select stock into v_stock_after_success
  from public.products where id = v_product.id;
  if v_stock_after_success <> v_product.stock - 1 then
    raise exception 'ATOMIC_TEST_STOCK_NOT_APPLIED';
  end if;

  -- D. An identical retry must reuse the order, payment and movement.
  select public.create_store_sale_atomic(
    v_success_key,
    v_actor,
    'Atomic transaction test',
    'ROLLBACK-only test',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'quantity', 1,
      'unit_price', 1.00
    )),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 1.00))
  ) into v_result;

  if v_result ->> 'operation' <> 'already_created'
     or (select count(*) from public.orders where idempotency_key = v_success_key) <> 1
     or (select count(*) from public.order_payments payment
         join public.orders sale on sale.id = payment.order_id
         where sale.idempotency_key = v_success_key) <> 1
     or (select count(*) from public.inventory_movements movement
         join public.orders sale on sale.id = movement.order_id
         where sale.idempotency_key = v_success_key
           and movement.movement_type = 'sale') <> 1 then
    raise exception 'ATOMIC_TEST_RETRY_NOT_IDEMPOTENT';
  end if;

  -- B. Insufficient stock must leave no order behind.
  v_expected_error := false;
  begin
    perform public.create_store_sale_atomic(
      v_stock_key,
      v_actor,
      null,
      'ROLLBACK-only insufficient-stock test',
      jsonb_build_array(jsonb_build_object(
        'product_id', v_product.id,
        'quantity', v_product.stock + 1,
        'unit_price', 1.00
      )),
      '[]'::jsonb
    );
  exception when others then
    if position('STORE_SALE_STOCK_INSUFFICIENT' in sqlerrm) = 0 then
      raise;
    end if;
    v_expected_error := true;
  end;
  if not v_expected_error
     or exists (select 1 from public.orders where idempotency_key = v_stock_key) then
    raise exception 'ATOMIC_TEST_INSUFFICIENT_STOCK_DID_NOT_ROLL_BACK';
  end if;

  -- C/E. The first valid payment is inserted before the second causes an
  -- overpayment. The nested block rollback must remove the order and both
  -- payment effects.
  v_expected_error := false;
  begin
    perform public.create_store_sale_atomic(
      v_payment_key,
      v_actor,
      null,
      'ROLLBACK-only second-payment test',
      jsonb_build_array(jsonb_build_object(
        'product_id', v_product.id,
        'quantity', 1,
        'unit_price', 1.00
      )),
      jsonb_build_array(
        jsonb_build_object('method', 'cash', 'amount', 0.60),
        jsonb_build_object('method', 'transfer', 'amount', 0.60)
      )
    );
  exception when others then
    if position('ORDER_PAYMENT_OVERPAYMENT' in sqlerrm) = 0 then
      raise;
    end if;
    v_expected_error := true;
  end;
  if not v_expected_error
     or exists (select 1 from public.orders where idempotency_key = v_payment_key)
     or exists (
       select 1 from public.order_payments
       where reference like 'store:' || v_payment_key::text || ':payment:%'
     ) then
    raise exception 'ATOMIC_TEST_SECOND_PAYMENT_DID_NOT_ROLL_BACK';
  end if;

  raise notice 'Atomic store-sale transaction checks passed; outer ROLLBACK is next.';
end;
$test$;

reset role;
rollback;

-- All deterministic test identities must be absent after rollback.
select
  count(*) = 0 as rollback_verified
from public.orders
where idempotency_key in (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid
);

