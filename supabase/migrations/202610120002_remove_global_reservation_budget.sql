begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Retain migration 001 and its historical policy field; it no longer constrains inventory.
-- No order, stock, payment, proof or Auth data is changed by this migration.
comment on column public.checkout_reservation_policy.max_reserved_percent is
 'Historical field from migration 202610120001; ignored since 202610120002. No global reservation budget is enforced.';
create or replace function public.enforce_checkout_product_limit(p_buyer_id uuid,p_product_id uuid,p_quantity integer,p_stock integer)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare cfg public.checkout_reservation_policy%rowtype; cap integer;
begin
 select * into cfg from public.checkout_reservation_policy where id;
 if not found then raise exception 'CHECKOUT_POLICY_NOT_CONFIGURED'; end if;
 select max_product_units into cap from public.checkout_buyer_exceptions where buyer_id=p_buyer_id and expires_at>clock_timestamp();
 cap:=coalesce(cap,cfg.max_product_units);
 if p_quantity+(select coalesce(sum(i.quantity),0) from public.order_items i join public.checkout_operations op on op.order_id=i.order_id where op.buyer_id=p_buyer_id and op.state='pending' and i.product_id=p_product_id)>cap then raise exception 'CHECKOUT_PRODUCT_LIMIT'; end if;
 -- create_checkout_atomic holds ordered product row locks and checks actual stock.
 -- Keep p_stock in the signature for compatibility; no percentage/global quota applies.
end $$;
revoke all on function public.enforce_checkout_product_limit(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.enforce_checkout_product_limit(uuid,uuid,integer,integer) to service_role;
commit;
