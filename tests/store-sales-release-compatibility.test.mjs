import assert from 'node:assert/strict';
import { before,after,describe,test } from 'node:test';
import { randomUUID,createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
const root=resolve(import.meta.dirname,'..'),docker=process.env.SFSTORE_TEST_DOCKER;
const input=process.env.SFSTORE_RELEASE_REFERENCE_DIRECTORY;
const maintenance=process.env.SFSTORE_RELEASE_MAINTENANCE_DIRECTORY;
const roleCatalog=process.env.SFSTORE_RELEASE_ROLE_CATALOG;
const sqlFile='202610170001_store_sales_full_payment.sql';
const candidate=readFileSync(join(root,'supabase/migrations',sqlFile),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');

describe('release rehearsal: captured Production schema + applied 01/04a, synthetic data only, PostgreSQL 17.6',{
 skip:!docker||!input||!maintenance||!roleCatalog,concurrency:false,timeout:90000},()=>{
 let id,port,db,originalFunctions,originalAcl,originalPolicies,originalOwners,originalTables,baseline,legacy,category,actor;
 const results=[],artifact=join(root,'staging/runtime/store-sales-1c');
 const sql=name=>readFileSync(join(input,name),'utf8');
 function cmd(args){const r=spawnSync(docker,args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,'DISPOSABLE_DOCKER_FAILED');return r.stdout.trim();}
 async function client(){const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await c.connect();return c;}
 async function q(s,args=[]){return(await db.query(s,args)).rows;}
 async function functions(){return q("select p.oid::regprocedure::text identity,pg_get_userbyid(p.proowner) owner,encode(sha256(convert_to(replace(pg_get_functiondef(p.oid),E'\\r\\n',E'\\n'),'UTF8')),'hex') sha256 from pg_proc p where pronamespace='public'::regnamespace order by 1");}
 async function tableContracts(){return q(`select c.relname identity,encode(sha256(convert_to(jsonb_build_object(
   'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
   'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select jsonb_agg(jsonb_build_array(x.conname,x.contype,pg_get_constraintdef(x.oid),x.convalidated) order by x.conname) from pg_constraint x where x.conrelid=c.oid),
   'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname) from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid))::text,'UTF8')),'hex') sha256
   from pg_class c where c.relnamespace='public'::regnamespace and c.relname in('categories','products','orders','order_items','order_payments','inventory_movements') order by 1`);}
 async function acl(){return q("select 'relation' kind,c.oid::regclass::text identity,c.relacl::text acl from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in('r','v','S') union all select 'function',p.oid::regprocedure::text,p.proacl::text from pg_proc p where p.pronamespace='public'::regnamespace order by 1,2");}
 async function rows(){const r={};for(const table of ['orders','order_items','order_payments','inventory_movements','products'])r[table]=await q(`select to_jsonb(x)-'list_unit_price_snapshot'-'unit_cost_snapshot'-'store_payment_method' row from public.${table} x order by id`);return r;}
 async function columns(){return(await q("select count(*)::int n from information_schema.columns where table_schema='public' and ((table_name='order_items' and column_name in('list_unit_price_snapshot','unit_cost_snapshot')) or (table_name='order_payments' and column_name='store_payment_method'))"))[0].n;}
 async function sale(items,payments,key=randomUUID(),c=db){await c.query('set role service_role');try{return(await c.query('select create_store_sale_atomic($1,$2,$3,$4,$5,$6) result',[key,actor,'SYNTHETIC','SYNTHETIC RELEASE',JSON.stringify(items),JSON.stringify(payments)])).rows[0].result;}finally{await c.query('reset role');}}
 async function product(transfer=80,stock=2){const p=randomUUID();await q("insert into products(id,category_id,name,slug,short_description,price,transfer_price,cost,stock,status) values($1::uuid,$2,'SYNTHETIC',$1::text,'SYNTHETIC',100,$3,40,$4,'active')",[p,category,transfer,stock]);return p;}
 before(async()=>{
  assert.ok(input&&maintenance&&roleCatalog);assert.equal(sha(readFileSync(join(input,'minimum-launch-reconciliation/01-additive-checkout-contracts-review.sql'))),'bbb13e5ae7fa5e70cad4e475def8ddfe91ab0e8df2dd70becfc558c362dc0e5e');
  assert.equal(sha(readFileSync(join(maintenance,'04a-security-cutover-paused-review.sql'))),'d4936259eda9c3422157db3da79e755d52e1190a9c4a0b76e992e73ee1b61aed');
  id=cmd(['run','--detach','--rm','--name',`sfstore-release-${randomUUID().slice(0,8)}`,'--label','sfstore.synthetic=release-1c','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:17.6','-c','log_min_error_statement=panic']);
  port=Number(cmd(['port',id,'5432/tcp']).split(':').at(-1));for(let i=0;i<60;i++){try{db=await client();break;}catch{await delay(250);}}assert.ok(db);
  assert.equal((await q('show server_version_num'))[0].server_version_num,'170006');
  const roles=JSON.parse(readFileSync(roleCatalog,'utf8')).roles;
  for(const role of roles){if(role.name==='postgres'||role.name.startsWith('pg_'))continue;await q(`create role "${role.name.replaceAll('"','""')}" nologin ${role.bypassRls?'bypassrls':'nobypassrls'}`);}
  await q("create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create schema extensions;create extension pgcrypto with schema extensions;create extension \"uuid-ossp\" with schema extensions");
  const schema=sql('minimum-launch-production-public-schema-private.sql').replace(/^\\(?:un)?restrict[^\r\n]*$/gm,'');
  try{await q(schema);}catch(e){throw new Error(`CAPTURED_SCHEMA_RESTORE_FAILED:${e.code}`);}
  await q('set search_path=public');
  assert.equal((await q('select count(*)::int n from orders'))[0].n,0,'NO_REAL_DATA_RESTORED');
  await q(sql('minimum-launch-reconciliation/01-additive-checkout-contracts-review.sql'));
  await q("create schema storage authorization supabase_storage_admin;create table storage.objects(id uuid primary key,bucket_id text,name text,metadata jsonb);alter table storage.objects owner to supabase_storage_admin;alter table storage.objects enable row level security;grant usage on schema storage to service_role;grant select,insert,update,delete on storage.objects to service_role");
  await q(readFileSync(join(maintenance,'04a-security-cutover-paused-review.sql'),'utf8'));
  await q('update checkout_configuration set enabled=true'); // synthetic database ONLY, matching verified live release config.
  category=randomUUID();actor=randomUUID();await q("insert into categories(id,name,slug) values($1,'SYNTHETIC','synthetic-release')",[category]);
  const p=await product(80,5),key=randomUUID(),items=[{product_id:p,quantity:1,unit_price:80}],payments=[{method:'cash',amount:80}];
  const old=await sale(items,payments,key);legacy={...old,key,items,payments};assert.equal(old.total,80);
  baseline=await rows();originalFunctions=await functions();originalAcl=await acl();originalTables=await tableContracts();
  originalPolicies=await q("select * from pg_policies where schemaname='public' order by tablename,policyname");
  originalOwners=await q("select c.oid::regclass::text identity,pg_get_userbyid(c.relowner) owner from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1");
 });
 after(async()=>{mkdirSync(artifact,{recursive:true});writeFileSync(join(artifact,'release-rehearsal-private.json'),JSON.stringify({version:170006,reference:'captured public schema + approved 01/04a; no real data',candidateSha256:sha(readFileSync(join(root,'supabase/migrations',sqlFile))),results,finishedAt:new Date().toISOString()},null,2));await db?.end();if(id&&/^[a-f0-9]{64}$/.test(id))cmd(['stop','--time','3',id]);});
 function checked(name,fn){test(name,async()=>{try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,code:e.code??e.name});throw e;}});}
 checked('exact catalog-only preflight is read-only and passes on the captured model',async()=>{
  const r=await db.query(readFileSync(join(root,'reports/store-sales-release-preflight-catalog-only.sql'),'utf8'));
  const result=r.find(x=>x.rows?.[0]?.preflight)?.rows[0].preflight;
  assert.ok(result?.read_only);assert.equal(result.all_checks_passed,true,JSON.stringify(result.checks));assert.equal(result.commercial_rows_read,false);
 });
 checked('lock_timeout aborts migration without partial columns or function replacement',async()=>{
  const blocker=await client();try{await blocker.query('begin;lock table public.order_items in access share mode');const started=Date.now();await assert.rejects(db.query(candidate),e=>e.code==='55P03');results.push({name:'observed_lock_timeout_ms',value:Date.now()-started,passed:true});await q('rollback');assert.equal(await columns(),0);assert.deepEqual(await functions(),originalFunctions);assert.deepEqual(await rows(),baseline);}finally{await blocker.query('rollback');await blocker.end();}
 });
 checked('an error after DDL rolls back every column and preserves the original RPC and rows',async()=>{
  const failed=candidate.replace('CREATE OR REPLACE FUNCTION public.create_store_sale_atomic',()=>"DO $$BEGIN RAISE EXCEPTION 'SYNTHETIC_RELEASE_ABORT';END$$;\nCREATE OR REPLACE FUNCTION public.create_store_sale_atomic");
  await assert.rejects(db.query(failed),/SYNTHETIC_RELEASE_ABORT/);await q('rollback');assert.equal(await columns(),0);assert.deepEqual(await functions(),originalFunctions);assert.deepEqual(await rows(),baseline);
 });
 checked('failure immediately before COMMIT restores the replaced RPC and all permissions',async()=>{
  const failed=candidate.replace(/COMMIT;\s*$/,()=>"DO $$BEGIN RAISE EXCEPTION 'SYNTHETIC_BEFORE_COMMIT';END$$;\nCOMMIT;");
  await assert.rejects(db.query(failed),/SYNTHETIC_BEFORE_COMMIT/);await q('rollback');assert.equal(await columns(),0);assert.deepEqual(await functions(),originalFunctions);assert.deepEqual(await acl(),originalAcl);assert.deepEqual(await rows(),baseline);
 });
 checked('exact candidate applies to captured Production metadata with synthetic rows only',async()=>{
  const before=await q("select relname,relfilenode from pg_class where oid in('public.order_items'::regclass,'public.order_payments'::regclass) order by relname");
  const start=Date.now();await q(candidate);results.push({name:'migration_elapsed_ms_synthetic',value:Date.now()-start,passed:true});assert.equal(await columns(),3);assert.deepEqual(await rows(),baseline);assert.deepEqual(await q("select relname,relfilenode from pg_class where oid in('public.order_items'::regclass,'public.order_payments'::regclass) order by relname"),before);
 });
 checked('only physical RPC definition changes; online RPCs, ACL, policies and owners are identical',async()=>{
  const now=await functions(),changed=now.filter(x=>originalFunctions.find(y=>y.identity===x.identity)?.sha256!==x.sha256);assert.equal(changed.length,1);assert.match(changed[0].identity,/create_store_sale_atomic/);
  assert.deepEqual(await acl(),originalAcl);assert.deepEqual(await q("select * from pg_policies where schemaname='public' order by tablename,policyname"),originalPolicies);assert.deepEqual(await q("select c.oid::regclass::text identity,pg_get_userbyid(c.relowner) owner from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1"),originalOwners);
  // Expected precondition fingerprints are hashes, not definitions or commercial data.
  writeFileSync(join(root,'staging/runtime/store-sales-1c/expected-dependencies-private.json'),JSON.stringify({functions:originalFunctions.filter(x=>/create_store_sale|record_store_sale|record_order_payment|complete_store_sale|apply_sale_inventory|create_checkout_atomic|transition_checkout_atomic/.test(x.identity)),tables:originalTables,afterTables:await tableContracts(),afterPhysicalFunction:now.find(x=>/create_store_sale_atomic/.test(x.identity)),owners:originalOwners.filter(x=>/order_items|order_payments|orders|products|inventory_movements/.test(x.identity))},null,2));
 });
 checked('exact catalog-only postcheck is read-only and passes after the candidate',async()=>{
  const r=await db.query(readFileSync(join(root,'reports/store-sales-release-postcheck-catalog-only.sql'),'utf8'));
  const result=r.find(x=>x.rows?.[0]?.postcheck)?.rows[0].postcheck;
  assert.ok(result?.read_only);assert.equal(result.all_checks_passed,true,JSON.stringify(result.checks));assert.equal(result.commercial_rows_read,false);
 });
 checked('published transfer-first price 80 and generic card are rejected without records: coordinated physical pause required',async()=>{
  const p=await product(),counts=await rows();await assert.rejects(sale([{product_id:p,quantity:2,unit_price:80}],[{method:'cash',amount:160}]),/PRICE_CHANGED/);await assert.rejects(sale([{product_id:p,quantity:2,unit_price:75}],[{method:'card',amount:150}]),/PAYMENT_INVALID/);assert.deepEqual(await rows(),counts);
 });
 checked('a pre-migration paid retry fails closed without duplicating the existing sale',async()=>{
  const before=await rows();await assert.rejects(sale(legacy.items,legacy.payments,legacy.key),/IDEMPOTENCY_CONFLICT/);assert.deepEqual(await rows(),before);
  const items=await q('select unit_price,quantity,subtotal from order_items where order_id=$1',[legacy.order_id]);assert.equal(items[0].unit_price,'80.00');
 });
 checked('new application payload works with actual captured legacy helpers and records complete snapshots',async()=>{
  const p=await product(),r=await sale([{product_id:p,quantity:2,unit_price:75}],[{method:'cash',amount:50},{method:'transfer',amount:100}]);assert.equal(r.total,150);assert.equal(r.discount,50);assert.equal(r.payment_status,'paid');const item=(await q('select unit_cost_snapshot,list_unit_price_snapshot from order_items where order_id=$1',[r.order_id]))[0];assert.equal(item.unit_cost_snapshot,'40.00');assert.equal(item.list_unit_price_snapshot,'100.00');
 });
 checked('published online RPC still creates and retries a reservation after the candidate migration',async()=>{
  const p=await product(),buyer=randomUUID(),key=randomUUID(),request={customer:{fullName:'SYNTHETIC',phone:'0000000000'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:p,quantity:2}]};
  await q('set role service_role');let first;try{first=(await q('select create_checkout_atomic($1,$2,$3) result',[buyer,key,request]))[0].result;assert.equal(first.total,150);assert.equal(first.discount,50);assert.deepEqual((await q('select create_checkout_atomic($1,$2,$3) result',[buyer,key,request]))[0].result,first);}finally{await q('reset role');}assert.equal((await q('select stock from products where id=$1',[p]))[0].stock,0);
 });
});
