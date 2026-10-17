import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync,readdirSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { before,after,describe,test } from 'node:test';
import { Client } from 'pg';
const root=resolve(import.meta.dirname,'..');
const docker=process.env.SFSTORE_TEST_DOCKER;
const migration='202610170001_store_sales_full_payment.sql';
const sql=name=>readFileSync(join(root,'supabase/migrations',name),'utf8');

describe('full-payment physical sales in isolated PostgreSQL 17.6', {skip:!docker,concurrency:false},()=>{
  let id,db,port,category,actor,onlineDefinition;
  const name=`sfstore-store-sales-${randomUUID().slice(0,8)}`;
  function command(args){const r=spawnSync(docker,args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();}
  async function connect(){const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await c.connect();return c;}
  before(async()=>{
    // No credentials, host networking, existing volumes, or external database URLs.
    id=command(['run','--detach','--rm','--name',name,'--label','sfstore.synthetic=store-sales',
      '--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust',
      '-p','127.0.0.1::5432','postgres:17.6','-c','statement_timeout=10000','-c','lock_timeout=5000']);
    port=Number(command(['port',id,'5432/tcp']).split(':').at(-1));
    for(let i=0;i<60;i++){try{db=await connect();break;}catch{await delay(250);}}
    assert.ok(db,'isolated database did not start');
    assert.equal((await db.query('show server_version_num')).rows[0].server_version_num,'170006');
    await db.query('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.query(readFileSync(join(root,'supabase/schema.sql'),'utf8'));
    await db.query(readFileSync(join(root,'tests/fixtures/storage-permissions.sql'),'utf8'));
    for(const file of readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<migration).sort()) {
      try{await db.query(sql(file));}catch(e){throw new Error(`baseline ${file}: ${e.message}`);}
    }
    onlineDefinition=(await db.query("select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('create_checkout_atomic','record_order_payment','transition_checkout_atomic') order by oid")).rows;
    await db.query(sql(migration));
    category=randomUUID();actor=randomUUID();
    await db.query("insert into categories(id,name,slug) values($1,'SYNTHETIC','synthetic')",[category]);
    // Legacy helpers are invoker-security and use public unqualified references, as deployed.
    await db.query('grant usage on schema public to service_role; grant select,insert,update,delete on all tables in schema public to service_role');
  });
  after(async()=>{await db?.end();if(id&&/^[a-f0-9]{64}$/.test(id))command(['stop','--time','3',id]);});
  async function product({price=100,cost=40,stock=2,status='active',transfer=1}={}){
    const p=randomUUID();await db.query("insert into products(id,category_id,name,slug,short_description,price,transfer_price,cost,stock,status) values($1::uuid,$2,'SYNTHETIC',$1::text,'SYNTHETIC',$3,$4,$5,$6,$7)",[p,category,price,transfer,cost,stock,status]);return p;
  }
  async function sale(c,items,payments,key=randomUUID(),by=actor){
    await c.query('set role service_role');
    try{return (await c.query('select public.create_store_sale_atomic($1,$2,$3,$4,$5::jsonb,$6::jsonb) result',[key,by,'SYNTHETIC','TEST ONLY',JSON.stringify(items),JSON.stringify(payments)])).rows[0].result;}
    finally{await c.query('reset role');}
  }
  const line=(product_id,quantity=2,unit_price=75)=>({product_id,quantity,unit_price});
  async function state(){return (await db.query("select (select count(*)::int from orders) orders,(select count(*)::int from order_payments) payments,(select count(*)::int from inventory_movements) movements")).rows[0];}
  test('cash sale is fully paid: 200 list, 50 discount, 150 charged, stock 2->0',async()=>{
    const p=await product(),r=await sale(db,[line(p)],[{method:'cash',amount:150}]);
    assert.equal(r.subtotal,200);assert.equal(r.discount,50);assert.equal(r.total,150);assert.equal(r.payment_status,'paid');assert.equal(r.remaining_amount,0);
    const o=(await db.query('select * from orders where id=$1',[r.order_id])).rows[0];assert.equal(o.subtotal,'200.00');assert.equal(o.discount,'50.00');assert.equal(o.total,'150.00');assert.equal(o.status,'paid');
    assert.equal((await db.query('select stock from products where id=$1',[p])).rows[0].stock,0);
    const item=(await db.query('select * from order_items where order_id=$1',[r.order_id])).rows[0];assert.equal(item.unit_cost_snapshot,'40.00');assert.equal(item.list_unit_price_snapshot,'100.00');
  });
  for(const methods of [[{method:'transfer',amount:150}],[{method:'cash',amount:50},{method:'transfer',amount:100}]])test(`discounted ${methods.map(x=>x.method).join('+')}`,async()=>{
    const p=await product();assert.equal((await sale(db,[line(p)],methods)).total,150);
  });
  for(const method of ['debit','credit','qr','other'])test(`cash + ${method}: all products at list, detailed payment preserved`,async()=>{
    const p=await product(),q=await product({price:50});
    const r=await sale(db,[line(p,1,100),line(q,2,50)],[{method:'cash',amount:50},{method,amount:150}]);
    assert.equal(r.total,200);assert.equal(r.discount,0);
    const ledger=(await db.query('select method,store_payment_method from order_payments where order_id=$1 order by amount',[r.order_id])).rows;
    assert.equal(ledger[1].store_payment_method,method);assert.equal(ledger[1].method,method==='debit'||method==='credit'?'card':'other');
  });
  for(const method of ['debit','credit','qr','other'])test(`single ${method} payment charges list price`,async()=>{
    const p=await product(),r=await sale(db,[line(p,2,100)],[{method,amount:200}]);assert.equal(r.subtotal,200);assert.equal(r.discount,0);assert.equal(r.total,200);
  });
  test('duplicate products, fractional quantities and inactive products cannot create sales',async()=>{
    const p=await product(),q=await product({status:'draft'}),before=await state();
    await assert.rejects(sale(db,[line(p,1),line(p,1)],[{method:'cash',amount:150}]),/DUPLICATE_PRODUCT/);
    await assert.rejects(sale(db,[line(p,1.5)],[{method:'cash',amount:112.5}]),/QUANTITY_INVALID/);
    await assert.rejects(sale(db,[line(q)],[{method:'cash',amount:150}]),/PRODUCT_INACTIVE/);
    assert.deepEqual(await state(),before);
  });
  for(const [label,payments,pattern] of [
    ['missing',[],/PAYMENT_INVALID/],['partial',[{method:'cash',amount:149.99}],/TOTAL_MISMATCH/],['overpaid',[{method:'cash',amount:150.01}],/TOTAL_MISMATCH/],
    ['zero',[{method:'cash',amount:0}],/PAYMENT_INVALID/],['negative',[{method:'cash',amount:-1}],/PAYMENT_INVALID/],
    ['excess decimals',[{method:'cash',amount:150.001}],/PAYMENT_INVALID/],['non number',[{method:'cash',amount:'150'}],/PAYMENT_INVALID/],['unsupported',[{method:'card',amount:150}],/PAYMENT_INVALID/]
  ])test(`${label} payment leaves no order, payment or stock movement`,async()=>{
    const p=await product(),before=await state();await assert.rejects(sale(db,[line(p)],payments),pattern);assert.deepEqual(await state(),before);assert.equal((await db.query('select stock from products where id=$1',[p])).rows[0].stock,2);
  });
  test('stale or forged preview cannot choose its own price',async()=>{
    const p=await product(),s=await state();await assert.rejects(sale(db,[line(p,2,1)],[{method:'cash',amount:2}]),/PRICE_CHANGED/);assert.deepEqual(await state(),s);
  });
  test('stock insufficient rolls back the whole multi-product sale',async()=>{
    const p=await product(),q=await product({stock:1}),s=await state();await assert.rejects(sale(db,[line(p),line(q)],[{method:'transfer',amount:300}]),/STOCK_INSUFFICIENT/);assert.deepEqual(await state(),s);assert.equal((await db.query('select stock from products where id=$1',[p])).rows[0].stock,2);
  });
  test('rounding with cents matches preview and ignores transfer_price',async()=>{
    const p=await product({price:100.01,stock:3}),r=await sale(db,[line(p,3,75.01)],[{method:'cash',amount:225.03}]);assert.equal(r.subtotal,300.03);assert.equal(r.discount,75);assert.equal(r.total,225.03);
  });
  test('cost and list snapshots survive catalog edits and idempotent retry',async()=>{
    const p=await product(),key=randomUUID(),items=[line(p)],payments=[{method:'cash',amount:150}];const first=await sale(db,items,payments,key),s=await state();
    await db.query('update products set cost=90,price=200 where id=$1',[p]);const retry=await sale(db,items,payments,key);assert.equal(retry.order_id,first.order_id);assert.deepEqual(await state(),s);
    const i=(await db.query('select unit_cost_snapshot,list_unit_price_snapshot from order_items where order_id=$1',[first.order_id])).rows[0];assert.equal(i.unit_cost_snapshot,'40.00');assert.equal(i.list_unit_price_snapshot,'100.00');
    await assert.rejects(sale(db,items,[{method:'transfer',amount:150}],key),/IDEMPOTENCY_CONFLICT/);
    await assert.rejects(sale(db,items,payments,key,randomUUID()),/IDEMPOTENCY_CONFLICT/);
  });
  test('missing cost remains explicitly unknown, never guessed as zero',async()=>{
    const p=await product({cost:null}),r=await sale(db,[line(p)],[{method:'cash',amount:150}]);assert.equal((await db.query('select unit_cost_snapshot from order_items where order_id=$1',[r.order_id])).rows[0].unit_cost_snapshot,null);
  });
  test('same-key concurrent requests create one sale and one deduction',async()=>{
    const p=await product(),key=randomUUID(),a=await connect(),b=await connect(),s=await state();try{
      const [x,y]=await Promise.all([sale(a,[line(p)],[{method:'cash',amount:150}],key),sale(b,[line(p)],[{method:'cash',amount:150}],key)]);assert.equal(x.order_id,y.order_id);
      const end=await state();assert.equal(end.orders-s.orders,1);assert.equal(end.payments-s.payments,1);assert.equal(end.movements-s.movements,1);
    }finally{await a.end();await b.end();}
  });
  test('different-key competition for last units permits exactly one paid sale',async()=>{
    const p=await product(),a=await connect(),b=await connect(),s=await state();try{
      const r=await Promise.allSettled([sale(a,[line(p)],[{method:'cash',amount:150}]),sale(b,[line(p)],[{method:'transfer',amount:150}])]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.match(r.find(x=>x.status==='rejected').reason.message,/STOCK_INSUFFICIENT/);
      const end=await state();assert.equal(end.orders-s.orders,1);assert.equal(end.payments-s.payments,1);assert.equal(end.movements-s.movements,1);assert.equal((await db.query('select stock from products where id=$1',[p])).rows[0].stock,0);
    }finally{await a.end();await b.end();}
  });
  test('failure after payment insertion rolls back items, payments, order and stock',async()=>{
    const p=await product(),s=await state();
    await db.query("create function synthetic_fail() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_LATE_FAILURE';end$$; create trigger synthetic_fail before insert on inventory_movements for each row execute function synthetic_fail()");
    try{await assert.rejects(sale(db,[line(p)],[{method:'cash',amount:150}]),/SYNTHETIC_LATE_FAILURE/);assert.deepEqual(await state(),s);assert.equal((await db.query('select stock from products where id=$1',[p])).rows[0].stock,2);}
    finally{await db.query('drop trigger synthetic_fail on inventory_movements;drop function synthetic_fail()');}
  });
  test('web reservation still uses online contract and competes with physical sale for shared stock',async()=>{
    await db.query("insert into checkout_configuration(id,enabled,reservation_seconds,price_policy,buyer_authorization,delivery_options,approved_revision) values($1,true,86400,'manual_25_frozen','authenticated','[{\"method\":\"pickup\",\"fee\":0}]','SYNTHETIC-ONLY')",[randomUUID()]);
    const p=await product(),a=await connect(),b=await connect(),s=await state();
    const buyer=randomUUID(),key=randomUUID(),request={customer:{fullName:'SYNTHETIC',phone:'0000000000'},shipping:{method:'pickup'},paymentMethod:'transfer',items:[{productId:p,quantity:2}]};
    try {
      const physical=sale(a,[line(p)],[{method:'cash',amount:150}]);
      const online=(async()=>{await b.query('set role service_role');try{return(await b.query('select create_checkout_atomic($1,$2,$3) result',[buyer,key,request])).rows[0].result;}finally{await b.query('reset role');}})();
      const results=await Promise.allSettled([physical,online]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      assert.match(results.find(x=>x.status==='rejected').reason.message,/STOCK_INSUFFICIENT|CHECKOUT_INSUFFICIENT_STOCK/);
      assert.equal((await db.query('select stock from products where id=$1',[p])).rows[0].stock,0);
      assert.equal((await state()).orders-s.orders,1);
    }finally{await a.end();await b.end();}
    // An uncontested web order still reserves 24h, applies 25% and retries idempotently.
    const q=await product(),body={...request,items:[{productId:q,quantity:2}]},bk=randomUUID(),ok=randomUUID();
    const first=(await db.query('select create_checkout_atomic($1,$2,$3) result',[bk,ok,body])).rows[0].result;
    assert.equal(first.total,150);assert.equal(first.discount,50);
    assert.deepEqual((await db.query('select create_checkout_atomic($1,$2,$3) result',[bk,ok,body])).rows[0].result,first);
    const op=(await db.query('select extract(epoch from expires_at-created_at)::int seconds from checkout_operations where order_id=$1',[first.id])).rows[0];assert.equal(op.seconds,86400);
    const item=(await db.query('select unit_cost_snapshot,list_unit_price_snapshot from order_items where order_id=$1',[first.id])).rows[0];assert.equal(item.unit_cost_snapshot,null);assert.equal(item.list_unit_price_snapshot,null);
  });
  test('online/payment RPC definitions unchanged and public roles cannot call physical RPC',async()=>{
    assert.deepEqual((await db.query("select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('create_checkout_atomic','record_order_payment','transition_checkout_atomic') order by oid")).rows,onlineDefinition);
    for(const role of ['anon','authenticated']){await db.query(`set role ${role}`);try{await assert.rejects(db.query("select public.create_store_sale_atomic(null,null,null,null,'[]','[]')"),/permission denied/);}finally{await db.query('reset role');}}
    assert.equal((await db.query('select count(*)::int n from products where stock<0')).rows[0].n,0);
  });
});
