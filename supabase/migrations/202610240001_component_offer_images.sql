-- P02: reuse product_images/Storage; image metadata only, no commercial mutations.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

alter table public.product_images add column combo_connector text
 check(combo_connector in ('cc','lightning'));
create unique index product_image_one_per_combo_connector
 on public.product_images(product_id,combo_connector) where combo_connector is not null;
create unique index product_image_distinct_combo_url
 on public.product_images(product_id,url) where combo_connector is not null;

alter table public.component_offer_publications
 add column image_id uuid,
 add column image_url text,
 add column image_alt text;

-- Copy only approved image display metadata into the existing public projection.
-- Do not open public access to images on blocked presentation SKUs or private recipes.
create function public.populate_component_offer_image() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 select i.id,i.url,i.alt into NEW.image_id,NEW.image_url,NEW.image_alt
 from public.product_images i
 where i.product_id=NEW.presentation_product and i.combo_connector=NEW.connector;
 return NEW;
end $$;
create trigger populate_component_offer_image before insert or update of presentation_product,connector
 on public.component_offer_publications for each row execute function public.populate_component_offer_image();

create function public.sync_component_offer_image() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if TG_OP='TRUNCATE' then
  update public.component_offer_publications set image_id=null,image_url=null,image_alt=null;
  return null;
 end if;
 if TG_OP<>'INSERT' then
  update public.component_offer_publications set image_id=null,image_url=null,image_alt=null
   where presentation_product=OLD.product_id and connector=OLD.combo_connector;
 end if;
 if TG_OP<>'DELETE' then
  if NEW.combo_connector is not null and not exists(
   select 1 from public.component_recipes where presentation_product=NEW.product_id
  ) then raise exception 'COMBO_IMAGE_WRONG_PRODUCT'; end if;
  update public.component_offer_publications set image_id=NEW.id,image_url=NEW.url,image_alt=NEW.alt
   where presentation_product=NEW.product_id and connector=NEW.combo_connector;
 end if;
 return null;
end $$;
create trigger sync_component_offer_image after insert or update or delete
 on public.product_images for each row execute function public.sync_component_offer_image();
create trigger clear_component_offer_images after truncate on public.product_images
 for each statement execute function public.sync_component_offer_image();

-- Existing administrative authorization remains in the server action. No anonymous RPC.
create function public.set_component_offer_images(p_recipe_id uuid,p_cc_image_id uuid,p_lightning_image_id uuid)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare pid uuid;
begin
 select presentation_product into strict pid from public.component_recipes where id=p_recipe_id for update;
 perform 1 from public.product_images where product_id=pid order by id for update;
 if p_cc_image_id is not null and p_cc_image_id=p_lightning_image_id then raise exception 'COMBO_IMAGE_REUSED'; end if;
 if (p_cc_image_id is not null and not exists(select 1 from public.product_images where id=p_cc_image_id and product_id=pid))
 or (p_lightning_image_id is not null and not exists(select 1 from public.product_images where id=p_lightning_image_id and product_id=pid))
 then raise exception 'COMBO_IMAGE_WRONG_PRODUCT'; end if;
 update public.product_images set combo_connector=null where product_id=pid and combo_connector is not null;
 update public.product_images set combo_connector='cc' where id=p_cc_image_id;
 update public.product_images set combo_connector='lightning' where id=p_lightning_image_id;
end $$;

revoke all on function public.populate_component_offer_image(),public.sync_component_offer_image(),public.set_component_offer_images(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.populate_component_offer_image(),public.sync_component_offer_image(),public.set_component_offer_images(uuid,uuid,uuid) to service_role;
grant select,update(combo_connector) on public.product_images to service_role;
-- New columns on the projection are intentionally public display metadata, under its existing RLS.
grant select(image_id,image_url,image_alt) on public.component_offer_publications to anon,authenticated;

create or replace view public.public_component_offers with(security_barrier=true,security_invoker=true) as
select o.recipe_id id,o.name,o.connector,o.head_product,h.slug head_slug,p.slug cable_slug,
 least(h.stock,p.stock) available,o.presentation_product,o.combo_list_price,o.combo_transfer_price,o.price_version,
 o.image_id,o.image_url,o.image_alt
from public.component_offer_publications o
join public.public_catalog_skus h on h.id=o.head_product
join public.public_catalog_skus p on p.id=o.cable_product
where h.price>0 and p.price>0;

commit;
