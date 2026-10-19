import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {before,after,describe,test} from 'node:test';
import {Client} from 'pg';
const root=resolve(import.meta.dirname,'..'),docker=process.env.SFSTORE_TEST_DOCKER;
const migration='202610180001_product_families_variants.sql';
const manifest=JSON.parse(readFileSync(join(root,'staging/migration-manifest.json'),'utf8'));
const read=f=>readFileSync(join(root,f),'utf8');
describe('product families and SKU in real isolated PostgreSQL 17.6',{skip:!docker,concurrency:false,timeout:240000},()=>{
 let db,id,connection,category,family,option,black,green,blackSku,greenSku,legacy,baseline,rpcs;
 const actor=randomUUID();
 function command(args){const r=spawnSync(docker,args,{encoding:'utf8',windowsHide:true,timeout:90000});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();}
 async function connect(){const c=new Client(connection);await c.connect();return c;}
 async function q(sql,args=[],c=db){return (await c.query(sql,args)).rows;}
 const version=async p=>(await q('select get_product_save_version($1) v',[p]))[0].v;
 const choices=()=>({[option]:black});
 async function configure(p,opts={},c=db){return q('select configure_product_variant($1,$2,$3,$4,$5,$6,$7,$8) id',[p,opts.family??family,opts.version??null,JSON.stringify(opts.choices??choices()),opts.override??null,opts.web??false,opts.blocked??false,opts.new===false?null:JSON.stringify({name:`SYNTHETIC Termo Stanley 1L — Pico MateSystem ${p}`,slug:`synthetic-${p}`,sku:`TEST-${p}`})],c);}
 async function sale(p,key=randomUUID(),c=db,qty=1){return (await q('select create_store_sale_atomic($1,$2,$3,$4,$5,$6) r',[key,actor,'SYNTHETIC','SYNTHETIC VARIANTS',JSON.stringify([{product_id:p,quantity:qty,unit_price:75}]),JSON.stringify([{method:'cash',amount:75*qty}])],c))[0].r;}
 async function state(){return (await q('select (select count(*) from orders)::int orders,(select count(*) from order_payments)::int payments,(select count(*) from inventory_movements)::int movements'))[0];}
 before(async()=>{
  id=command(['run','--detach','--rm','--name',`sfstore-variants-${randomUUID().slice(0,8)}`,'--label','sfstore.synthetic=variants',
   '--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:17.6',
   '-c','statement_timeout=10000','-c','lock_timeout=5000']);
  connection={host:'127.0.0.1',port:Number(command(['port',id,'5432/tcp']).split(':').at(-1)),user:'postgres',database:'postgres'};
  for(let i=0;i<60;i++){try{db=await connect();break;}catch{await delay(250);}}assert.ok(db);
  await q('create role anon;create role authenticated;create role service_role bypassrls;');
  await q(read('tests/fixtures/storage-permissions.sql'));
  for(const e of manifest.applicationOrder)if(e.source==='supabase/schema.sql'||e.source.split('/').at(-1)<migration)await q(read(e.stagingFile));
  await q(read("staging/supabase/seed.sql"));
  category=randomUUID();legacy=randomUUID();
  await q("insert into categories(id,name,slug) values($1,'Synthetic variants','synthetic-variants')",[category]);
  await q("insert into products(id,category_id,name,slug,short_description,price,stock,cost,status,sku) values($1::uuid,$2,'SYNTHETIC SIMPLE',$1::text,'SYNTHETIC',100,4,40,'active','SYNTHETIC-LEGACY')",[legacy,category]);
  await sale(legacy);
  const historyBatch=randomUUID();
  await q("insert into historical_import_batches(id,source_file,source_sha256) values($1,'SYNTHETIC HISTORY FIXTURE',$2)",[historyBatch,'b'.repeat(64)]);
  await q("select import_historical_sale($1,'Control de ventas',10,$2,'2025-06-01','SYNTHETIC HISTORY',$3,'cash',80)",[historyBatch,'c'.repeat(64),JSON.stringify([{product_id:legacy,quantity:1,unit_price:80,source_total:80}])]);
  baseline={product:(await q('select * from products where id=$1',[legacy]))[0],state:await state(),items:await q('select * from order_items')};
  rpcs=await q("select proname,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname in ('create_checkout_atomic','create_store_sale_atomic','transition_checkout_atomic','confirm_purchase','expire_pending_checkouts') order by proname");
  await q(read(`supabase/migrations/${migration}`));
  await q('set role service_role');
 });
 after(async()=>{await db?.end();if(id&&/^[a-f0-9]{64}$/.test(id))command(['stop','--time','3',id]);});
 test('migration preserves simple product identity, stock, historical line amounts and existing RPC definitions/ACLs',async()=>{
  const p=(await q('select * from products where id=$1',[legacy]))[0];for(const [k,v] of Object.entries(baseline.product))assert.deepEqual(p[k],v,k);
  assert.equal(p.family_id,null);assert.deepEqual(await state(),baseline.state);assert.deepEqual(await q('select * from order_items'),baseline.items);
  assert.deepEqual(await q("select proname,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname in ('create_checkout_atomic','create_store_sale_atomic','transition_checkout_atomic','confirm_purchase','expire_pending_checkouts') order by proname"),rpcs);
 });
 test('create pilot family, option definitions and two distinct values',async()=>{
  family=randomUUID();await q('select save_product_family($1,0,$2,$3,$4,100)',[family,'SYNTHETIC Termo Stanley 1L — Pico MateSystem',`synthetic-family-${family}`,category]);
  option=(await q("select add_product_family_option($1,'Color',array['Negro','Verde']) id",[family]))[0].id;
  const values=await q('select id,label from product_family_option_values where option_id=$1',[option]);black=values.find(v=>v.label==='Negro').id;green=values.find(v=>v.label==='Verde').id;
  assert.equal(values.length,2);
 });
 test('create SKU with inherited price and another with explicit override, zero stock and unknown cost',async()=>{
  blackSku=randomUUID();greenSku=randomUUID();await configure(blackSku);await configure(greenSku,{choices:{[option]:green},override:120});
  const rows=await q('select * from products where family_id=$1 order by price',[family]);assert.equal(rows.length,2);
  assert.equal(rows[0].price,'100.00');assert.equal(rows[1].price,'120.00');for(const p of rows){assert.equal(p.stock,0);assert.equal(p.cost,null);assert.equal(p.status,'draft');assert.equal(p.web_visible,false);}
 });
 test('duplicate combination, missing/unknown values and cross-family values are rejected in SQL',async()=>{
  await assert.rejects(configure(randomUUID()),/unique|duplicate/i);
  await assert.rejects(configure(randomUUID(),{choices:{}}),/OPTIONS_INCOMPLETE/);
  await assert.rejects(configure(randomUUID(),{choices:{[option]:randomUUID()}}),/OPTIONS_INVALID/);
  await assert.rejects(configure(randomUUID(),{choices:{[randomUUID()]:black}}),/OPTIONS_INVALID/);
 });
 test('base price updates only inheriting SKU; cents, stock and costs preserved',async()=>{
  const f=(await q('select revision from product_families where id=$1',[family]))[0];
  await q('select save_product_family($1,$2,$3,$4,$5,100.01)',[family,f.revision,'SYNTHETIC PILOT',`synthetic-family-${family}`,category]);
  const rows=await q('select id,price,stock,cost from products where family_id=$1',[family]);assert.equal(rows.find(p=>p.id===blackSku).price,'100.01');assert.equal(rows.find(p=>p.id===greenSku).price,'120.00');for(const p of rows){assert.equal(p.stock,0);assert.equal(p.cost,null);}
  await assert.rejects(q("update products set price=1 where id=$1",[blackSku]),/PRICE_MANAGED/);
  await assert.rejects(q('select save_product_family($1,1,$2,$3,$4,100)',[family,'STALE',`synthetic-family-${family}`,category]),/STALE_VERSION/);
 });
 test('transaction rollback restores family, inherited SKU and version together',async()=>{
  const before=await q('select base_price,revision from product_families where id=$1',[family]);
  await q('begin');await q('update product_families set base_price=200 where id=$1',[family]);assert.equal((await q('select price from products where id=$1',[blackSku]))[0].price,'200.00');await q('rollback');
  assert.deepEqual(await q('select base_price,revision from product_families where id=$1',[family]),before);
  assert.equal((await q('select price from products where id=$1',[blackSku]))[0].price,'100.01');
 });
 test('SKU identity and in-use option definitions cannot be reassigned; can add a new value',async()=>{
  await assert.rejects(configure(blackSku,{new:false,version:await version(blackSku),choices:{[option]:green}}),/IDENTITY_IMMUTABLE/);
  await assert.rejects(q("select add_product_family_option($1,'Capacity',array['1L'])",[family]),/DEFINITION_IN_USE/);
  await assert.rejects(q("update product_family_option_values set label='Changed' where id=$1",[black]),/IDENTITY_IMMUTABLE|permission denied/);
  const blue=(await q("select add_product_family_value($1,'Azul') id",[option]))[0].id;assert.ok(blue);
  await configure(randomUUID(),{choices:{[option]:blue}});
 });
 test('stale product version rejects configuration instead of losing a concurrent edit',async()=>{
  const v=await version(blackSku);await q("update products set short_description='SYNTHETIC EDIT' where id=$1",[blackSku]);
  await assert.rejects(configure(blackSku,{new:false,version:v}),/STALE_VERSION/);
 });
 test('simple SKU association preserves stock and price and never reassigns historical identities',async()=>{
  const f=randomUUID();await q('select save_product_family($1,0,$2,$3,$4,200)',[f,'SYNTHETIC GROUP',`synthetic-family-${f}`,category]);
  const o=(await q("select add_product_family_option($1,'Capacity',array['1L']) id",[f]))[0].id;
  const v=(await q('select id from product_family_option_values where option_id=$1',[o]))[0].id;
  await assert.rejects(configure(legacy,{family:f,new:false,version:await version(legacy),choices:{[o]:v}}),/LINK_MUST_PRESERVE_PRICE/);
  await configure(legacy,{family:f,new:false,version:await version(legacy),choices:{[o]:v},override:100});
  assert.equal((await q('select stock from products where id=$1',[legacy]))[0].stock,3);assert.deepEqual(await q('select * from order_items'),baseline.items);
 });
 test('web-hidden SKU remains sellable at counter; stock deducted once and retry is idempotent',async()=>{
  await q('update product_families set base_price=100 where id=$1',[family]);await q("update products set stock=2,status='active' where id=$1",[blackSku]);
  const k=randomUUID(),r=await sale(blackSku,k);assert.equal(r.total,75);const s=await state();assert.equal((await sale(blackSku,k)).order_id,r.order_id);assert.deepEqual(await state(),s);
  assert.equal((await q('select stock from products where id=$1',[blackSku]))[0].stock,1);
 });
 test('commercial blocking rejects a new physical sale and rolls back order/payment/stock',async()=>{
  await configure(blackSku,{new:false,version:await version(blackSku),blocked:true});const s=await state();
  await assert.rejects(sale(blackSku),/COMMERCIALLY_BLOCKED/);assert.deepEqual(await state(),s);assert.equal((await q('select stock from products where id=$1',[blackSku]))[0].stock,1);
  await configure(blackSku,{new:false,version:await version(blackSku)});
 });
 test('web-hidden and blocked SKU cannot be reserved; public checkout contract unchanged',async()=>{
  // Seed is synthetic and local only; it supplies the approved test checkout configuration.

  const request={customer:{fullName:'SYNTHETIC',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:blackSku,quantity:1}]};
  const s=await state();await assert.rejects(q('select create_checkout_atomic($1,$2,$3)',[randomUUID(),randomUUID(),JSON.stringify(request)]),/NOT_WEB_VISIBLE/);assert.deepEqual(await state(),s);
  await configure(blackSku,{new:false,version:await version(blackSku),web:true,blocked:true});
  await assert.rejects(q('select create_checkout_atomic($1,$2,$3)',[randomUUID(),randomUUID(),JSON.stringify(request)]),/COMMERCIALLY_BLOCKED/);assert.deepEqual(await state(),s);
  await configure(blackSku,{new:false,version:await version(blackSku),web:true});
 });
 test('online reservation still protects exact SKU from a physical sale and releases once',async()=>{
  const request={customer:{fullName:'SYNTHETIC',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:blackSku,quantity:1}]};
  const result=(await q('select create_checkout_atomic($1,$2,$3) r',[randomUUID(),randomUUID(),JSON.stringify(request)]))[0].r;
  assert.equal(result.total,75);assert.equal((await q('select stock from products where id=$1',[blackSku]))[0].stock,0);
  await assert.rejects(sale(blackSku),/STOCK_INSUFFICIENT/);
  await q("select transition_checkout_atomic($1,'cancelled')",[result.id]);await q("select transition_checkout_atomic($1,'cancelled')",[result.id]);
  assert.equal((await q('select stock from products where id=$1',[blackSku]))[0].stock,1);
 });
 test('blocking a SKU preserves a timely online payment report and manual full payment without another deduction',async()=>{
  const buyer=randomUUID(),key=randomUUID(),request={customer:{fullName:'SYNTHETIC',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:blackSku,quantity:1}]};
  const order=(await q('select create_checkout_atomic($1,$2,$3) r',[buyer,randomUUID(),JSON.stringify(request)]))[0].r;
  await configure(blackSku,{new:false,version:await version(blackSku),web:true,blocked:true});
  const proof=(await q("select prepare_checkout_payment_report($1,$2,$3,$4,'application/pdf',20) r",[buyer,order.id,key,'a'.repeat(64)]))[0].r;
  // Storage catalog fixture only. No file upload or privacy certification claimed here.
  await q("insert into storage.objects(bucket_id,name,metadata) values('checkout-payment-proofs',$1,$2)",[proof.path,JSON.stringify({size:20,mimetype:'application/pdf'})]);
  await q('select submit_checkout_payment_report($1,$2,$3)',[buyer,order.id,key]);
  await q("update checkout_operations set expires_at=clock_timestamp()-interval '1 hour' where order_id=$1",[order.id]);
  await q("update checkout_payment_reports set reported_at=clock_timestamp()-interval '2 hours' where order_id=$1",[order.id]);
  await assert.rejects(q("select transition_checkout_atomic($1,'expired')",[order.id]),/PAYMENT_REPORT_PROTECTED/);
  const paymentKey=randomUUID();await q('select confirm_checkout_manual_payment($1,$2,$3,75,$4)',[order.id,paymentKey,actor,'SYNTHETIC MANUAL']);
  const before=await state();await q('select confirm_checkout_manual_payment($1,$2,$3,75,$4)',[order.id,paymentKey,actor,'SYNTHETIC MANUAL']);assert.deepEqual(await state(),before);
  assert.equal((await q('select stock from products where id=$1',[blackSku]))[0].stock,0);
  await assert.rejects(q("select transition_checkout_atomic($1,'cancelled')",[order.id]),/INVALID_TRANSITION|PAID_RESERVATION_PROTECTED/);
  assert.equal((await q("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='release'",[order.id]))[0].n,0);
  await configure(blackSku,{new:false,version:await version(blackSku),web:true});
 });
 test('concurrent base price and SKU override changes finish consistently without a deadlock',async()=>{
  const a=await connect(),b=await connect();try{
   await a.query('set role service_role');await b.query('set role service_role');
   const v=await version(greenSku);const results=await Promise.allSettled([
    q('select save_product_family($1,(select revision from product_families where id=$1),(select name from product_families where id=$1),(select slug from product_families where id=$1),(select category_id from product_families where id=$1),110)',[family],a),
    configure(greenSku,{new:false,version:v,choices:{[option]:green},override:130},b)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
   const p=await q('select id,price from products where family_id=$1',[family]);assert.equal(p.find(p=>p.id===greenSku).price,'130.00');assert.equal(p.find(p=>p.id===blackSku).price,'110.00');
  }finally{await a.end();await b.end();}
 });
 test('legacy writer holding a SKU fails fast instead of deadlocking against a family-price change',async()=>{
  const a=await connect(),b=await connect();let job;
  try {
   await a.query('set role service_role');await b.query('set role service_role');await a.query('begin');
   await a.query('select id from products where id=$1 for update',[blackSku]);
   const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
   job=b.query('update product_families set base_price=130 where id=$1',[family]);
   for(let i=0;i<40;i++){if((await db.query("select count(*)::int n from pg_locks where locktype='advisory' and granted and pid=$1",[pid])).rows[0].n)break;await delay(10);}
   await assert.rejects(a.query('update products set price=price where id=$1',[blackSku]),e=>e.code==='55P03'&&/CATALOG_BUSY/.test(e.message));
   await a.query('rollback');await job;job=null;
   assert.equal((await q('select price from products where id=$1',[blackSku]))[0].price,'130.00');
  } finally {await a.query('rollback').catch(()=>{});if(job)await job.catch(()=>{});await a.end();await b.end();}
 });
 test('blocking after an old draft prevents a new negative sale movement, while releases remain possible',async()=>{
  await configure(blackSku,{new:false,version:await version(blackSku),blocked:true});
  await assert.rejects(q("insert into inventory_movements(product_id,movement_type,quantity,previous_stock,new_stock,reason) values($1,'sale',-1,1,0,'SYNTHETIC')",[blackSku]),/COMMERCIALLY_BLOCKED/);
  await configure(blackSku,{new:false,version:await version(blackSku)});
 });
 test('multiple option dimensions require a complete exact combination and reject cross-family values',async()=>{
  const f=randomUUID();await q('select save_product_family($1,0,$2,$3,$4,100)',[f,'SYNTHETIC MULTI',`synthetic-family-${f}`,category]);
  const o=(await q("select add_product_family_option($1,'Capacity',array['1L']) id",[f]))[0].id;
  const v=(await q('select id from product_family_option_values where option_id=$1',[o]))[0].id;
  const o2=(await q("select add_product_family_option($1,'Color',array['Negro']) id",[f]))[0].id;
  const v2=(await q('select id from product_family_option_values where option_id=$1',[o2]))[0].id;
  await assert.rejects(configure(randomUUID(),{family:f,choices:{[o]:v}}),/OPTIONS_INCOMPLETE/);
  await assert.rejects(configure(randomUUID(),{family:f,choices:{[o]:v,[o2]:black}}),/OPTIONS_INVALID/);
  await configure(randomUUID(),{family:f,choices:{[o]:v,[o2]:v2}});
  await assert.rejects(configure(randomUUID(),{family:f,choices:{[o2]:v2,[o]:v}}),/duplicate|unique/i);
 });
 test('family variants reader returns complete bounded pages with version tokens',async()=>{
  const f=randomUUID();await q('select save_product_family($1,0,$2,$3,$4,100)',[f,'SYNTHETIC PAGINATION',`synthetic-family-${f}`,category]);
  const o=(await q("select add_product_family_option($1,'Number',array(select generate_series(1,26)::text)) id",[f]))[0].id;
  const values=await q('select id from product_family_option_values where option_id=$1',[o]);for(const v of values)await configure(randomUUID(),{family:f,choices:{[o]:v.id}});
  const p1=(await q('select list_product_family_variants($1,1) r',[f]))[0].r,p2=(await q('select list_product_family_variants($1,2) r',[f]))[0].r;
  assert.equal(p1.length,25);assert.equal(p2.length,1);assert.equal(new Set([...p1,...p2].map(p=>p.id)).size,26);assert.match(p1[0].version,/^[a-f0-9]{64}$/);
  await assert.rejects(q('select list_product_family_variants($1,0)',[f]),/PAGE_INVALID/);
 });
 test('anon/authenticated cannot read private family tables or execute administrative RPCs',async()=>{
  for(const role of ['anon','authenticated']){
   await q(`set role ${role}`);try{
    for(const t of ['product_families','product_family_options','product_family_option_values'])await assert.rejects(q(`select * from ${t}`),/permission denied/);
    await assert.rejects(q('select list_product_family_variants($1,1)',[family]),/permission denied/);
    await assert.rejects(q('select save_product_family($1,0,$2,$3,$4,1)',[randomUUID(),'SYNTHETIC','forbidden',category]),/permission denied/);
   }finally{await q('reset role');await q('set role service_role');}
  }
 });
 test('all new SQL functions are invoker security with fixed search path; tables keep RLS',async()=>{
  const rows=await q("select proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('save_product_family','configure_product_variant','guard_variant_new_sale','list_product_family_variants')");assert.equal(rows.length,4);for(const r of rows){assert.equal(r.prosecdef,false);assert.ok(r.proconfig.includes('search_path=pg_catalog, public'));}
  assert.equal((await q("select count(*)::int n from pg_class where oid in ('product_families'::regclass,'product_family_options'::regclass,'product_family_option_values'::regclass) and relrowsecurity"))[0].n,3);
 });
});
