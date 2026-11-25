-- Owner decision 26/11/2026: the cash (one-payment) price saved with the admin price calculator is exactly the price
-- the store shows and charges. Every existing product keeps today's amount, round(list × 0,75, 2), until the owner
-- saves it with the calculator: only then products.cash_price_approved_at is set and products.transfer_price becomes
-- the charged cash price. Any later list or cash change without a new approval (imports, sheet sync, quick actions,
-- family base prices) returns the product to the 75% rule, so no product is ever left without a price.
-- Combos, Mercado Pago and installments are unchanged. Rollback: reports/stored-cash-prices-rollback.sql.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.products add column cash_price_approved_at timestamptz;
alter table public.products add constraint products_approved_cash_price_valid check (
  cash_price_approved_at is null
  or (transfer_price is not null and transfer_price > 0 and transfer_price <= price and transfer_price = round(transfer_price, 2)));
comment on column public.products.cash_price_approved_at is
  'Set by the admin calculator save. Not null: transfer_price is the charged cash price; null: round(price × 0,75, 2).';

-- The one cash price rule for web checkout, store sales and the public catalog. Without approval it is exactly
-- the previous expression, so unapproved products (all of them at migration time) keep their amounts.
create function public.commercial_cash_unit_price(p_list numeric, p_stored numeric, p_approved_at timestamptz)
returns numeric language sql immutable set search_path = pg_catalog as $$
  select case when p_approved_at is not null and p_stored > 0 and p_stored <= p_list and p_stored = round(p_stored, 2)
    then p_stored else round(p_list * 0.75, 2) end
$$;

-- A list or cash change written without a new approval drops the approval (back to the 75% rule).
create function public.products_cash_price_requires_approval() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if (new.price is distinct from old.price or new.transfer_price is distinct from old.transfer_price)
    and new.cash_price_approved_at is not distinct from old.cash_price_approved_at then
    new.cash_price_approved_at := null;
  end if;
  return new;
end $$;
create trigger products_cash_price_requires_approval before update of price, transfer_price on public.products
  for each row execute function public.products_cash_price_requires_approval();

-- Public cash price of published SKUs; products.transfer_price itself stays revoked from anon/authenticated.
create function public.catalog_cash_price(p_product uuid) returns numeric language sql stable security definer
set search_path = pg_catalog, public as $$
  select public.commercial_cash_unit_price(p.price, p.transfer_price, p.cash_price_approved_at)
  from public.products p
  where p.id = p_product and exists (select 1 from public.public_catalog_skus s where s.id = p.id)
$$;
create view public.public_catalog_cash_prices with (security_barrier = true, security_invoker = true) as
  select s.id, public.catalog_cash_price(s.id) as cash_price from public.public_catalog_skus s;

-- Patch the tested functions in place. Every anchor must appear exactly once or nothing is changed.
create or replace function pg_temp.patch_once(source text, anchor text, replacement text) returns text language plpgsql as $$
begin
  if source is null or position(anchor in source) = 0
    or (length(source) - length(replace(source, anchor, ''))) <> length(anchor) then
    raise exception 'STORED_CASH_BASE_CONTRACT_CHANGED: %', left(anchor, 80);
  end if;
  return replace(source, anchor, replacement);
end $$;

do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.resolve_commercial_lines(jsonb,boolean,text)'::regprocedure);
  definition := pg_temp.patch_once(definition,
    'final:=case when p_discounted then round(p.price*0.75,2) else p.price end;',
    'final:=case when p_discounted then public.commercial_cash_unit_price(p.price,p.transfer_price,p.cash_price_approved_at) else p.price end;');
  execute definition;

  -- The admin product save marks the approval in the same transaction as the prices.
  definition := pg_get_functiondef('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)'::regprocedure);
  definition := pg_temp.patch_once(definition,
    $a$'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status'))$a$,
    $a$'price', 'transfer_price', 'compare_at_price', 'cost', 'sku', 'featured', 'status', 'cash_price_approved'))$a$);
  definition := pg_temp.patch_once(definition,
    $a$if jsonb_typeof(p_payload->'product'->'featured') <> 'boolean' then$a$,
    $a$if p_payload->'product' ? 'cash_price_approved' and p_payload->'product'->'cash_price_approved' is distinct from 'true'::jsonb then
    raise exception 'PRODUCT_INVALID_FIELDS';
  end if;
  if jsonb_typeof(p_payload->'product'->'featured') <> 'boolean' then$a$);
  definition := pg_temp.patch_once(definition,
    $a$v_attributes := coalesce(p_payload->'attributes', '[]'::jsonb);$a$,
    $a$-- Owner-approved cash price (admin calculator): transfer_price is now the charged one-payment price.
  if p_payload->'product' ? 'cash_price_approved' then
    update public.products set cash_price_approved_at = clock_timestamp() where id = p_product_id;
  end if;
  v_attributes := coalesce(p_payload->'attributes', '[]'::jsonb);$a$);
  execute definition;
end;
$migration$;

revoke all on function public.products_cash_price_requires_approval(), public.catalog_cash_price(uuid)
  from public, anon, authenticated;
grant execute on function public.catalog_cash_price(uuid) to anon, authenticated, service_role;
grant select on public.public_catalog_cash_prices to anon, authenticated, service_role;

-- Fail closed: every published SKU has a cash price, and every product keeps its previous effective amount.
do $verify$
begin
  if exists (select 1 from public.products where cash_price_approved_at is not null) then
    raise exception 'STORED_CASH_UNEXPECTED_APPROVAL';
  end if;
  if exists (select 1 from public.products
      where public.commercial_cash_unit_price(price, transfer_price, cash_price_approved_at) is distinct from round(price * 0.75, 2)) then
    raise exception 'STORED_CASH_EFFECTIVE_PRICE_CHANGED';
  end if;
  if (select count(*) from public.public_catalog_cash_prices) <> (select count(*) from public.public_catalog_skus)
    or exists (select 1 from public.public_catalog_cash_prices c join public.products p on p.id = c.id
      where c.cash_price is distinct from round(p.price * 0.75, 2)) then
    raise exception 'STORED_CASH_PUBLIC_PRICE_CHANGED';
  end if;
end;
$verify$;
commit;
