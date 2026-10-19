-- Phase 2, new additive delta only. Never replay historical migrations in Production.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.products add column commercial_label text;
alter table public.order_items add column family_id_snapshot uuid, add column family_name_snapshot text,
 add column sku_snapshot text, add column variant_options_snapshot jsonb;
alter table public.purchase_items add column family_id_snapshot uuid, add column family_name_snapshot text,
 add column variant_options_snapshot jsonb;

create function public.get_variant_option_labels(p_product public.products)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select coalesce(jsonb_object_agg(o.name,v.label),'{}'::jsonb)
 from public.product_family_options o join public.product_family_option_values v on v.option_id=o.id
 where o.family_id=p_product.family_id and p_product.variant_choices->>o.id::text=v.id::text;
$$;
create function public.set_product_commercial_label() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare family_name text; labels text;
begin
 if new.family_id is null then new.commercial_label:=null; return new; end if;
 select name into strict family_name from public.product_families where id=new.family_id;
 select string_agg(o.name||': '||v.label,' / ' order by o.name,o.id) into labels
 from public.product_family_options o join public.product_family_option_values v on v.option_id=o.id
 where o.family_id=new.family_id and new.variant_choices->>o.id::text=v.id::text;
 new.commercial_label:=family_name||' — '||coalesce(labels,'')||' · '||new.sku;
 return new;
end $$;
create trigger set_product_commercial_label before insert or update of family_id,variant_choices,sku,name,commercial_label
 on public.products for each row execute function public.set_product_commercial_label();
-- Configuration-derived label only; no stock/cost/price/history backfill.
update public.products set commercial_label=null where family_id is not null;

create or replace function public.update_family_inherited_prices() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 -- Lock ALL affected SKU first, in the same order as inventory transactions.
 perform id from public.products where family_id=new.id order by id for update;
 update public.products set price=case when list_price_override is null then new.base_price else price end,
   commercial_label=commercial_label where family_id=new.id;
 return null;
end $$;
drop trigger update_family_inherited_prices on public.product_families;
create trigger update_family_inherited_prices after update of base_price,name on public.product_families
 for each row execute function public.update_family_inherited_prices();

create function public.snapshot_product_variant_line() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare p public.products%rowtype; historic boolean; f text;
begin
 if tg_table_name='order_items' then
  select historical_import into historic from public.orders where id=new.order_id;
 else
  select historical_import into historic from public.purchases where id=new.purchase_id;
 end if;
 -- Never enrich historical imports from the CURRENT catalog.
 if coalesce(historic,false) or new.product_id is null then return new; end if;
 select * into strict p from public.products where id=new.product_id for share;
 new.family_id_snapshot:=p.family_id;
 if p.family_id is null then
  new.family_name_snapshot:=null;new.variant_options_snapshot:=null;
 else
  select name into f from public.product_families where id=p.family_id;
  new.family_name_snapshot:=f;new.variant_options_snapshot:=public.get_variant_option_labels(p);
  if tg_table_name='order_items' then new.product_name:=p.commercial_label;
  else new.product_name_snapshot:=p.commercial_label; end if;
 end if;
 if tg_table_name='order_items' then new.sku_snapshot:=p.sku; end if;
 return new;
end $$;
create trigger zz_snapshot_product_variant_line before insert on public.order_items
 for each row execute function public.snapshot_product_variant_line();
create trigger zz_snapshot_product_variant_line before insert on public.purchase_items
 for each row execute function public.snapshot_product_variant_line();

-- Global URL namespace: a family may share a slug only with one of its own SKU.
-- A caller must not shadow a different simple product or family.
do $$begin
 if exists(select 1 from public.product_families f join public.products p on p.id=f.id) then raise exception 'VARIANT_IDENTITY_COLLISION'; end if;
 if exists(select 1 from public.product_families f join public.products p on p.slug=f.slug where p.family_id is distinct from f.id)
 then raise exception 'VARIANT_PUBLIC_SLUG_COLLISION'; end if;
end $$;
create function public.guard_variant_public_slug() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if tg_table_name='product_families' then
  if exists(select 1 from public.products where id=new.id) then raise exception 'VARIANT_IDENTITY_COLLISION'; end if;
  if exists(select 1 from public.products p where p.slug=new.slug and p.family_id is distinct from new.id) then raise exception 'VARIANT_PUBLIC_SLUG_COLLISION'; end if;
 else
  if exists(select 1 from public.product_families where id=new.id) then raise exception 'VARIANT_IDENTITY_COLLISION'; end if;
  if exists(select 1 from public.product_families f where f.slug=new.slug and f.id is distinct from new.family_id) then raise exception 'VARIANT_PUBLIC_SLUG_COLLISION'; end if;
 end if;
 return new;
end $$;
create trigger lock_variant_slug before update of slug on public.products for each statement execute function public.lock_variant_catalog();
create trigger guard_variant_public_slug before insert or update of slug,family_id on public.products for each row execute function public.guard_variant_public_slug();
create trigger guard_variant_public_slug before insert or update of slug on public.product_families for each row execute function public.guard_variant_public_slug();

-- Explicit public projection, not SELECT *. Its owner reads private option definitions;
-- consumers receive only visible active SKU. No costs, overrides or administrative flags.
create view public.public_catalog_skus with (security_barrier=true) as
select p.id,p.name,p.slug,p.short_description,p.description,p.price,p.stock,p.featured,p.updated_at,p.sku,
 p.status,p.historical_identity,p.category_id,p.family_id,p.commercial_label,
 f.name family_name,f.slug family_slug,
 jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'is_active',c.is_active) categories,
 c.slug category_slug,
 coalesce((select jsonb_agg(jsonb_build_object('url',i.url,'alt',i.alt,'sort_order',i.sort_order,'is_primary',i.is_primary) order by i.is_primary desc,i.sort_order,i.id)
   from public.product_images i where i.product_id=p.id),'[]'::jsonb) product_images,
 coalesce((select jsonb_agg(jsonb_build_object('name',a.name,'value',a.value,'sort_order',a.sort_order) order by a.sort_order,a.id)
   from public.product_attributes a where a.product_id=p.id),'[]'::jsonb) product_attributes,
 coalesce((select jsonb_object_agg(o.name,v.label) from public.product_family_options o
   join public.product_family_option_values v on v.option_id=o.id
   where o.family_id=p.family_id and p.variant_choices->>o.id::text=v.id::text),'{}'::jsonb) variant_options
from public.products p join public.categories c on c.id=p.category_id
left join public.product_families f on f.id=p.family_id
where p.status='active' and not p.historical_identity and p.web_visible and not p.commercial_blocked and c.is_active;
revoke all on public.public_catalog_skus from public,anon,authenticated,service_role;
grant select on public.public_catalog_skus to anon,authenticated,service_role;
revoke all on function public.get_variant_option_labels(public.products),public.set_product_commercial_label(),public.snapshot_product_variant_line(),public.guard_variant_public_slug() from public,anon,authenticated;
grant execute on function public.get_variant_option_labels(public.products),public.set_product_commercial_label(),public.snapshot_product_variant_line(),public.guard_variant_public_slug() to service_role;
grant select(commercial_label) on public.products to service_role;
-- Existing privileged column/table grants are retained, public base-table grants unchanged.
commit;
