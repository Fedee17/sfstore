import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {hashStagingSql} from './prepare-checkout-staging.mjs';

const sources=[
  'supabase/migrations/202610120003_checkout_expiration_executor.sql',
  'supabase/migrations/202610120004_checkout_expiration_search_path.sql',
];

export function prepareCheckoutExpirationRollout(root=resolve(import.meta.dirname,'..')) {
  const manifest=JSON.parse(readFileSync(resolve(root,'staging/migration-manifest.json'),'utf8'));
  const bodies=sources.map(source=>{
    const sql=readFileSync(resolve(root,source),'utf8').replace(/\r\n/g,'\n');
    const entry=manifest.applicationOrder.find(entry=>entry.source===source);
    if(!entry||hashStagingSql(sql)!==entry.sourceSha256)throw new Error('EXPIRATION_CANONICAL_SOURCE_CHANGED: '+source);
    if(!sql.startsWith('begin;')||!sql.trimEnd().endsWith('commit;'))throw new Error('EXPIRATION_TRANSACTION_CHANGED');
    return sql.slice('begin;'.length,sql.lastIndexOf('commit;'));
  });
  const declaration='create function public.get_checkout_expiration_health()';
  if(bodies[0].split(declaration).length!==2)throw new Error('EXPIRATION_HEALTH_DECLARATION_CHANGED');
  bodies[0]=bodies[0].replace(declaration,'create or replace function public.get_checkout_expiration_health()');
  return `-- Generated from canonical 003/004; no database connection or scheduler activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
declare signature text; health oid:=to_regprocedure('public.get_checkout_expiration_health()');
begin
 if current_setting('sfstore.expiration_install_approved',true) is distinct from 'yes'
 or current_setting('sfstore.expected_database',true) is distinct from current_database()
 or current_user<>'postgres' then
  raise exception 'EXPIRATION_INSTALL_NOT_APPROVED_FOR_DATABASE';
 end if;
 if to_regnamespace('sfstore_maintenance') is not null
 or exists(select 1 from pg_roles where rolname='sfstore_reservation_executor') then
  raise exception 'EXPIRATION_ALREADY_PREPARED_REVIEW_BEFORE_CHANGING';
 end if;
 if health is null or not exists(
  select 1 from pg_proc p join pg_language l on l.oid=p.prolang
  where p.oid=health and l.lanname='sql' and not p.prosecdef
  and p.prorettype='jsonb'::regtype and pg_get_userbyid(p.proowner)='postgres'
  and md5(p.prosrc)=nullif(current_setting('sfstore.expiration_expected_health_md5',true),'')
 ) then raise exception 'EXPIRATION_MANUAL_MONITOR_CHANGED'; end if;
 foreach signature in array array['public.get_checkout_expiration_health()',
  'public.expire_checkout_reservations(integer)','public.transition_checkout_atomic(uuid,text)'] loop
  if to_regprocedure(signature) is null or not exists(
   select 1 from pg_proc where oid=to_regprocedure(signature) and not prosecdef
   and pg_get_userbyid(proowner)='postgres'
  ) then raise exception 'EXPIRATION_BASE_CONTRACT_CHANGED'; end if;
  if has_function_privilege('anon',signature,'EXECUTE')
  or has_function_privilege('authenticated',signature,'EXECUTE')
  or not has_function_privilege('service_role',signature,'EXECUTE') then
   raise exception 'EXPIRATION_BASE_PERMISSIONS_CHANGED';
  end if;
 end loop;
 foreach signature in array array['public.expire_checkout_reservations(integer)',
  'public.transition_checkout_atomic(uuid,text)','public.prevent_historical_inventory_movement()'] loop
  if to_regprocedure(signature) is null or md5(pg_get_functiondef(to_regprocedure(signature)))
   is distinct from (nullif(current_setting('sfstore.expiration_expected_contracts',true),'')::jsonb->>signature) then
   raise exception 'EXPIRATION_REVIEWED_CONTRACT_CHANGED';
  end if;
 end loop;
 if has_schema_privilege('anon','public','CREATE')
 or has_schema_privilege('authenticated','public','CREATE') then
  raise exception 'EXPIRATION_UNTRUSTED_SCHEMA_CREATE';
 end if;
end $preflight$;
${bodies.join('\n')}
commit;
`;
}

if(process.argv[1]===import.meta.filename)process.stdout.write(prepareCheckoutExpirationRollout());
