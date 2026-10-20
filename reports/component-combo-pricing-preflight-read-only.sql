-- Read-only template for the future candidate review; not executed in Production.
begin read only;
set local statement_timeout='10s';
set local lock_timeout='3s';
with expected(signature,expected_sha256) as(values
 ('public.approve_checkout_shipping_quote(uuid,uuid,numeric)','67c1dbafe407805c5e8931678312a7f72caca6174cfb405c3a9f1ebc576ac8ea'),
 ('public.create_checkout_atomic(uuid,uuid,jsonb)','c25d8fec397a868f1ffe27975597b0e2fe5fbab916fea56dfa45a61e1874eb7e'),
 ('public.create_store_sale(uuid,uuid,text,text,jsonb)','64310d85297ca028bda2af63be530df6030d8d02769a1dccb25bd9f73356be40'),
 ('public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','9276eec86917f41288fedb58adaf28dbcc3713d5f6616c89bf0021811f2ab543'),
 ('public.request_checkout_shipping_quote(uuid,uuid,jsonb)','4976adebd1df9da63bae7028f9c6e97dbdab43e3f3f90950115101d365120990')
),actual as(
 select e.signature,e.expected_sha256,p.oid,p.prosecdef,p.prorettype,
 encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') actual_sha256
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
)
select current_database() database_name,current_setting('server_version_num') server_version,
 current_setting('transaction_read_only') read_only,
 signature,actual_sha256,actual_sha256=expected_sha256 contract_matches,
 not prosecdef and prorettype='jsonb'::regtype expected_function_boundary,
 has_function_privilege('service_role',oid,'EXECUTE') service_execute,
 not has_function_privilege('anon',oid,'EXECUTE') and not has_function_privilege('authenticated',oid,'EXECUTE') public_execution_denied
from actual order by signature;
rollback;
