-- PAY-01 transition changes reservation evidence to sale under product/order locks.
-- Do not rely on broad inherited service_role UPDATE/default grants.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
grant update (movement_type,reason) on public.inventory_movements to service_role;
commit;
