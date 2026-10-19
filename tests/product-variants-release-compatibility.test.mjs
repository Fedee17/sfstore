import assert from 'node:assert/strict';
import {before,after,describe,test} from 'node:test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {catalogRowsSql,preflightSql} from '../scripts/product-variants-release-catalog.mjs';
const root=resolve(import.meta.dirname,'..'),docker=process.env.SFSTORE_TEST_DOCKER;
const ref=process.env.SFSTORE_RELEASE_REFERENCE_DIRECTORY,maintenance=process.env.SFSTORE_RELEASE_MAINTENANCE_DIRECTORY,roleFile=process.env.SFSTORE_RELEASE_ROLE_CATALOG;
const read=f=>readFileSync(join(root,f),'utf8'),migrations=['202610180001_product_families_variants.sql','202610180002_variant_commercial_integration.sql'];
const hash=b=>createHash('sha256').update(b).digest('hex');
describe('variant release: certified public metadata, published physical contract, synthetic data only',{
 skip:!docker||!ref||!maintenance||!roleFile,timeout:180000,concurrency:false},()=>{
 let db,id,port,category,product,priorRows,priorPolicies,priorContracts,priorOwners,priorAcl,pre,order,expected;
 const actor=randomUUID(),output=join(root,'staging/runtime/variants-release');mkdirSync(output,{recursive:true});
 function cmd(args){const r=spawnSync(docker,args,{encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(r.status,0,'DISPOSABLE_COMMAND_FAILED');return r.stdout.trim();}
 async function client(){const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await c.connect();return c;}
 async function q(s,a=[]){return(await db.query(s,a)).rows;}
 async function inventory(){const result={};for(const t of ['products','orders','order_items','order_payments','purchases','purchase_items','inventory_movements'])result[t]=await q(`select to_jsonb(x) value from public.${t} x order by id`);return result;}
 async function contracts(){return q("select oid::regprocedure::text identity,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname in('create_store_sale_atomic','create_checkout_atomic','transition_checkout_atomic','confirm_checkout_manual_payment','confirm_purchase','save_purchase_draft','expire_pending_checkouts','apply_sale_inventory','save_product_atomic','get_product_save_version') order by 1");}
 async function sale(){return(await q('select create_store_sale_atomic($1,$2,$3,$4,$5,$6) r',[randomUUID(),actor,'SYNTHETIC','SYNTHETIC RELEASE',JSON.stringify([{product_id:product,quantity:1,unit_price:75}]),JSON.stringify([{method:'cash',amount:75}])]))[0].r;}
 async function checkout(){return(await q('select create_checkout_atomic($1,$2,$3) r',[randomUUID(),randomUUID(),JSON.stringify({customer:{fullName:'SYNTHETIC',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:product,quantity:1}]})]))[0].r;}
 async function result(sql,name){const r=await db.query(sql);return r.find(x=>x.rows?.[0]?.[name])?.rows[0][name];}
 before(async()=>{
  assert.equal(hash(readFileSync(join(ref,'minimum-launch-reconciliation/01-additive-checkout-contracts-review.sql'))),'bbb13e5ae7fa5e70cad4e475def8ddfe91ab0e8df2dd70becfc558c362dc0e5e');
  assert.equal(hash(readFileSync(join(maintenance,'04a-security-cutover-paused-review.sql'))),'d4936259eda9c3422157db3da79e755d52e1190a9c4a0b76e992e73ee1b61aed');
  id=cmd(['run','-d','--rm','--name',`sfstore-variant-release-${randomUUID().slice(0,8)}`,'--label','sfstore.synthetic=variant-release','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:17.6','-c','log_min_error_statement=panic']);
  port=Number(cmd(['port',id,'5432/tcp']).split(':').at(-1));for(let i=0;i<60;i++){try{db=await client();break;}catch{await delay(250);}}assert.ok(db);
  for(const role of JSON.parse(readFileSync(roleFile,'utf8')).roles){if(role.name==='postgres'||role.name.startsWith('pg_'))continue;await q(`create role "${role.name.replaceAll('"','""')}" nologin ${role.bypassRls?'bypassrls':'nobypassrls'}`);}
  await q("create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema extensions;create extension pgcrypto with schema extensions;create extension \"uuid-ossp\" with schema extensions");
  const schema=readFileSync(join(ref,'minimum-launch-production-public-schema-private.sql'),'utf8').replace(/^\\(?:un)?restrict[^\r\n]*$/gm,'');await q(schema);await q('set search_path=public');
  assert.equal((await q('select count(*)::int n from orders'))[0].n,0,'SCHEMA_ONLY_NO_COMMERCIAL_DATA');
  await q(readFileSync(join(ref,'minimum-launch-reconciliation/01-additive-checkout-contracts-review.sql'),'utf8'));
  await q("create schema storage authorization supabase_storage_admin;create table storage.objects(id uuid primary key,bucket_id text,name text,metadata jsonb);alter table storage.objects owner to supabase_storage_admin;alter table storage.objects enable row level security;grant usage on schema storage to service_role;grant select,insert,update,delete on storage.objects to service_role");
  await q(readFileSync(join(maintenance,'04a-security-cutover-paused-review.sql'),'utf8'));
  await q(read('supabase/migrations/202610170001_store_sales_full_payment.sql'));await q("update checkout_configuration set enabled=true");
  await q('set search_path=pg_catalog,public');expected=await q(catalogRowsSql);pre=preflightSql(expected);
  if(process.env.SFSTORE_GENERATE_VARIANT_RELEASE_CHECKS==='true')writeFileSync(join(root,'reports/product-variants-release-preflight-catalog-only.sql'),pre);
  else assert.equal(read('reports/product-variants-release-preflight-catalog-only.sql').replaceAll('\r\n','\n'),pre);
  category=randomUUID();product=randomUUID();await q("insert into public.categories(id,name,slug) values($1::uuid,'SYNTHETIC RELEASE',$1::text)",[category]);
  await q("insert into products(id,category_id,name,slug,short_description,price,transfer_price,cost,stock,status) values($1::uuid,$2,'SYNTHETIC SIMPLE',$1::text,'SYNTHETIC',100,80,40,6,'active')",[product,category]);
  await q('set role service_role');await sale();order=await checkout();await q('reset role');
  priorRows=await inventory();priorContracts=await contracts();priorPolicies=await q("select * from pg_policies where schemaname='public' order by tablename,policyname");
  priorOwners=await q("select relname,pg_get_userbyid(relowner) owner from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname");
  priorAcl=await q("select relname,relacl::text acl from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname");
 });
 after(async()=>{await db?.end();if(id&&/^[a-f0-9]{64}$/.test(id))cmd(['stop','--time','3',id]);});
 test('catalog-only preflight passes and does not read commercial rows',async()=>{
  const r=await result(pre,'preflight');assert.ok(r?.all_checks_passed,JSON.stringify(r));assert.equal(r.commercial_rows_read,false);assert.equal(r.checks.read_only,true);
 });
 test('preflight detects a changed grant and refuses partial prior installation',async()=>{
  await q('begin;grant truncate on products to anon');const changed=await result(pre,'preflight');assert.equal(changed.all_checks_passed,false);assert.ok(changed.dependency_mismatches.some(x=>x.identity==='products'));await q('rollback');
  await q('begin;alter table products add column family_id uuid');const partial=await result(pre,'preflight');assert.equal(partial.all_checks_passed,false);await q('rollback');
  await q("begin;create function public.lock_variant_catalog() returns trigger language plpgsql as $$begin return null;end$$");const orphan=await result(pre,'preflight');assert.equal(orphan.all_checks_passed,false);assert.ok(orphan.dependency_mismatches.some(x=>x.identity==='lock_variant_catalog()'));await q('rollback');
 });
 test('migration 001 lock timeout rolls back all changes without touching rows',async()=>{
  const blocker=await client();try{await blocker.query('begin;lock table public.products in access share mode');await assert.rejects(q(read('supabase/migrations/'+migrations[0])),e=>e.code==='55P03');await q('rollback');assert.equal((await q("select to_regclass('public.product_families') x"))[0].x,null);assert.deepEqual(await inventory(),priorRows);}finally{await blocker.query('rollback');await blocker.end();}
 });
 test('001 error before commit rolls back tables, columns, grants and triggers',async()=>{
  await assert.rejects(q(read('supabase/migrations/'+migrations[0]).replace(/commit;\s*$/i,()=>"do $$begin raise exception 'SYNTHETIC_ABORT';end$$;commit;")),/SYNTHETIC_ABORT/);await q('rollback');assert.equal((await q("select to_regclass('public.product_families') x"))[0].x,null);assert.deepEqual(await inventory(),priorRows);
 });
 test('exact 001 then 002 preserve original columns, costs, stock, history and RPC contracts',async()=>{
  await q(read('supabase/migrations/'+migrations[0]));const after1=await inventory();
  await assert.rejects(q(read('supabase/migrations/'+migrations[1]).replace(/commit;\s*$/i,()=>"do $$begin raise exception 'SYNTHETIC_ABORT_002';end$$;commit;")),/SYNTHETIC_ABORT_002/);await q('rollback');assert.deepEqual(await inventory(),after1);assert.equal((await q("select to_regclass('public.public_catalog_skus') x"))[0].x,null);
  await q(read('supabase/migrations/'+migrations[1]));const post=preflightSql(await q(catalogRowsSql),'after');if(process.env.SFSTORE_GENERATE_VARIANT_RELEASE_CHECKS==='true')writeFileSync(join(root,'reports/product-variants-release-postcheck-catalog-only.sql'),post);else assert.equal(read('reports/product-variants-release-postcheck-catalog-only.sql').replaceAll('\r\n','\n'),post);assert.equal((await result(post,'postcheck')).all_checks_passed,true);const current=await inventory();for(const [table,rows]of Object.entries(priorRows))for(let i=0;i<rows.length;i++)for(const [k,v]of Object.entries(rows[i].value))assert.deepEqual(current[table][i].value[k],v,table+'.'+k);
  assert.equal((await q('select count(*)::int n from product_families'))[0].n,0);assert.equal((await q('select count(*)::int n from products where family_id is not null'))[0].n,0);assert.deepEqual(await contracts(),priorContracts);
 });
 test('existing RLS policies, owners, table grants and managed Storage remain unchanged',async()=>{
  assert.deepEqual(await q("select * from pg_policies where schemaname='public' and tablename not like 'product_family%' and tablename<>'product_families' order by tablename,policyname"),priorPolicies);
  const owners=await q("select relname,pg_get_userbyid(relowner) owner from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname");for(const old of priorOwners)assert.deepEqual(owners.find(x=>x.relname===old.relname),old);
  const acls=await q("select relname,relacl::text acl from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname");for(const old of priorAcl)assert.deepEqual(acls.find(x=>x.relname===old.relname),old);
  assert.equal((await q("select pg_get_userbyid(relowner) owner from pg_class where oid='storage.objects'::regclass"))[0].owner,'supabase_storage_admin');
 });
 test('published simple-sale and checkout payloads still work; previous reservation releases once',async()=>{
  await q('set role service_role');try{const r=await sale();assert.equal(r.total,75);assert.equal(r.discount,25);const web=await checkout();assert.equal(web.total,75);await q("select transition_checkout_atomic($1,'cancelled')",[order.id]);await q("select transition_checkout_atomic($1,'cancelled')",[order.id]);assert.equal((await q("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='release'",[order.id]))[0].n,1);}finally{await q('reset role');}
 });
});
