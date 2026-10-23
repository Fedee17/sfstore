-- Rebuild-only: immediately after purchase foundation, before its first consumer.
begin;
revoke all on public.suppliers,public.purchases,public.purchase_items from public,anon,authenticated,service_role;
grant select,insert,update on public.suppliers,public.purchases to service_role;
grant select,insert,update,delete on public.purchase_items to service_role;
commit;
