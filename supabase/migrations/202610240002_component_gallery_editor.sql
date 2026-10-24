-- Local candidate only. Reuse product_images and the existing upload recovery ledger.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
drop index public.product_image_one_per_combo_connector;
alter table public.component_offer_publications add column image_gallery jsonb not null default '[]'::jsonb;
-- Distinct URLs between connectors remain enforced by product_image_distinct_combo_url.

create function public.refresh_component_gallery(p_product_id uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.component_offer_publications o set
  image_gallery=coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'url',i.url,'alt',i.alt,'sort_order',i.sort_order,'is_primary',i.is_primary) order by i.is_primary desc,i.sort_order,i.id) from public.product_images i where i.product_id=p_product_id and i.combo_connector=o.connector),'[]'::jsonb),
  image_id=(select i.id from public.product_images i where i.product_id=p_product_id and i.combo_connector=o.connector order by i.is_primary desc,i.sort_order,i.id limit 1),
  image_url=(select i.url from public.product_images i where i.product_id=p_product_id and i.combo_connector=o.connector order by i.is_primary desc,i.sort_order,i.id limit 1),
  image_alt=(select i.alt from public.product_images i where i.product_id=p_product_id and i.combo_connector=o.connector order by i.is_primary desc,i.sort_order,i.id limit 1)
 where o.presentation_product=p_product_id;
end $$;
create or replace function public.populate_component_offer_image() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 select i.id,i.url,i.alt into NEW.image_id,NEW.image_url,NEW.image_alt from public.product_images i
 where i.product_id=NEW.presentation_product and i.combo_connector=NEW.connector
 order by i.is_primary desc,i.sort_order,i.id limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'url',i.url,'alt',i.alt,'sort_order',i.sort_order,'is_primary',i.is_primary) order by i.is_primary desc,i.sort_order,i.id),'[]'::jsonb)
 into NEW.image_gallery from public.product_images i where i.product_id=NEW.presentation_product and i.combo_connector=NEW.connector;
 return NEW;
end $$;
create or replace function public.sync_component_offer_image() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if TG_OP='TRUNCATE' then
  update public.component_offer_publications set image_id=null,image_url=null,image_alt=null,image_gallery='[]';
  return null;
 end if;
 if TG_OP<>'INSERT' then perform public.refresh_component_gallery(OLD.product_id); end if;
 if TG_OP<>'DELETE' then
  if NEW.combo_connector is not null and not exists(select 1 from public.component_recipes where presentation_product=NEW.product_id) then raise exception 'COMBO_IMAGE_WRONG_PRODUCT'; end if;
  perform public.refresh_component_gallery(NEW.product_id);
 end if;
 return null;
end $$;

create function public.save_component_gallery_atomic(p_operation_key uuid,p_product_id uuid,p_payload jsonb,p_expected_version text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op jsonb; c text:=p_payload->>'connector'; img jsonb; pos integer; v_result jsonb; pr public.products%rowtype; folder text; path text;
begin
 -- A forged form cannot send any commercial fields to this entry point.
 if c is null or c not in ('cc','lightning') or p_payload->'product' is distinct from '{}'::jsonb
  or p_payload->'attributes' is distinct from '[]'::jsonb
  or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('product','attributes','images','connector')) then raise exception 'PRODUCT_GALLERY_INVALID_PAYLOAD'; end if;
 op:=public.prepare_product_save_operation(p_operation_key,'update_product',p_product_id,p_payload,p_expected_version);
 if op->>'status'='committed' then return op->'result'; end if;
 select * into strict pr from public.products where id=p_product_id for update;
 perform 1 from public.component_recipes where presentation_product=p_product_id for update;
 if not found then raise exception 'PRODUCT_GALLERY_NOT_PRESENTATION'; end if;
 if public.get_product_save_version(p_product_id) is distinct from p_expected_version then raise exception 'PRODUCT_STALE_VERSION'; end if;
 folder:='products/'||p_product_id::text||'/'||c||'/';
 if p_payload->'images' <> 'null'::jsonb then
  if jsonb_typeof(p_payload->'images') is distinct from 'array' or jsonb_array_length(p_payload->'images')>100 then raise exception 'PRODUCT_GALLERY_INVALID_IMAGES'; end if;
  -- Uploads append/retry; removals use the existing gallery's explicit delete action.
  if exists(select 1 from public.product_images i where i.product_id=p_product_id and i.combo_connector=c
   and not exists(select 1 from jsonb_array_elements(p_payload->'images') x where x->>'id'=i.id::text)) then raise exception 'PRODUCT_GALLERY_REMOVAL_NOT_ALLOWED'; end if;
  pos:=0;
  for img in select value from jsonb_array_elements(p_payload->'images') loop
   if nullif(img->>'id','') is null or nullif(img->>'url','') is null or jsonb_typeof(img->'is_primary') is distinct from 'boolean' then raise exception 'PRODUCT_GALLERY_INVALID_IMAGE'; end if;
   if exists(select 1 from public.product_images where id=(img->>'id')::uuid and (product_id<>p_product_id or combo_connector is distinct from c or url<>img->>'url')) then raise exception 'PRODUCT_IMAGE_ID_CONFLICT'; end if;
   if not exists(select 1 from public.product_images where id=(img->>'id')::uuid) then
    path:=img->>'path';
    if path is null or left(path,length(folder))<>folder or path ~ '(^/|(^/)\.\.(/|$)|[?#\\])'
      or split_part(img->>'url','/storage/v1/object/public/product-images/',2)<>path
      or not exists(select 1 from public.product_storage_tasks t where t.operation_key=p_operation_key and t.storage_path=path and t.action='reconcile'
       and t.expected_metadata->>'content_hash'=img->>'content_hash' and t.expected_metadata->>'size'=img->>'size' and t.expected_metadata->>'mime'=img->>'mime') then raise exception 'PRODUCT_STORAGE_TASK_REQUIRED'; end if;
   end if;
   insert into public.product_images(id,product_id,url,alt,sort_order,is_primary,combo_connector)
    values((img->>'id')::uuid,p_product_id,img->>'url',img->>'alt',pos,(img->>'is_primary')::boolean,c)
    on conflict(id) do update set alt=excluded.alt,sort_order=excluded.sort_order,is_primary=excluded.is_primary;
   pos:=pos+1;
  end loop;
  if exists(select 1 from public.product_images where product_id=p_product_id and combo_connector=c group by product_id having count(*) filter(where is_primary)<>1)
    or (select count(*) from jsonb_array_elements(p_payload->'images'))<>(select count(distinct x->>'id') from jsonb_array_elements(p_payload->'images') x) then raise exception 'PRODUCT_DUPLICATE_IMAGE_OR_PRIMARY'; end if;
 end if;
 v_result:=jsonb_build_object('product_id',p_product_id,'version',public.get_product_save_version(p_product_id),'product',jsonb_build_object('id',pr.id,'slug',pr.slug,'status',pr.status,'category_id',pr.category_id,'updated_at',pr.updated_at));
 update public.product_save_operations set status='committed',result=v_result where operation_key=p_operation_key;
 return v_result;
end $$;

create function public.edit_component_gallery_image(p_product_id uuid,p_connector text,p_image_id uuid,p_action text)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare img public.product_images%rowtype; neighbor uuid; delta integer; task uuid; storage_path text;
begin
 if p_connector is null or p_connector not in ('cc','lightning') or p_action is null or p_action not in ('primary','previous','next','delete') then raise exception 'PRODUCT_GALLERY_INVALID_ACTION'; end if;
 perform 1 from public.products where id=p_product_id for update;
 perform 1 from public.component_recipes where presentation_product=p_product_id for update;
 if not found then raise exception 'PRODUCT_GALLERY_NOT_PRESENTATION'; end if;
 select * into strict img from public.product_images where id=p_image_id and product_id=p_product_id and combo_connector=p_connector for update;
 if p_action='delete' then
  delete from public.product_images where id=img.id;
  storage_path:=split_part(img.url,'/storage/v1/object/public/product-images/',2);
  if storage_path<>'' then
   -- Same deferred reconciliation ledger as the normal editor; never DELETE Storage here.
   task:=gen_random_uuid();
   insert into public.product_save_operations(operation_key,operation_type,product_id,payload_hash,status,result)
    values(task,'update_product',p_product_id,encode(sha256(convert_to(img.id::text,'UTF8')),'hex'),'committed',jsonb_build_object('deleted_image',img.id));
   perform public.enqueue_product_storage_task(task,p_product_id,'reconcile',storage_path,jsonb_build_object('path',storage_path),img.id);
  end if;
 elsif p_action='primary' then
  update public.product_images set is_primary=(id=img.id) where product_id=p_product_id and combo_connector=p_connector;
 else
  delta:=case when p_action='previous' then -1 else 1 end;
  select id into neighbor from public.product_images where product_id=p_product_id and combo_connector=p_connector and sort_order=img.sort_order+delta;
  if neighbor is not null then
   update public.product_images set sort_order=case when id=img.id then img.sort_order+delta else img.sort_order end where id in(img.id,neighbor);
  end if;
 end if;
 -- Normalize only this connector. The other gallery and commercial rows are untouched.
 with numbered as(select id,(row_number() over(order by sort_order,created_at,id)-1)::integer n from public.product_images where product_id=p_product_id and combo_connector=p_connector)
 update public.product_images i set sort_order=n.n from numbered n where i.id=n.id;
 if not exists(select 1 from public.product_images where product_id=p_product_id and combo_connector=p_connector and is_primary) then
  update public.product_images set is_primary=true where id=(select id from public.product_images where product_id=p_product_id and combo_connector=p_connector order by sort_order,id limit 1);
 end if;
end $$;
revoke all on function public.refresh_component_gallery(uuid),public.save_component_gallery_atomic(uuid,uuid,jsonb,text),public.edit_component_gallery_image(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.refresh_component_gallery(uuid),public.save_component_gallery_atomic(uuid,uuid,jsonb,text),public.edit_component_gallery_image(uuid,text,uuid,text) to service_role;
-- The former two-selector RPC is no longer used or accessible by the application role.
revoke execute on function public.set_component_offer_images(uuid,uuid,uuid) from service_role;
grant select(image_gallery) on public.component_offer_publications to anon,authenticated;
create or replace view public.public_component_offers with(security_barrier=true,security_invoker=true) as
select o.recipe_id id,o.name,o.connector,o.head_product,h.slug head_slug,p.slug cable_slug,
 least(h.stock,p.stock) available,o.presentation_product,o.combo_list_price,o.combo_transfer_price,o.price_version,
 o.image_id,o.image_url,o.image_alt,o.image_gallery
from public.component_offer_publications o
join public.public_catalog_skus h on h.id=o.head_product
join public.public_catalog_skus p on p.id=o.cable_product
where h.price>0 and p.price>0;
-- Populate only display metadata for existing associations; no photographs or commerce change.
select public.refresh_component_gallery(presentation_product) from public.component_recipes;
commit;
