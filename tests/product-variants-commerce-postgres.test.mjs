import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {before,after,describe,test} from 'node:test';
import {Client} from 'pg';
const root=resolve(import.meta.dirname,'..'),docker=process.env.SFSTORE_TEST_DOCKER;
const read=f=>readFileSync(join(root,f),'utf8');
describe('variant commercial integration on isolated PostgreSQL17.6',{skip:!docker,concurrency:false,timeout:180000},()=>{
 let db,id,connection,category,supplier,pilot,legacyOrders,legacyLines,priorContracts;
 const actor=randomUUID();
 function cmd(args){const r=spawnSync(docker,args,{encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();}
 async function connect(){const c=new Client(connection);await c.connect();return c;}
 const q=async(s,a=[],c=db)=>(await c.query(s,a)).rows;
 before(async()=>{
  id=cmd(['run','-d','--rm','--name',`sfstore-variants-commerce-${randomUUID().slice(0,8)}`,'--label','sfstore.synthetic=variant-commerce','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:17.6']);
  connection={host:'127.0.0.1',port:Number(cmd(['port',id,'5432/tcp']).split(':').at(-1)),user:'postgres',database:'postgres'};
  for(let i=0;i<60;i++){try{db=await connect();break;}catch{await delay(250);}}assert.ok(db);
  await q('create role anon;create role authenticated;create role service_role bypassrls;');await q(read('tests/fixtures/storage-permissions.sql'));
  const history=JSON.parse(read('staging/migration-manifest.json')).applicationOrder;
  for(const e of history)if(!e.source.endsWith('202610180002_variant_commercial_integration.sql'))await q(read(e.stagingFile));
  await q(read('staging/supabase/seed.sql'));
  const original='22222222-2222-4222-8222-222222222222';legacyOrders=[];
  for(let i=0;i<2;i++)legacyOrders.push((await q('select create_checkout_atomic($1,$2,$3) r',[randomUUID(),randomUUID(),JSON.stringify({customer:{fullName:'SYNTHETIC OLD BUYER',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:original,quantity:1}]})]))[0].r.id);
  legacyLines=await q('select * from order_items where order_id=any($1::uuid[]) order by id',[legacyOrders]);
  priorContracts=await q("select proname,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname in ('create_checkout_atomic','transition_checkout_atomic','confirm_checkout_manual_payment','create_store_sale_atomic','confirm_purchase') order by proname");
  await q(read('supabase/migrations/202610180002_variant_commercial_integration.sql'));
  category=randomUUID();supplier=randomUUID();
  await q("insert into categories(id,name,slug) values($1,'SYNTHETIC VARIANTS','synthetic-variants')",[category]);
  await q("insert into suppliers(id,name,normalized_name) values($1::uuid,'SYNTHETIC SUPPLIER',$1::text)",[supplier]);
  await q('set role service_role');
 });
 after(async()=>{await db?.end();if(id&&/^[a-f0-9]{64}$/.test(id))cmd(['stop','--time','3',id]);});
 async function fixture(stock=2){
  const family=randomUUID();await q('select save_product_family($1,0,$2,$3,$4,100)',[family,'SYNTHETIC Stanley',`synthetic-${family}`,category]);
  const option=(await q("select add_product_family_option($1,'Color',array['Negro','Verde']) id",[family]))[0].id;
  const values=await q('select id,label from product_family_option_values where option_id=$1 order by label',[option]);const products=[];
  for(const [i,value] of values.entries()){
   const p=randomUUID();await q('select configure_product_variant($1,$2,null,$3,$4,true,false,$5)',[p,family,JSON.stringify({[option]:value.id}),i?120:null,JSON.stringify({name:'SYNTHETIC Stanley',slug:`synthetic-${p}`,sku:`SYN-${p}`})]);
   await q("update products set stock=$2,status='active',cost=$3 where id=$1",[p,stock,i?50:40]);products.push(p);
  }return {family,products,option};
 }
 async function flags(p,web,blocked){await q('update products set web_visible=$2,commercial_blocked=$3 where id=$1',[p,web,blocked]);}
 async function sale(items,payments,key=randomUUID(),c=db){return(await q('select create_store_sale_atomic($1,$2,$3,$4,$5,$6) r',[key,actor,'SYNTHETIC','SYNTHETIC VARIANT COMMERCE',JSON.stringify(items),JSON.stringify(payments)],c))[0].r;}
 const item=(id,price=75)=>({product_id:id,quantity:1,unit_price:price});
 async function checkout(p,key=randomUUID(),buyer=randomUUID(),c=db){return(await q('select create_checkout_atomic($1,$2,$3) r',[buyer,key,JSON.stringify({customer:{fullName:'SYNTHETIC',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:p,quantity:1}]})],c))[0].r;}
 test('preexisting reservations and operational RPCs survive migration; cancel retries and paid confirmation preserve stock',async()=>{
  assert.deepEqual(await q("select proname,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname in ('create_checkout_atomic','transition_checkout_atomic','confirm_checkout_manual_payment','create_store_sale_atomic','confirm_purchase') order by proname"),priorContracts);
  const lines=await q('select * from order_items where order_id=any($1::uuid[]) order by id',[legacyOrders]);
  for(let i=0;i<lines.length;i++){for(const [key,value] of Object.entries(legacyLines[i]))assert.deepEqual(lines[i][key],value);assert.equal(lines[i].family_id_snapshot,null);assert.equal(lines[i].variant_options_snapshot,null);}
  await q("select transition_checkout_atomic($1,'cancelled')",[legacyOrders[0]]);await q("select transition_checkout_atomic($1,'cancelled')",[legacyOrders[0]]);
  const key=randomUUID();await q("select confirm_checkout_manual_payment($1,$2,$3,75,'SYNTHETIC OLD PAYMENT')",[legacyOrders[1],key,actor]);await q("select confirm_checkout_manual_payment($1,$2,$3,75,'SYNTHETIC OLD PAYMENT')",[legacyOrders[1],key,actor]);
  await assert.rejects(q("select transition_checkout_atomic($1,'cancelled')",[legacyOrders[1]]),/INVALID_TRANSITION|PAID_RESERVATION_PROTECTED/);
  assert.equal((await q("select stock from products where id='22222222-2222-4222-8222-222222222222'"))[0].stock,29);
  assert.equal((await q("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='release'",[legacyOrders[0]]))[0].n,1);
  assert.equal((await q("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='release'",[legacyOrders[1]]))[0].n,0);
 });
 test('purchase accepts two SKU of the same family and receives only their units/costs exactly once',async()=>{
  pilot=await fixture(0);const [black,green]=pilot.products;
  const purchase=(await q("select save_purchase_draft(null,$1,'2026-10-18',0,'SYNTHETIC',$2,$3) r",[supplier,actor,JSON.stringify([{product_id:black,quantity:2,unit_purchase_cost:41},{product_id:green,quantity:3,unit_purchase_cost:52}])]))[0].r;
  await q('select confirm_purchase($1,$2)',[purchase,actor]);await q('select confirm_purchase($1,$2)',[purchase,actor]);
  const rows=await q('select product_id,quantity,family_id_snapshot,variant_options_snapshot,sku_snapshot from purchase_items where purchase_id=$1',[purchase]);assert.equal(rows.length,2);assert.ok(rows.every(p=>p.family_id_snapshot===pilot.family&&p.sku_snapshot));assert.deepEqual(new Set(rows.map(p=>p.variant_options_snapshot.Color)),new Set(['Negro','Verde']));
  const p=await q('select id,stock,cost from products where family_id=$1',[pilot.family]);assert.equal(p.find(p=>p.id===black).stock,2);assert.equal(p.find(p=>p.id===green).stock,3);assert.equal(p.find(p=>p.id===black).cost,'41.00');assert.equal(p.find(p=>p.id===green).cost,'52.00');
  assert.equal((await q('select count(*)::int n from inventory_movements where purchase_id=$1',[purchase]))[0].n,2);
 });
 test('cash+transfer sale freezes precise SKU, family/options and historical cost; repeated request does not deduct twice',async()=>{
  const [black,green]=pilot.products,key=randomUUID(),items=[item(black),item(green,90)],payments=[{method:'cash',amount:65},{method:'transfer',amount:100}];
  const r=await sale(items,payments,key);assert.equal(r.subtotal,220);assert.equal(r.discount,55);assert.equal(r.total,165);
  assert.equal((await sale(items,payments,key)).order_id,r.order_id);
  const lines=await q('select * from order_items where order_id=$1',[r.order_id]);assert.ok(lines.every(l=>l.family_id_snapshot===pilot.family&&l.product_name.includes('Color:')&&l.sku_snapshot));assert.equal(lines.find(l=>l.product_id===black).unit_cost_snapshot,'41.00');assert.equal(lines.find(l=>l.product_id===green).unit_cost_snapshot,'52.00');
  await q("update product_families set name='SYNTHETIC RENAMED',base_price=200 where id=$1",[pilot.family]);
  assert.deepEqual(await q('select * from order_items where order_id=$1',[r.order_id]),lines);
  assert.equal((await q('select stock from products where id=$1',[black]))[0].stock,1);
 });
 test('any debit in a combined sale uses list price for every line; simple products still work',async()=>{
  const f=await fixture();const r=await sale([item(f.products[0],100),item(f.products[1],120)],[{method:'cash',amount:50},{method:'debit',amount:170}]);assert.equal(r.total,220);assert.equal(r.discount,0);
  const p=randomUUID();await q("insert into products(id,category_id,name,slug,short_description,price,stock,status) values($1::uuid,$2,'SYNTHETIC SIMPLE',$1::text,'SYNTHETIC',100,1,'active')",[p,category]);
  const simple=await sale([item(p)],[{method:'cash',amount:75}]);const l=(await q('select * from order_items where order_id=$1',[simple.order_id]))[0];assert.equal(l.family_id_snapshot,null);assert.equal(l.variant_options_snapshot,null);assert.equal(l.product_name,'SYNTHETIC SIMPLE');
 });
 test('public projection returns only visible active SKU and has no costs/override/admin fields',async()=>{
  const f=await fixture();await flags(f.products[1],false,false);await q('set role anon');try{
   const rows=await q('select * from public_catalog_skus where family_id=$1',[f.family]);assert.equal(rows.length,1);assert.equal(rows[0].id,f.products[0]);assert.deepEqual(rows[0].variant_options,{Color:'Negro'});
   for(const field of ['cost','cost_source_purchase_item_id','list_price_override','commercial_blocked','variant_choices'])assert.equal(field in rows[0],false);
   await assert.rejects(q('update public_catalog_skus set stock=0'),/permission denied|not automatically updatable|cannot update view/);
   await assert.rejects(q('select * from product_family_option_values'),/permission denied/);
  }finally{await q('reset role');await q('set role service_role');}
  const store=await sale([item(f.products[1],90)],[{method:'cash',amount:90}]);assert.equal(store.total,90);
  await assert.rejects(checkout(f.products[1]),/NOT_WEB_VISIBLE/);await flags(f.products[0],true,true);await assert.rejects(checkout(f.products[0]),/COMMERCIALLY_BLOCKED/);await assert.rejects(sale([item(f.products[0])],[{method:'cash',amount:75}]),/COMMERCIALLY_BLOCKED/);
 });
 test('last SKU unit competed by physical sale and online reservation has exactly one winner',async()=>{
  const f=await fixture(1),p=f.products[0],a=await connect(),b=await connect();try{
   await a.query('set role service_role');await b.query('set role service_role');const r=await Promise.allSettled([sale([item(p)],[{method:'cash',amount:75}],randomUUID(),a),checkout(p,randomUUID(),randomUUID(),b)]);
   assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.match(r.find(x=>x.status==='rejected').reason.message,/STOCK_INSUFFICIENT/);
   assert.equal((await q('select stock from products where id=$1',[p]))[0].stock,0);assert.equal((await q("select count(*)::int n from inventory_movements where product_id=$1 and movement_type in ('sale','reservation')",[p]))[0].n,1);
  }finally{await a.end();await b.end();}
 });
 test('old cart payload productId alone works; retry preserves order, variant and stock; family UUID cannot be bought',async()=>{
  const f=await fixture(2),p=f.products[0],key=randomUUID(),buyer=randomUUID();const r=await checkout(p,key,buyer);
  assert.equal((await checkout(p,key,buyer)).id,r.id);assert.equal(r.total,75);assert.equal((await q('select stock from products where id=$1',[p]))[0].stock,1);
  const line=(await q('select * from order_items where order_id=$1',[r.id]))[0];assert.equal(line.family_id_snapshot,f.family);assert.equal(line.variant_options_snapshot.Color,'Negro');
  await assert.rejects(checkout(f.family),/PRODUCT|STOCK/);
  await q("select transition_checkout_atomic($1,'cancelled')",[r.id]);await q("select transition_checkout_atomic($1,'cancelled')",[r.id]);assert.equal((await q('select stock from products where id=$1',[p]))[0].stock,2);
 });
 test('family price transaction rolls back coherently and cannot shadow a simple public slug',async()=>{
  const f=await fixture();await q('begin');await q('update product_families set base_price=300 where id=$1',[f.family]);assert.equal((await q('select price from products where id=$1',[f.products[0]]))[0].price,'300.00');await q('rollback');assert.equal((await q('select price from products where id=$1',[f.products[0]]))[0].price,'100.00');
  await assert.rejects(q('select save_product_family($1,0,$2,$3,$4,100)',[f.products[0],'SYNTHETIC COLLISION',`collision-${randomUUID()}`,category]),/IDENTITY_COLLISION/);
  await assert.rejects(q('update product_families set slug=(select slug from products where id=$2) where id=$1',[f.family,pilot.products[0]]),/SLUG_COLLISION/);
 });
 test('historical import after grouping never acquires a fabricated family or costs',async()=>{
  const f=await fixture(),batch=randomUUID();await q("insert into historical_import_batches(id,source_file,source_sha256) values($1,'SYNTHETIC HISTORY',$2)",[batch,'d'.repeat(64)]);
  const order=(await q("select import_historical_sale($1,'Control de ventas',1,$2,'2025-06-01','SYNTHETIC',$3,'cash',80) r",[batch,'e'.repeat(64),JSON.stringify([{product_id:f.products[0],quantity:1,unit_price:80,source_total:80}])]))[0].r;
  const l=(await q('select * from order_items where order_id=$1',[order.order_id]))[0];assert.equal(l.family_id_snapshot,null);assert.equal(l.variant_options_snapshot,null);assert.equal(l.unit_cost_snapshot,null);assert.equal(l.unit_price,'80.00');assert.equal((await q('select stock from products where id=$1',[f.products[0]]))[0].stock,2);
 });
});
