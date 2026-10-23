-- Rebuild-only ACL. Exact application operations; no public blanket grants.
begin;
revoke create on schema public from public,anon,authenticated;
grant usage on schema public to anon,authenticated,service_role;
-- No Data API auto-grants, and no global PUBLIC EXECUTE on future helpers.
alter default privileges for role postgres in schema public revoke all on tables from public,anon,authenticated,service_role;
alter default privileges for role postgres in schema public revoke all on sequences from public,anon,authenticated,service_role;
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['categories','products','product_images','product_attributes','customers','orders','order_items','settings','inventory_movements','analytics_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
grant select,insert,update,delete on public.categories,public.products,public.product_images,public.product_attributes,public.customers,public.orders,public.order_items,public.settings to service_role;
grant select,insert on public.inventory_movements,public.analytics_events to service_role;
revoke all on function public.set_updated_at() from public,anon,authenticated;
grant execute on function public.set_updated_at() to service_role;
commit;
