-- Additive review correction; apply after PAY-01 006 with separate authorization.
-- No business/object rows, payment activation or physical Storage deletion.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public;

do $$ begin
  if to_regclass('public.checkout_shipping_quote_requests') is null
    or to_regprocedure('public.guard_checkout_item()') is null
    or to_regclass('storage.buckets') is null
    or not exists (select 1 from pg_class where oid = to_regclass('storage.objects') and relrowsecurity)
  then raise exception 'REVIEW_GUARDS_REQUIRES_PAY01_AND_STORAGE'; end if;
end $$;

-- TRUNCATE ignores row policies, including the product-images restrictive guard.
-- Bucket truncation with CASCADE can also remove object metadata. Row-level
-- Storage API privileges and other-bucket policies remain unchanged.
revoke truncate on storage.objects, storage.buckets from public, anon, authenticated;
do $$
declare r text; t text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['storage.objects', 'storage.buckets'] loop
      if has_table_privilege(r, t, 'TRUNCATE') or exists (
        select 1 from pg_roles member_role
        where pg_has_role(r, member_role.oid, 'MEMBER')
          and has_table_privilege(member_role.oid, t, 'TRUNCATE')
      ) then
        -- Do not silently edit third-party roles. Roll back for operator review,
        -- including NOINHERIT memberships that could SET ROLE on PG15.
        raise exception 'REVIEW_STORAGE_TRUNCATE_MEMBERSHIP:%:%', r, t;
      end if;
    end loop;
  end loop;
end $$;

-- Manual accreditation has no approved zero-total contract. Guard INSERT only:
-- do not prevent cancellation/stock release for preexisting unsupported orders.
create function public.guard_checkout_order_insert()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if new.metadata->>'checkout_version' = '1' and coalesce(new.total, 0) <= 0
  then raise exception 'CHECKOUT_UNSUPPORTED_TOTAL'; end if;
  return new;
end $$;
create trigger guard_checkout_order_insert before insert on public.orders
  for each row execute function public.guard_checkout_order_insert();
revoke all on function public.guard_checkout_order_insert() from public, anon, authenticated;
grant execute on function public.guard_checkout_order_insert() to service_role;

create or replace function public.guard_checkout_item()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.checkout_operations where order_id = new.order_id)
    then raise exception 'CHECKOUT_IMMUTABLE_ITEMS'; end if;
    return new;
  end if;
  if exists (select 1 from public.checkout_operations where order_id = old.order_id)
  then raise exception 'CHECKOUT_IMMUTABLE_ITEMS'; end if;
  if tg_op = 'DELETE' then return old; end if;
  -- Checking only OLD allowed an existing legacy line to be attached to a
  -- frozen checkout without changing its total or reservation evidence.
  if exists (select 1 from public.checkout_operations where order_id = new.order_id)
  then raise exception 'CHECKOUT_IMMUTABLE_ITEMS'; end if;
  return new;
end $$;
revoke all on function public.guard_checkout_item() from public, anon, authenticated;
grant execute on function public.guard_checkout_item() to service_role;
commit;
