begin read only;
set local statement_timeout='10s';
set local lock_timeout='3s';
with expected as(
 select r.id,r.name,c.connector,r.head_product,h.slug head_slug,p.slug cable_slug,least(h.stock,p.stock) available,
 r.presentation_product,rule.list_price combo_list_price,rule.transfer_target combo_transfer_price,rule.version price_version
 from public.component_recipes r
 join public.component_combo_pricing rule on rule.recipe_id=r.id and rule.enabled
 cross join lateral(values('cc',r.cable_cc_product),('lightning',r.cable_lightning_product)) c(connector,product_id)
 join public.public_catalog_skus h on h.id=r.head_product
 join public.public_catalog_skus p on p.id=c.product_id
 where r.prices_approved and h.price>0 and p.price>0
 and exists(select 1 from public.component_recipe_price_approvals a where a.recipe_id=r.id
  and a.prices->>h.id::text=h.price::text and a.prices->>p.id::text=p.price::text)
), differences as(
 (select * from expected except select * from public.public_component_offers)
 union all
 (select * from public.public_component_offers except select * from expected)
), private_access as(
 select c.relname,r.n role from pg_class c cross join(values('anon'),('authenticated')) r(n)
 where c.relnamespace='public'::regnamespace and c.relname in
 ('component_recipes','component_recipe_price_approvals','component_purchase_compositions','component_inventory_operations','component_inventory_reversals','component_combo_pricing','component_combo_price_audit','component_combo_returns')
 and (has_any_column_privilege(r.n,c.oid,'SELECT') or has_table_privilege(r.n,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))
)
select jsonb_build_object(
 'read_only',current_setting('transaction_read_only')='on',
 'database',current_database(),
 'both_views_invoker',(select count(*)=2 from pg_class where oid in('public.public_catalog_skus'::regclass,'public.public_component_offers'::regclass) and reloptions @> array['security_invoker=true','security_barrier=true']),
 'private_component_access_denied',not exists(select 1 from private_access),
 'public_product_cost_denied',not has_column_privilege('anon','public.products','cost','SELECT') and not has_column_privilege('authenticated','public.products','cost','SELECT'),
 'projection_has_no_stock_or_private_fields',not exists(select 1 from pg_attribute where attrelid='public.component_offer_publications'::regclass and attnum>0 and attname in('stock','available','cost','actor','source_product','legacy_cable_product','prices','purchase_id')),
 'projection_rls_enabled',(select relrowsecurity from pg_class where oid='public.component_offer_publications'::regclass),
 'one_projection_policy',(select count(*)=1 from pg_policy where polrelid='public.component_offer_publications'::regclass),
 'public_refresh_execution_denied',not has_function_privilege('anon','public.refresh_component_offer_publication(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.refresh_component_offer_publication(uuid)','EXECUTE'),
 'no_definer_helpers',(select count(*)=2 and bool_and(not prosecdef) from pg_proc where oid in('public.refresh_component_offer_publication(uuid)'::regprocedure,'public.sync_component_offer_publication()'::regprocedure)),
 'offer_contract_matches_private_source',not exists(select 1 from differences),
 'public_offer_count',(select count(*) from public.public_component_offers)
) security_postcheck;
rollback;
