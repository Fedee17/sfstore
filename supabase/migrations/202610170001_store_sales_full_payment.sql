-- Candidate only: apply to an isolated test database; Production requires separate approval.
-- Additive snapshots are nullable for legacy and online rows. Never backfill historical costs.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

ALTER TABLE public.order_items
  ADD COLUMN list_unit_price_snapshot numeric(12,2) CHECK (list_unit_price_snapshot >= 0),
  ADD COLUMN unit_cost_snapshot numeric(12,2) CHECK (unit_cost_snapshot >= 0);
ALTER TABLE public.order_payments
  ADD COLUMN store_payment_method text CHECK (store_payment_method IN ('cash','transfer','debit','credit','qr','other'));
COMMENT ON COLUMN public.order_items.unit_cost_snapshot IS
  'Current product cost frozen when a new physical sale is confirmed; NULL means unknown, never zero by inference.';
COMMENT ON COLUMN public.order_payments.store_payment_method IS
  'Physical-sale detail only. Existing method remains the compatible payment ledger category; online stays NULL.';

CREATE OR REPLACE FUNCTION public.create_store_sale_atomic(
  p_idempotency_key uuid, p_created_by uuid, p_customer_name text, p_notes text,
  p_items jsonb, p_payments jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.orders%rowtype;
  v_fingerprint text;
  v_count integer;
  v_distinct integer;
  v_payment record;
  v_line record;
  v_discounted boolean := true;
  v_paid numeric := 0;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_unit numeric;
  v_canonical jsonb := '[]'::jsonb;
  v_sale jsonb;
  v_result jsonb;
  v_inventory jsonb;
  v_order_id uuid;
  v_method text;
BEGIN
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'STORE_SALE_IDEMPOTENCY_REQUIRED'; END IF;
  IF p_created_by IS NULL THEN RAISE EXCEPTION 'STORE_SALE_ACTOR_REQUIRED'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'STORE_SALE_NO_ITEMS'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'STORE_SALE_NO_ITEMS'; END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN RAISE EXCEPTION 'STORE_SALE_PAYMENT_INVALID'; END IF;
  IF jsonb_array_length(p_payments) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'STORE_SALE_PAYMENT_INVALID'; END IF;

  -- Fingerprint the request, not mutable catalog values. A successful retry returns the frozen sale.
  v_fingerprint := md5(jsonb_build_object('customer_name',nullif(btrim(p_customer_name),''),
    'notes',nullif(btrim(p_notes),''),'items',p_items,'payments',p_payments,'actor',p_created_by)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  SELECT * INTO v_existing FROM public.orders WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.channel <> 'store' OR v_existing.historical_import
       OR v_existing.metadata->>'store_sale_request_fingerprint' IS DISTINCT FROM v_fingerprint
       OR v_existing.metadata->>'store_pricing_policy' IS DISTINCT FROM 'full_payment_25_v1' THEN
      RAISE EXCEPTION 'STORE_SALE_IDEMPOTENCY_CONFLICT';
    END IF;
    SELECT coalesce(sum(amount),0) INTO v_paid FROM public.order_payments
      WHERE order_id=v_existing.id AND status='approved';
    IF v_existing.payment_status <> 'paid' OR v_paid <> v_existing.total THEN
      RAISE EXCEPTION 'STORE_SALE_PAYMENT_TOTAL_MISMATCH';
    END IF;
    RETURN jsonb_build_object('order_id',v_existing.id,'order_number',v_existing.order_number,
      'operation','already_created','subtotal',v_existing.subtotal,'discount',v_existing.discount,
      'total',v_existing.total,'total_paid',v_paid,'remaining_amount',0,'payment_status','paid',
      'inventory',jsonb_build_object('order_id',v_existing.id,'status','already_applied','movements_created',0));
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    IF jsonb_typeof(v_payment.value) <> 'object'
       OR jsonb_typeof(v_payment.value->'amount') IS DISTINCT FROM 'number'
       OR (v_payment.value->>'method') IS NULL
       OR (v_payment.value->>'method') NOT IN ('cash','transfer','debit','credit','qr','other') THEN
      RAISE EXCEPTION 'STORE_SALE_PAYMENT_INVALID';
    END IF;
    IF (v_payment.value->>'amount')::numeric <= 0
       OR (v_payment.value->>'amount')::numeric > 9999999999.99
       OR (v_payment.value->>'amount')::numeric <> round((v_payment.value->>'amount')::numeric,2) THEN
      RAISE EXCEPTION 'STORE_SALE_PAYMENT_INVALID';
    END IF;
    v_paid := v_paid + (v_payment.value->>'amount')::numeric;
    v_discounted := v_discounted AND (v_payment.value->>'method') IN ('cash','transfer');
  END LOOP;

  -- Input prices only detect stale/tampered previews; authority is the locked products.price.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x WHERE jsonb_typeof(x)<>'object'
      OR jsonb_typeof(x->'quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(x->'unit_price') IS DISTINCT FROM 'number') THEN
    RAISE EXCEPTION 'STORE_SALE_QUANTITY_INVALID';
  END IF;
  SELECT count(*),count(DISTINCT product_id) INTO v_count,v_distinct
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid,quantity numeric,unit_price numeric);
  IF v_count <> v_distinct THEN RAISE EXCEPTION 'STORE_SALE_DUPLICATE_PRODUCT'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS x(product_id uuid,quantity numeric,unit_price numeric)
      WHERE product_id IS NULL OR quantity IS NULL OR quantity<=0 OR quantity<>trunc(quantity) OR quantity>1000000) THEN
    RAISE EXCEPTION 'STORE_SALE_QUANTITY_INVALID';
  END IF;

  -- Same stable product locks as online reservations: serialize physical/online competition.
  PERFORM product.id FROM public.products product
    JOIN jsonb_to_recordset(p_items) AS x(product_id uuid) ON product.id=x.product_id
    ORDER BY product.id FOR UPDATE OF product;
  IF (SELECT count(*) FROM public.products product
    JOIN jsonb_to_recordset(p_items) AS x(product_id uuid) ON product.id=x.product_id) <> v_count THEN
    RAISE EXCEPTION 'STORE_SALE_PRODUCT_NOT_FOUND';
  END IF;
  FOR v_line IN SELECT product.*,x.quantity,x.unit_price AS preview_price
    FROM public.products product JOIN jsonb_to_recordset(p_items)
      AS x(product_id uuid,quantity numeric,unit_price numeric) ON product.id=x.product_id
    ORDER BY product.id LOOP
    IF v_line.historical_identity THEN RAISE EXCEPTION 'STORE_SALE_PRODUCT_HISTORICAL'; END IF;
    IF v_line.status <> 'active' THEN RAISE EXCEPTION 'STORE_SALE_PRODUCT_INACTIVE'; END IF;
    IF v_line.price IS NULL OR v_line.price <= 0 THEN RAISE EXCEPTION 'STORE_SALE_PRICE_INVALID'; END IF;
    IF v_line.stock < v_line.quantity THEN RAISE EXCEPTION 'STORE_SALE_STOCK_INSUFFICIENT'; END IF;
    v_unit := CASE WHEN v_discounted THEN round(v_line.price*0.75,2) ELSE v_line.price END;
    IF v_line.preview_price IS DISTINCT FROM v_unit THEN RAISE EXCEPTION 'STORE_SALE_PRICE_CHANGED'; END IF;
    v_subtotal := v_subtotal + v_line.price*v_line.quantity;
    v_total := v_total + v_unit*v_line.quantity;
    v_canonical := v_canonical || jsonb_build_array(jsonb_build_object('product_id',v_line.id,
      'quantity',v_line.quantity,'unit_price',v_unit));
  END LOOP;
  IF v_subtotal>9999999999.99 OR v_total>9999999999.99 THEN RAISE EXCEPTION 'STORE_SALE_PRICE_INVALID'; END IF;
  IF v_paid <> v_total THEN RAISE EXCEPTION 'STORE_SALE_PAYMENT_TOTAL_MISMATCH'; END IF;

  -- Reuse the existing creator, payment ledger and inventory operation in this transaction.
  SELECT public.create_store_sale(p_idempotency_key,p_created_by,p_customer_name,p_notes,v_canonical) INTO v_sale;
  v_order_id := (v_sale->>'order_id')::uuid;
  UPDATE public.orders SET subtotal=v_subtotal,discount=v_subtotal-v_total,
    metadata=metadata || jsonb_build_object('store_sale_request_fingerprint',v_fingerprint,
      'store_pricing_policy','full_payment_25_v1','cost_snapshot_policy','current_product_cost_at_sale_v1')
    WHERE id=v_order_id;
  UPDATE public.order_items item SET list_unit_price_snapshot=product.price,unit_cost_snapshot=product.cost
    FROM public.products product WHERE item.order_id=v_order_id AND item.product_id=product.id;

  FOR v_payment IN SELECT value,ordinality FROM jsonb_array_elements(p_payments) WITH ORDINALITY ORDER BY ordinality LOOP
    -- Keep shared online method constraints and record_order_payment unchanged.
    v_method := CASE v_payment.value->>'method' WHEN 'debit' THEN 'card' WHEN 'credit' THEN 'card'
      WHEN 'qr' THEN 'other' ELSE v_payment.value->>'method' END;
    SELECT public.record_order_payment(v_order_id,v_method,(v_payment.value->>'amount')::numeric,'approved',
      format('store:%s:payment:%s',p_idempotency_key,v_payment.ordinality),NULL,NULL,false) INTO v_result;
    UPDATE public.order_payments SET store_payment_method=v_payment.value->>'method'
      WHERE id=(v_result->>'payment_id')::uuid AND order_id=v_order_id;
  END LOOP;
  IF v_result->>'payment_status' IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'STORE_SALE_PAYMENT_TOTAL_MISMATCH'; END IF;
  SELECT public.complete_store_sale(v_order_id,p_created_by)->'inventory' INTO v_inventory;
  RETURN jsonb_build_object('order_id',v_order_id,'order_number',v_sale->>'order_number','operation','created',
    'subtotal',v_subtotal,'discount',v_subtotal-v_total,'total',v_total,'total_paid',v_paid,
    'remaining_amount',0,'payment_status','paid','inventory',v_inventory);
END;
$$;
REVOKE ALL ON FUNCTION public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb) TO service_role;
COMMENT ON FUNCTION public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb) IS
  'Confirm fully paid physical sales only; catalog-derived list/25% prices and cost snapshots. Atomic idempotent inventory.';
COMMIT;
