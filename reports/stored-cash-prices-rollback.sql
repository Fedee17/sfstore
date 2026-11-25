-- Rollback of supabase/migrations/202611260001_stored_cash_prices.sql. Run ONLY after the web is back on a deployment
-- that does not read public_catalog_cash_prices (Production before the stored cash release, commit 4393eea).
-- Restores round(list × 0,75, 2) for every product. Saved transfer_price values are kept, unused, as before.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function pg_temp.patch_once(source text, anchor text, replacement text) returns text language plpgsql as $$
begin
  if source is null or position(anchor in source) = 0
    or (length(source) - length(replace(source, anchor, ''))) <> length(anchor) then
    raise exception 'STORED_CASH_ROLLBACK_CONTRACT_CHANGED: %', left(anchor, 80);
  end if;
  return replace(source, anchor, replacement);
end $$;

do $rollback$
declare definition text;
begin
  definition := pg_get_functiondef('public.resolve_commercial_lines(jsonb,boolean,text)'::regprocedure);
  definition := pg_temp.patch_once(definition,
    'final:=case when p_discounted then public.commercial_cash_unit_price(p.price,p.transfer_price,p.cash_price_approved_at) else p.price end;',
    'final:=case when p_discounted then round(p.price*0.75,2) else p.price end;');
  execute definition;

  definition := pg_get_functiondef('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)'::regprocedure);
  definition := pg_temp.patch_once(definition,
    $a$'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status', 'cash_price_approved'))$a$,
    $a$'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status'))$a$);
  definition := pg_temp.patch_once(definition,
    $a$if p_payload->'product' ? 'cash_price_approved' and p_payload->'product'->'cash_price_approved' is distinct from 'true'::jsonb then
    raise exception 'PRODUCT_INVALID_FIELDS';
  end if;
  if jsonb_typeof(p_payload->'product'->'featured') <> 'boolean' then$a$,
    $a$if jsonb_typeof(p_payload->'product'->'featured') <> 'boolean' then$a$);
  definition := pg_temp.patch_once(definition,
    $a$-- Owner-approved cash price (admin calculator): transfer_price is now the charged one-payment price.
  if p_payload->'product' ? 'cash_price_approved' then
    update public.products set cash_price_approved_at = clock_timestamp() where id = p_product_id;
  end if;
  v_attributes := coalesce(p_payload->'attributes', '[]'::jsonb);$a$,
    $a$v_attributes := coalesce(p_payload->'attributes', '[]'::jsonb);$a$);
  execute definition;
end;
$rollback$;

drop view public.public_catalog_cash_prices;
drop function public.catalog_cash_price(uuid);
drop trigger products_cash_price_requires_approval on public.products;
drop function public.products_cash_price_requires_approval();
alter table public.products drop constraint products_approved_cash_price_valid;
alter table public.products drop column cash_price_approved_at;
drop function public.commercial_cash_unit_price(numeric, numeric, timestamptz);

do $verify$
begin
  if position('round(p.price*0.75,2)' in pg_get_functiondef('public.resolve_commercial_lines(jsonb,boolean,text)'::regprocedure)) = 0 then
    raise exception 'STORED_CASH_ROLLBACK_INCOMPLETE';
  end if;
end;
$verify$;
commit;
