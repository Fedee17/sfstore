-- Prepared scheduler payload; executed only by a trusted DB connection.
-- No HTTP endpoint, bearer token, login password or service_role credential.
begin;
set local role sfstore_reservation_executor;
set local statement_timeout='20s';
select sfstore_maintenance.run_checkout_expiration(gen_random_uuid(),100) as result;
commit;
