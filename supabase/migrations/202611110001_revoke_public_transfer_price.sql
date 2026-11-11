-- SEC-02: stop exposing the internal transfer price to the public roles.
-- The storefront derives the web price from products.price (lib/web-transfer-pricing.ts);
-- public_catalog_skus and public_component_offers never project products.transfer_price.
-- stock and sku stay readable: both public views depend on them (security_invoker).
begin;

do $$
begin
  if to_regclass('public.public_catalog_skus') is null then
    raise exception 'SEC02_REQUIRES_PUBLIC_CATALOG_VIEW';
  end if;
  if position('transfer_price' in pg_get_viewdef('public.public_catalog_skus'::regclass, true)) > 0 then
    raise exception 'SEC02_PUBLIC_VIEW_STILL_PROJECTS_TRANSFER_PRICE';
  end if;
end $$;

revoke select (transfer_price) on public.products from anon, authenticated;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'public.products'::regclass, 'transfer_price', 'SELECT') then
      raise exception 'SEC02_TRANSFER_PRICE_STILL_PUBLIC:%', r;
    end if;
    if not has_column_privilege(r, 'public.products'::regclass, 'stock', 'SELECT')
      or not has_column_privilege(r, 'public.products'::regclass, 'sku', 'SELECT')
      or not has_column_privilege(r, 'public.products'::regclass, 'price', 'SELECT') then
      raise exception 'SEC02_PUBLIC_CATALOG_COLUMNS_LOST:%', r;
    end if;
  end loop;
end $$;

commit;
