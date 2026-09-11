-- Makes a database created from an older schema match the live catalog model.
-- This migration is additive and safe to run more than once.
alter table public.products
  add column if not exists transfer_price numeric(12, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_transfer_price_nonnegative'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_transfer_price_nonnegative
      check (transfer_price is null or transfer_price >= 0) not valid;
  end if;
end
$$;

comment on column public.products.price is
  'Current list price shown to customers.';
comment on column public.products.transfer_price is
  'Current cash or bank-transfer price shown to customers.';
comment on column public.products.cost is
  'Current effective product cost. Future purchases will set this to the latest effective purchase cost.';
comment on column public.products.stock is
  'Current integer stock balance. Not fully auditable until every change is required to create an inventory movement.';
