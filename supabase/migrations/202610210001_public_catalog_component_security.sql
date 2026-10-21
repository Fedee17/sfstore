-- REVIEW ONLY: separate approval required. Original charger candidate and migrations remain unchanged.
begin;
-- PROPOSAL ONLY. NOT AUTHORIZED FOR PRODUCTION. Tested on schema-only certified snapshot plus synthetic rows.
-- Apply only after live catalog fingerprint verification; preserve all existing policies and writes.
set local statement_timeout='15s';
set local lock_timeout='3s';
do $$ begin
 if (select reloptions from pg_class where oid='public.public_catalog_skus'::regclass) is distinct from array['security_barrier=true']::text[]
 or pg_get_userbyid((select relowner from pg_class where oid='public.public_catalog_skus'::regclass))<>'postgres'
 or md5(pg_get_viewdef('public.public_catalog_skus'::regclass,true))<>'aed38845c0979abee828062070ee310e'
 or exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname in('products','categories','product_images','product_attributes','product_families','product_family_options','product_family_option_values') and not relrowsecurity)
 or exists(select 1 from pg_policies where schemaname='public' and policyname like 'catalog_invoker_%')
 then raise exception 'CATALOG_SECURITY_PREFLIGHT_CHANGED'; end if;
end $$;
-- Read only the columns required by the existing projection and its predicates/order.
grant select(updated_at,sku,family_id,commercial_label,variant_choices) on public.products to anon,authenticated;
grant select(id) on public.product_images,public.product_attributes to anon,authenticated;
grant select(id,name,slug) on public.product_families to anon,authenticated;
grant select(id,family_id,name) on public.product_family_options to anon,authenticated;
grant select(id,option_id,label) on public.product_family_option_values to anon,authenticated;
-- Restrictive policy ANDs with the existing SEC-01 visibility; no permissive bypass.
create policy catalog_invoker_web_visibility on public.products as restrictive for select to anon,authenticated
 using(web_visible and not commercial_blocked);
create policy catalog_invoker_family_read on public.product_families for select to anon,authenticated
 using(exists(select 1 from public.products p where p.family_id=product_families.id));
create policy catalog_invoker_option_read on public.product_family_options for select to anon,authenticated
 using(exists(select 1 from public.products p where p.family_id=product_family_options.family_id and p.variant_choices ? product_family_options.id::text));
create policy catalog_invoker_value_read on public.product_family_option_values for select to anon,authenticated
 using(exists(select 1 from public.products p join public.product_family_options o on o.family_id=p.family_id
 where o.id=product_family_option_values.option_id and p.variant_choices->>o.id::text=product_family_option_values.id::text));
alter view public.public_catalog_skus set(security_invoker=true);

-- REVIEW BODY: incorporated into the single-transaction combined proposal, never run standalone.
do $$ begin
 if to_regclass('public.component_offer_publications') is not null
 or to_regprocedure('public.refresh_component_offer_publication(uuid)') is not null
 or to_regprocedure('public.sync_component_offer_publication()') is not null
 or to_regclass('public.component_combo_pricing') is null
 or (select reloptions from pg_class where oid='public.public_component_offers'::regclass) is distinct from array['security_barrier=true']::text[]
 or md5(pg_get_viewdef('public.public_component_offers'::regclass,true))<>'40c21355cdf1e17e958e00134f2b07af'
 or not (select rolbypassrls from pg_roles where rolname='service_role')
 then raise exception 'COMPONENT_PUBLICATION_PREFLIGHT_CHANGED'; end if;
end $$;

-- Two public commercial projections per recipe, NOT a stock or reservation ledger.
-- No source/legacy SKU, cost, purchase, actor, audit JSON or administrative timestamps.
create table public.component_offer_publications (
 recipe_id uuid not null references public.component_recipes(id) on delete cascade,
 connector text not null check(connector in('cc','lightning')),
 name text not null,
 head_product uuid not null references public.products(id),
 cable_product uuid not null references public.products(id),
 presentation_product uuid not null references public.products(id),
 combo_list_price numeric(12,2) not null check(combo_list_price>0),
 combo_transfer_price numeric(12,2) not null check(combo_transfer_price>0),
 price_version uuid not null,
 primary key(recipe_id,connector),
 check(head_product<>cable_product),
 check(round(combo_list_price*0.75,2)=combo_transfer_price)
);
alter table public.component_offer_publications enable row level security;
revoke all on public.component_offer_publications from public,anon,authenticated,service_role;
grant select on public.component_offer_publications to anon,authenticated;
grant select,insert,update,delete on public.component_offer_publications to service_role;

create policy component_publication_read on public.component_offer_publications
 for select to anon,authenticated using(
 exists(select 1 from public.public_catalog_skus h where h.id=head_product and h.price>0)
 and exists(select 1 from public.public_catalog_skus p where p.id=cable_product and p.price>0)
);

-- Called by the same authorized service transaction that changes the private source.
-- Existing commercial RPCs already serialize on the recipe/products; keep that lock order.
create function public.refresh_component_offer_publication(p_recipe uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform 1 from public.component_recipes where id=p_recipe for update;
 delete from public.component_offer_publications where recipe_id=p_recipe;
 insert into public.component_offer_publications
 (recipe_id,connector,name,head_product,cable_product,presentation_product,combo_list_price,combo_transfer_price,price_version)
 select r.id,c.connector,r.name,r.head_product,c.product_id,r.presentation_product,rule.list_price,rule.transfer_target,rule.version
 from public.component_recipes r
 join public.component_combo_pricing rule on rule.recipe_id=r.id and rule.enabled
 cross join lateral(values('cc',r.cable_cc_product),('lightning',r.cable_lightning_product)) c(connector,product_id)
 join public.products h on h.id=r.head_product
 join public.products p on p.id=c.product_id
 where r.id=p_recipe and r.prices_approved and h.price>0 and p.price>0
 and exists(select 1 from public.component_recipe_price_approvals a where a.recipe_id=r.id
  and a.prices->>h.id::text=h.price::text and a.prices->>p.id::text=p.price::text);
end $$;

create function public.sync_component_offer_publication() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old_id uuid; new_id uuid; rid uuid;
begin
 if TG_OP='TRUNCATE' then
  delete from public.component_offer_publications;
  return null;
 end if;
 if TG_TABLE_NAME='component_recipes' then
  if TG_OP<>'INSERT' then old_id:=OLD.id; end if;
  if TG_OP<>'DELETE' then new_id:=NEW.id; end if;
 else
  if TG_OP<>'INSERT' then old_id:=OLD.recipe_id; end if;
  if TG_OP<>'DELETE' then new_id:=NEW.recipe_id; end if;
 end if;
 for rid in select distinct x from unnest(array[old_id,new_id]) x where x is not null order by x loop
  perform public.refresh_component_offer_publication(rid);
 end loop;
 return null;
end $$;
revoke all on function public.refresh_component_offer_publication(uuid),public.sync_component_offer_publication() from public,anon,authenticated;
grant execute on function public.refresh_component_offer_publication(uuid),public.sync_component_offer_publication() to service_role;

create trigger sync_public_component_recipe after insert or update or delete on public.component_recipes
 for each row execute function public.sync_component_offer_publication();
create trigger sync_public_component_pricing after insert or update or delete on public.component_combo_pricing
 for each row execute function public.sync_component_offer_publication();
create trigger sync_public_component_approval after insert or update or delete on public.component_recipe_price_approvals
 for each row execute function public.sync_component_offer_publication();
create trigger clear_public_component_recipe after truncate on public.component_recipes
 for each statement execute function public.sync_component_offer_publication();
create trigger clear_public_component_pricing after truncate on public.component_combo_pricing
 for each statement execute function public.sync_component_offer_publication();
create trigger clear_public_component_approval after truncate on public.component_recipe_price_approvals
 for each statement execute function public.sync_component_offer_publication();

-- Bootstrap only public publication metadata for existing recipes, not inventory or prices.
do $$ declare rid uuid; begin
 for rid in select id from public.component_recipes order by id loop
  perform public.refresh_component_offer_publication(rid);
 end loop;
end $$;

-- Preserve the existing names, types and order of the 12 output columns.
create or replace view public.public_component_offers with(security_barrier=true,security_invoker=true) as
select o.recipe_id id,o.name,o.connector,o.head_product,h.slug head_slug,p.slug cable_slug,
 least(h.stock,p.stock) available,o.presentation_product,o.combo_list_price,o.combo_transfer_price,o.price_version
from public.component_offer_publications o
join public.public_catalog_skus h on h.id=o.head_product
join public.public_catalog_skus p on p.id=o.cable_product
where h.price>0 and p.price>0;

-- No new public access to private recipe/pricing/audit tables or business functions.
do $$ begin
 if exists(select 1 from pg_class c cross join(values('anon'),('authenticated')) r(n)
  where c.relnamespace='public'::regnamespace and c.relname in
  ('component_recipes','component_recipe_price_approvals','component_purchase_compositions','component_inventory_operations','component_inventory_reversals','component_combo_pricing','component_combo_price_audit','component_combo_returns')
  and (has_any_column_privilege(r.n,c.oid,'SELECT') or has_table_privilege(r.n,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')))
 then raise exception 'PRIVATE_COMPONENT_ACCESS_NOT_DENIED'; end if;
end $$;

commit;
