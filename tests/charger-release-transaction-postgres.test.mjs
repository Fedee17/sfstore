import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {before,after,describe,test} from 'node:test';
import {Client} from 'pg';
const root=resolve(import.meta.dirname,'..'),docker=process.env.SFSTORE_TEST_DOCKER,read=f=>readFileSync(join(root,f),'utf8');
const id={purchase_id:'aa56d2fc-ceda-4205-a52f-39c3f62102e5',source:'0addc342-9708-4992-a007-8362d6abc756',head:'753fd426-1a8c-49c6-8e17-60b57ea59b8b',presentation:'1e6c42e4-08af-4ed7-ad01-95fb22e13c4a',legacy:'20530c08-7371-4726-8a0e-0c5023e7d513',other:'68d9612c-8f73-4119-bb4b-60951ee5ec62',excluded:'d1abf544-2493-4dab-a769-53f9faa6c4be',unrelated:'f0f14dc6-8693-4670-aeab-42cc64732b0e'};
describe('exact release templates: atomic configuration on disposable PostgreSQL17.6',{skip:!docker,concurrency:false,timeout:120000},()=>{
 let container,connection,admin,manifest,hold,configure,releaseHold,initialCount;const actor=randomUUID(),work=join(root,'staging/runtime/release-transaction',randomUUID());
 const cmd=args=>{const r=spawnSync(docker,args,{encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
 async function connect(database='postgres'){const c=new Client({...connection,database});await c.connect();return c;}
 const query=async(c,s,a=[])=>(await c.query(s,a)).rows;
 before(async()=>{
  mkdirSync(work,{recursive:true});container=cmd(['run','-d','--rm','--name',`sfstore-charger-release-${randomUUID().slice(0,8)}`,'--label','sfstore.synthetic=release-transaction','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:17.6']);
  connection={host:'127.0.0.1',port:Number(cmd(['port',container,'5432/tcp']).split(':').at(-1)),user:'postgres'};
  for(let i=0;i<80;i++){try{admin=await connect();break;}catch{await delay(250);}}assert.ok(admin);
  await admin.query('create role anon;create role authenticated;create role service_role bypassrls');await admin.query('create database release_fixture');
  const db=await connect('release_fixture');
  try{
   await db.query(read('tests/fixtures/storage-permissions.sql'));for(const e of JSON.parse(read('staging/migration-manifest.json')).applicationOrder.filter(e=>e.source.split('/').at(-1)<'202610190001'))await db.query(read(e.stagingFile));
   await db.query(read('staging/supabase/seed.sql'));await db.query(read('supabase/migrations/202610190001_component_inventory.sql'));await db.query(read('supabase/migrations/202610200001_component_combo_pricing.sql'));
   const category=randomUUID(),supplier=randomUUID();await db.query("insert into categories(id,name,slug) values($1,'SYNTHETIC','mates');",[category]);await db.query("insert into suppliers(id,name,normalized_name) values($1,'SYNTHETIC','synthetic')",[supplier]);
   const products=[[id.source,20,6543.21,0,'draft'],[id.head,1,3650,16590.91,'active'],[id.presentation,0,7300,27019.48,'draft'],[id.legacy,0,3650,11850.65,'active'],[id.other,9,14029.71,30000,'active'],[id.excluded,2,1439,8409.74,'active'],[id.unrelated,2,2939,11756,'active']];
   for(const [pid,stock,cost,price,status] of products)await db.query("insert into products(id,category_id,name,slug,short_description,stock,cost,price,status) values($1::uuid,$2,'SYNTHETIC '||$1::text,$1::text,'SYNTHETIC',$3,$4,$5,$6)",[pid,category,[id.source,id.other].includes(pid)?0:stock,[id.source,id.other].includes(pid)?0:cost,price,status]);
   await db.query("insert into purchases(id,supplier_id,supplier_name_snapshot,purchase_date,status,shipping_cost,supplier_subtotal,total_cost,total_units,confirmed_at,created_by) values($1,$2,'SYNTHETIC','2026-10-18','draft',17000,240131.50,257131.50,29,now(),$3)",[id.purchase_id,supplier,actor]);
   const lines=[[id.source,20,5957,119140,11724.14,586.21,6543.21,130864.14],[id.other,9,13443.5,120991.5,5275.86,586.21,14029.71,126267.36]];
   await db.query("select save_purchase_draft($1,$2,'2026-10-18',17000,'SYNTHETIC',$3,$4)",[id.purchase_id,supplier,actor,JSON.stringify(lines.map(([product_id,quantity,unit_purchase_cost])=>({product_id,quantity,unit_purchase_cost})))]);
   await db.query('select confirm_purchase($1,$2)',[id.purchase_id,actor]);
   // An old order remains byte-for-byte preserved; all its data is synthetic.
   const customer=(await query(db,"insert into customers(full_name,phone) values('SYNTHETIC','TEST') returning id"))[0].id;
   const order=(await query(db,"insert into orders(customer_id,order_number,payment_method,shipping_method,total,channel) values($1,'SYNTHETIC-OLD','transfer','pickup',80,'store') returning id",[customer]))[0].id;
   await db.query("insert into order_items(order_id,product_id,product_name,product_slug,quantity,unit_price,subtotal,created_at) values($1,$2,'SYNTHETIC OLD','synthetic-old',1,80,80,'2025-01-01')",[order,id.head]);
   const productKeys=['id','stock','price','transfer_price','cost','cost_source_purchase_item_id','status','family_id','web_visible','commercial_blocked'];
   manifest={...id,project:'xspvoicelbxlmtqoiolc',baseline_at:new Date().toISOString(),held_ids:[id.source,id.head,id.presentation,id.legacy,id.other],products:await query(db,`select ${productKeys.join(',')} from products where id=any($1::uuid[]) order by id`,[Object.values(id)]),purchase:(await query(db,"select id,status,purchase_date,shipping_cost,supplier_subtotal,total_cost,total_units,historical_import,affects_inventory from purchases where id=$1",[id.purchase_id]))[0],lines:await query(db,'select id,purchase_id,product_id,quantity,unit_purchase_cost,supplier_line_total,allocated_shipping_total,effective_unit_cost,effective_line_total from purchase_items order by id'),movements:await query(db,'select id,product_id,purchase_id,purchase_item_id,order_id,movement_type,quantity,previous_stock,new_stock from inventory_movements order by id')};
   // JSON numbers match PostgREST, not pg numeric strings.
   for(const p of manifest.products)for(const k of ['price','transfer_price','cost'])if(p[k]!==null)p[k]=Number(p[k]);
   for(const k of ['shipping_cost','supplier_subtotal','total_cost'])manifest.purchase[k]=Number(manifest.purchase[k]);
   for(const l of manifest.lines)for(const k of ['unit_purchase_cost','supplier_line_total','allocated_shipping_total','effective_unit_cost','effective_line_total'])l[k]=Number(l[k]);
   initialCount=(await query(db,'select count(*)::int n from products'))[0].n;
   writeFileSync(join(work,'manifest.json'),JSON.stringify(manifest));
   for(const mode of ['hold','configure','release-hold']){const output=join(work,mode+'.sql');const r=spawnSync(process.execPath,['scripts/prepare-charger-release.mjs','--mode',mode,'--manifest',join(work,'manifest.json'),'--output',output],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);if(mode==='hold')hold=readFileSync(output,'utf8');else if(mode==='configure')configure=readFileSync(output,'utf8');else releaseHold=readFileSync(output,'utf8');}
  }finally{await db.end();}
 });
 after(async()=>{await admin?.end();if(container)cmd(['stop','--time','3',container]);});
 async function sandbox(fn){const name='case_'+randomUUID().replaceAll('-','');await admin.query(`create database ${name} template release_fixture`);const db=await connect(name);try{await db.query('set role service_role');await db.query("select set_config('sfstore.charger_actor',$1,false)",[actor]);await fn(db,name);}finally{await db.end();await admin.query(`drop database ${name}`);}}
 async function run(db,sql){const results=await db.query(sql);return results.findLast(r=>r.command==='SELECT'&&r.rows[0]?.result)?.rows[0].result;}
 const stock=async(db,pid)=>(await query(db,'select stock from products where id=$1',[pid]))[0].stock;
 test('hold blocks only affected SKU, including stale carts and physical sale attempts',()=>sandbox(async db=>{
  await run(db,hold);await run(db,hold);assert.equal((await query(db,'select count(*)::int n from products where commercial_blocked'))[0].n,5);assert.equal(await stock(db,id.excluded),2);
  await assert.rejects(query(db,'select create_store_sale_atomic($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,'SYNTHETIC','SYNTHETIC',JSON.stringify([{product_id:id.head,quantity:1,unit_price:12443.18}]),JSON.stringify([{method:'cash',amount:12443.18}])]),/VARIANT_COMMERCIALLY_BLOCKED/);
  await assert.rejects(query(db,'select create_checkout_atomic($1,$2,$3)',[randomUUID(),randomUUID(),JSON.stringify({customer:{fullName:'SYNTHETIC',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:id.head,quantity:1}]})]),/VARIANT_COMMERCIALLY_BLOCKED/);
 }));
 test('exact rendered configuration preserves purchase/history, costs and approved prices; retry is a no-op',()=>sandbox(async db=>{
  const original=await query(db,'select to_jsonb(i) row from order_items i order by id');await run(db,hold);const r=await run(db,configure);
  assert.equal(r.status,'configured');assert.equal(await stock(db,id.head),21);assert.equal(await stock(db,r.cc),10);assert.equal(await stock(db,r.lightning),10);assert.equal(await stock(db,id.source),0);assert.equal(await stock(db,id.presentation),0);
  assert.equal((await query(db,'select cost from products where id=$1',[id.head]))[0].cost,'3340.89');
  assert.equal((await query(db,'select sum((x->>\'total_cents\')::bigint)::text value from component_inventory_operations o cross join jsonb_array_elements(o.plan->\'allocations\') x'))[0].value,'25713150');
  assert.deepEqual(await query(db,'select to_jsonb(i) row from order_items i order by id'),original);
  const offers=await query(db,'select combo_list_price,combo_transfer_price from public_component_offers');assert.equal(offers.length,2);assert.ok(offers.every(o=>o.combo_list_price==='30666.67'&&o.combo_transfer_price==='23000.00'));
  assert.equal((await run(db,configure)).status,'already_completed');assert.equal((await query(db,'select count(*)::int n from component_inventory_operations'))[0].n,1);assert.equal((await query(db,'select count(*)::int n from products'))[0].n,initialCount+2);
 }));
 test('retry after a real synthetic sale never restores stock or repeats configuration',()=>sandbox(async db=>{
  await run(db,hold);const r=await run(db,configure);await query(db,'select create_store_sale_atomic($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,'SYNTHETIC','SYNTHETIC',JSON.stringify([{product_id:id.presentation,quantity:1,unit_price:23000,combo_connector:'cc'}]),JSON.stringify([{method:'transfer',amount:23000}])]);
  assert.equal((await run(db,configure)).status,'already_completed');assert.equal(await stock(db,id.head),20);assert.equal(await stock(db,r.cc),9);
 }));
 test('missing operator and missing hold fail before creating SKU or movements',()=>sandbox(async db=>{
  await db.query("select set_config('sfstore.charger_actor','',false)");await assert.rejects(db.query(configure),/CHARGER_OPERATOR_REQUIRED/);await db.query('rollback');
  await db.query("select set_config('sfstore.charger_actor',$1,false)",[actor]);await assert.rejects(db.query(configure),/CHARGER_HOLD_REQUIRED/);await db.query('rollback');assert.equal((await query(db,'select count(*)::int n from products'))[0].n,initialCount);
 }));
 test('changed stock and a name/slug collision stop safely without associating an unverified SKU',()=>sandbox(async db=>{
  await db.query('update products set stock=19 where id=$1',[id.source]);await assert.rejects(db.query(hold),/CHARGER_BASELINE_CHANGED/);await db.query('rollback');await db.query('update products set stock=20 where id=$1',[id.source]);await run(db,hold);
  await db.query("insert into products(category_id,name,slug,short_description,sku,price) select category_id,'SYNTHETIC COLLISION','sfstore-cable-usbc-usbc-cargador','SYNTHETIC','OTHER-SKU',0 from products where id=$1",[id.head]);
  await assert.rejects(db.query(configure),/CHARGER_CABLE_IDENTITY_COLLISION/);await db.query('rollback');assert.equal(await stock(db,id.source),20);assert.equal((await query(db,'select count(*)::int n from component_recipes'))[0].n,0);
 }));
 test('failure after conversion rolls back cable creation, costs, movements and audit; hold remains',()=>sandbox(async db=>{
  await run(db,hold);await db.query('reset role');await db.query("create function fail_price_test() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_FAIL_AFTER_CONVERSION';end$$;create trigger fail_price_test before insert on component_combo_price_audit for each row execute function fail_price_test()");await db.query('set role service_role');
  await assert.rejects(db.query(configure),/SYNTHETIC_FAIL_AFTER_CONVERSION/);await db.query('rollback');assert.equal(await stock(db,id.source),20);assert.equal(await stock(db,id.head),1);assert.equal((await query(db,'select count(*)::int n from products'))[0].n,initialCount);assert.equal((await query(db,'select count(*)::int n from component_inventory_operations'))[0].n,0);assert.equal((await query(db,'select commercial_blocked from products where id=$1',[id.head]))[0].commercial_blocked,true);
 }));
 test('reviewed hold recovery restores only original flags before conversion',()=>sandbox(async db=>{
  const before=await query(db,'select id,stock,cost,price,commercial_blocked from products order by id');await run(db,hold);await run(db,releaseHold);assert.deepEqual(await query(db,'select id,stock,cost,price,commercial_blocked from products order by id'),before);
 }));
 test('hold recovery refuses to reopen a completed conversion',()=>sandbox(async db=>{
  await run(db,hold);await run(db,configure);await assert.rejects(db.query(releaseHold),/CHARGER_RECOVERY_REQUIRES_REVIEW/);await db.query('rollback');assert.equal(await stock(db,id.head),21);
 }));
 test('two concurrent configuration attempts create only two new SKU and one conversion',()=>sandbox(async(db,name)=>{
  await run(db,hold);const second=await connect(name);try{await second.query('set role service_role');await second.query("select set_config('sfstore.charger_actor',$1,false)",[actor]);const rs=await Promise.all([run(db,configure),run(second,configure)]);assert.deepEqual(rs.map(r=>r.status).sort(),['already_completed','configured']);assert.equal((await query(db,'select count(*)::int n from products'))[0].n,initialCount+2);assert.equal(await stock(db,id.head),21);}finally{await second.end();}
 }));
});
