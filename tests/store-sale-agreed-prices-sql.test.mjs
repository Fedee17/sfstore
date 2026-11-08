import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {before,after,describe,test} from 'node:test';

const root=resolve(import.meta.dirname,'..');
const runtimePath=process.env.SFSTORE_TEST_PGLITE_MODULE;
describe('agreed store-sale prices / isolated PostgreSQL WASM', {skip:!runtimePath,concurrency:false},()=>{
  let db,category,onlineDefinitions;
  const actor=randomUUID();
  const q=async(sql,args=[])=> (await db.query(sql,args)).rows;
  before(async()=>{
    const runtime=createRequire(join(runtimePath,'package.json'));
    const {PGlite}=runtime('@electric-sql/pglite');
    const {pgcrypto}=runtime('@electric-sql/pglite/contrib/pgcrypto');
    db=new PGlite({extensions:{pgcrypto}});
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(readFileSync(join(root,'tests/fixtures/storage-permissions.sql'),'utf8'));
    const manifest=JSON.parse(readFileSync(join(root,'staging/migration-manifest.json'),'utf8'));
    for(const entry of manifest.applicationOrder.filter(e=>e.source.split('/').at(-1)<'202610210001')) {
      try{await db.exec(readFileSync(join(root,entry.stagingFile),'utf8'));}
      catch(error){throw new Error(entry.source+': '+error.message);}
    }
    onlineDefinitions=await q("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('create_checkout_atomic','record_order_payment','complete_store_sale') order by proname");
    const migration=readFileSync(join(root,'supabase/migrations/202611070001_store_sale_agreed_unit_prices.sql'),'utf8');
    await db.exec('alter function public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb) security definer');
    await assert.rejects(db.exec(migration),/STORE_SALE_BASE_CONTRACT_CHANGED/);
    await db.exec('rollback');
    assert.equal((await q("select to_regprocedure('public.apply_store_sale_agreed_prices(jsonb,jsonb)') helper"))[0].helper,null);
    await db.exec('alter function public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb) security invoker');
    await db.exec(migration);
    await db.exec(readFileSync(join(root,'supabase/migrations/202611080001_store_sale_commercial_date.sql'),'utf8'));
    category=randomUUID();
    await q('insert into categories(id,name,slug) values($1::uuid,\'SYNTHETIC\',$1::text)',[category]);
  });
  after(async()=>{await db?.close();});
  async function product(){const id=randomUUID();await q("insert into products(id,category_id,name,slug,short_description,price,cost,stock,status) values($1::uuid,$2,'SYNTHETIC',$1::text,'SYNTHETIC',100,40,5,'active')",[id,category]);return id;}
  async function sale(id,{agreed,preview=75,amount=agreed??75,quantity=1,key=randomUUID(),method='cash'}={}) {
    const items=[{product_id:id,quantity,unit_price:preview,...(agreed!==undefined?{sale_unit_price:agreed}:{})}];
    await db.exec('set role service_role');
    try{return (await q('select create_store_sale_atomic($1,$2,null,null,$3::jsonb,$4::jsonb) result',[key,actor,JSON.stringify(items),JSON.stringify([{method,amount}])]))[0].result;}
    finally{await db.exec('reset role');}
  }
  async function datedSale(id,date,key=randomUUID()) {
    await db.exec('set role service_role');
    try{return (await q('select create_store_sale_dated_atomic($1,$2,null,null,$3::jsonb,$4::jsonb,$5::date) result',[key,actor,JSON.stringify([{product_id:id,quantity:1,unit_price:75}]),JSON.stringify([{method:'cash',amount:75}]),date]))[0].result;}
    finally{await db.exec('reset role');}
  }
  test('past business date leaves creation, receipt and inventory timestamps unchanged and does not claim a historical cost',async()=>{
    const date=(await q("select ((statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date - interval '1 month')::date::text date"))[0].date;
    const id=await product(),result=await datedSale(id,date);
    const saved=(await q("select store_sale_date::text date, metadata->>'cost_snapshot_policy' policy,metadata->>'store_sale_backdated' backdated,created_at from orders where id=$1",[result.order_id]))[0];
    assert.equal(saved.date,date);assert.equal(result.sale_date,date);assert.equal(saved.backdated,'true');assert.equal(saved.policy,'current_product_cost_at_late_entry_v1');
    const timestamps=(await q("select (p.paid_at at time zone 'America/Argentina/Buenos_Aires')::date::text paid_day,(m.created_at at time zone 'America/Argentina/Buenos_Aires')::date::text stock_day,(o.created_at at time zone 'America/Argentina/Buenos_Aires')::date::text entered_day from orders o join order_payments p on p.order_id=o.id join inventory_movements m on m.order_id=o.id where o.id=$1",[result.order_id]))[0];
    assert.notEqual(timestamps.entered_day,date);assert.equal(timestamps.paid_day,timestamps.entered_day);assert.equal(timestamps.stock_day,timestamps.entered_day);
    assert.equal((await q('select stock from products where id=$1',[id]))[0].stock,4);
  });
  test('dated replay keeps the date, payment and stock; another date with the same key is rejected',async()=>{
    const id=await product(),key=randomUUID(),date='2025-09-12';
    const first=await datedSale(id,date,key),again=await datedSale(id,date,key);
    assert.equal(again.order_id,first.order_id);assert.equal(again.operation,'already_created');
    await assert.rejects(datedSale(id,'2025-09-13',key),/STORE_SALE_IDEMPOTENCY_CONFLICT/);
    assert.equal((await q('select stock from products where id=$1',[id]))[0].stock,4);
    assert.equal(Number((await q('select count(*) n from order_payments where order_id=$1',[first.order_id]))[0].n),1);
  });
  test('invalid dates and future dates leave no sale or inventory change',async()=>{
    const id=await product(),before=Number((await q('select count(*) n from orders'))[0].n);
    for(const date of [null,'1899-12-31','9999-01-01'])await assert.rejects(datedSale(id,date),/STORE_SALE_DATE_INVALID/);
    for(const date of ['2026-02-30','not-a-date'])await assert.rejects(datedSale(id,date));
    assert.equal(Number((await q('select count(*) n from orders'))[0].n),before);assert.equal((await q('select stock from products where id=$1',[id]))[0].stock,5);
    const grants=(await q("select has_function_privilege('anon','public.create_store_sale_dated_atomic(uuid,uuid,text,text,jsonb,jsonb,date)','execute') anon,has_function_privilege('authenticated','public.create_store_sale_dated_atomic(uuid,uuid,text,text,jsonb,jsonb,date)','execute') authenticated,has_function_privilege('service_role','public.create_store_sale_dated_atomic(uuid,uuid,text,text,jsonb,jsonb,date)','execute') service"))[0];assert.deepEqual(grants,{anon:false,authenticated:false,service:true});
  });
  test('legacy exact-price request still uses the existing discount and snapshots',async()=>{
    const id=await product(),r=await sale(id);
    assert.equal(r.total,75);assert.equal(r.discount,25);assert.equal(r.payment_status,'paid');
  });
  test('higher agreed price is saved once, catalogue price stays intact and stock reflects quantity',async()=>{
    const id=await product(),r=await sale(id,{agreed:90,quantity:2,amount:180});
    assert.equal(r.total,180);assert.equal(r.subtotal,200);assert.equal(r.discount,20);
    const p=(await q('select price,cost,stock from products where id=$1',[id]))[0];
    assert.equal(Number(p.price),100);assert.equal(Number(p.cost),40);assert.equal(p.stock,3);
    const item=(await q('select unit_price,list_unit_price_snapshot,unit_cost_snapshot from order_items where order_id=$1',[r.order_id]))[0];
    assert.equal(Number(item.unit_price),90);assert.equal(Number(item.list_unit_price_snapshot),100);assert.equal(Number(item.unit_cost_snapshot),40);
  });
  test('agreed price above list never creates a negative discount',async()=>{
    const r=await sale(await product(),{agreed:125});assert.equal(r.total,125);assert.equal(r.subtotal,125);assert.equal(r.discount,0);
  });
  test('card sale uses the undiscounted suggested floor',async()=>{
    const r=await sale(await product(),{preview:100,agreed:125,method:'credit'});assert.equal(r.total,125);
    await assert.rejects(sale(await product(),{preview:100,agreed:90,method:'credit'}),/STORE_SALE_CUSTOM_PRICE_INVALID/);
  });
  test('invalid agreed prices, stale previews and incomplete payments do not create orders or consume stock',async()=>{
    const id=await product(),before=Number((await q('select count(*) n from orders'))[0].n);
    for(const agreed of [0,-1,74.99,75.001,10000000000,'90',null]) await assert.rejects(sale(id,{agreed,amount:90}),/STORE_SALE_CUSTOM_PRICE_INVALID/);
    await assert.rejects(sale(id,{preview:74,agreed:90}),/STORE_SALE_PRICE_CHANGED/);
    await assert.rejects(sale(id,{agreed:90,amount:80}),/STORE_SALE_PAYMENT_TOTAL_MISMATCH/);
    await assert.rejects(sale(id,{agreed:90,amount:100}),/STORE_SALE_PAYMENT_TOTAL_MISMATCH/);
    assert.equal(Number((await q('select count(*) n from orders'))[0].n),before);
    assert.equal((await q('select stock from products where id=$1',[id]))[0].stock,5);
  });
  test('retry keeps the frozen price and does not double-charge or consume stock again',async()=>{
    const id=await product(),key=randomUUID(),first=await sale(id,{key,agreed:90});
    await q('update products set price=200 where id=$1',[id]);
    const retry=await sale(id,{key,agreed:90});assert.equal(retry.order_id,first.order_id);assert.equal(retry.total,90);assert.equal(retry.operation,'already_created');
    assert.equal((await q('select stock from products where id=$1',[id]))[0].stock,4);
    assert.equal(Number((await q('select count(*) n from order_payments where order_id=$1',[first.order_id]))[0].n),1);
    await assert.rejects(sale(id,{key,agreed:95}),/STORE_SALE_IDEMPOTENCY_CONFLICT/);
  });
  test('component allocation changes only the selling price, preserving component quantities and list snapshots',async()=>{
    const components=[{originIndex:0,productId:'head',quantity:2,listPrice:80,unitPrice:60},{originIndex:0,productId:'cable',quantity:2,listPrice:20,unitPrice:15}];
    const adjusted=(await q('select apply_store_sale_agreed_prices($1::jsonb,$2::jsonb) result',[JSON.stringify(components),JSON.stringify([{sale_unit_price:110}])]))[0].result;
    assert.equal(adjusted.reduce((sum,c)=>sum+c.unitPrice,0),110);
    assert.deepEqual(adjusted.map(c=>[c.productId,c.quantity,c.listPrice]),components.map(c=>[c.productId,c.quantity,c.listPrice]));
  });
  test('public roles cannot call either the transaction or the price helper',async()=>{
    for(const role of ['anon','authenticated']) {
      const r=(await q("select has_function_privilege($1,'public.create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','execute') sale,has_function_privilege($1,'public.apply_store_sale_agreed_prices(jsonb,jsonb)','execute') helper",[role]))[0];
      assert.equal(r.sale,false);assert.equal(r.helper,false);
    }
  });
  test('online checkout, shared payment ledger and stock completion contracts remain unchanged',async()=>{
    assert.deepEqual(await q("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('create_checkout_atomic','record_order_payment','complete_store_sale') order by proname"),onlineDefinitions);
  });
});
