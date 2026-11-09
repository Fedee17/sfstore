begin;
set local lock_timeout='2s';
set local statement_timeout='20s';

create function public.get_stock_health_snapshot()
returns jsonb language sql stable security invoker
set search_path=pg_catalog,public,pg_temp as $$
  with reserved as (
    select m.product_id,sum(m.quantity) as units
    from public.inventory_movements m
    join public.checkout_operations op on op.order_id=m.order_id and op.state='pending'
    where m.movement_type='reservation'
    group by m.product_id
  ), inventory as (
    select p.id,p.category_id,p.name,p.sku,p.family_id,p.status,p.created_at,
      p.stock as available,coalesce(r.units,0) as reserved,p.cost::text as cost,
      coalesce((select string_agg(o.name||': '||v.label,', ' order by o.name,v.label)
        from jsonb_each_text(p.variant_choices) choice
        join public.product_family_option_values v on v.id::text=choice.value
        join public.product_family_options o on o.id=v.option_id and o.family_id=p.family_id),'') as variant_label
    from public.products p left join reserved r on r.product_id=p.id
    where not p.historical_identity and p.status<>'archived'
      and not exists(select 1 from public.component_recipes recipe where recipe.presentation_product=p.id)
    order by p.id limit 10001
  )
  select jsonb_build_object('asOf',statement_timestamp(),
    'products',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from inventory i),'[]'::jsonb))
$$;
alter function public.get_stock_health_snapshot() owner to postgres;
revoke all on function public.get_stock_health_snapshot() from public,anon,authenticated;
grant execute on function public.get_stock_health_snapshot() to service_role;
comment on function public.get_stock_health_snapshot() is
  'Read-only stock/reservation snapshot. products.stock already excludes pending reservations. No expiration or inventory writes.';
commit;
