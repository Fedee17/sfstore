-- Public attribute boundary: schema-only, no product/attribute data writes.
-- Apply only after review and a separate Production authorization.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

do $$ begin
 if md5(pg_get_viewdef('public.public_catalog_skus'::regclass,true)) <> 'aed38845c0979abee828062070ee310e'
 or not (select reloptions @> array['security_barrier=true','security_invoker=true'] from pg_class where oid='public.public_catalog_skus'::regclass)
 or not (select relrowsecurity from pg_class where oid='public.product_attributes'::regclass)
 or not (select rolbypassrls from pg_roles where rolname='service_role')
 or exists(select 1 from pg_policy where polrelid='public.product_attributes'::regclass and polname='catalog_public_attribute_names')
 then raise exception 'PUBLIC_ATTRIBUTE_BOUNDARY_PREFLIGHT_CHANGED'; end if;
end $$;

-- Explicit commercial names and legacy aliases only. Unknown names stay private.
-- The policy and view use identical lists, checked by regression tests.
-- AND with existing policies; do not replace product visibility or write guards.
create policy catalog_public_attribute_names on public.product_attributes
as restrictive for select to anon,authenticated
using (coalesce(lower(btrim(name)) = any(array[
  'marca',
  'tipo',
  'categoría comercial',
  'commercial_category',
  'olfactory_family',
  'familia olfativa',
  'familia / estilo olfativo',
  'intensity',
  'intensidad',
  'occasion',
  'ocasión',
  'momento',
  'momento de uso',
  'gender',
  'género',
  'genero',
  'decant_available',
  'mate_type',
  'tipo de mate',
  'material',
  'color',
  'use_case',
  'uso',
  'contenido',
  'volumen',
  'capacidad',
  'boca',
  'diseño',
  'acrílico'
 ]::text[]),false));

-- Explicit filter also protects privileged readers of the public projection.
create or replace view public.public_catalog_skus with (security_barrier=true,security_invoker=true) as
select p.id,p.name,p.slug,p.short_description,p.description,p.price,p.stock,p.featured,p.updated_at,p.sku,
 p.status,p.historical_identity,p.category_id,p.family_id,p.commercial_label,
 f.name family_name,f.slug family_slug,
 jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'is_active',c.is_active) categories,
 c.slug category_slug,
 coalesce((select jsonb_agg(jsonb_build_object('url',i.url,'alt',i.alt,'sort_order',i.sort_order,'is_primary',i.is_primary) order by i.is_primary desc,i.sort_order,i.id)
   from public.product_images i where i.product_id=p.id),'[]'::jsonb) product_images,
 coalesce((select jsonb_agg(jsonb_build_object('name',a.name,'value',a.value,'sort_order',a.sort_order) order by a.sort_order,a.id)
   from public.product_attributes a where a.product_id=p.id and coalesce(lower(btrim(a.name)) = any(array[
  'marca',
  'tipo',
  'categoría comercial',
  'commercial_category',
  'olfactory_family',
  'familia olfativa',
  'familia / estilo olfativo',
  'intensity',
  'intensidad',
  'occasion',
  'ocasión',
  'momento',
  'momento de uso',
  'gender',
  'género',
  'genero',
  'decant_available',
  'mate_type',
  'tipo de mate',
  'material',
  'color',
  'use_case',
  'uso',
  'contenido',
  'volumen',
  'capacidad',
  'boca',
  'diseño',
  'acrílico'
 ]::text[]),false)),'[]'::jsonb) product_attributes,
 coalesce((select jsonb_object_agg(o.name,v.label) from public.product_family_options o
   join public.product_family_option_values v on v.option_id=o.id
   where o.family_id=p.family_id and p.variant_choices->>o.id::text=v.id::text),'{}'::jsonb) variant_options
from public.products p join public.categories c on c.id=p.category_id
left join public.product_families f on f.id=p.family_id
where p.status='active' and not p.historical_identity and p.web_visible and not p.commercial_blocked and c.is_active;

-- Fail closed if the public contract loses its invoker/barrier properties.
do $$ begin
 if not (select reloptions @> array['security_barrier=true','security_invoker=true'] from pg_class where oid='public.public_catalog_skus'::regclass)
 then raise exception 'PUBLIC_ATTRIBUTE_BOUNDARY_POSTCHECK_FAILED'; end if;
end $$;
commit;
