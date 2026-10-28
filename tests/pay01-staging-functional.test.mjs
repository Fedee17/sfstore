import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hashStagingSql } from '../scripts/prepare-checkout-staging.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,readFileSync,readdirSync,rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { before,after,describe,test } from 'node:test';
import { Client } from 'pg';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(join(root,'staging/migration-manifest.json'),'utf8'));
const read=file=>readFileSync(join(root,file),'utf8');
test('staging history has unique versions and keeps canonical applied SQL byte-identical',()=>{
  assert.equal(hashStagingSql('select 1;\n'),hashStagingSql('select 1;\r\n'));
  assert.notEqual(hashStagingSql('select 1;\n'),hashStagingSql('select 2;\n'));
  const expected = ['supabase/rebuild', 'supabase/migrations']
    .flatMap(directory => readdirSync(resolve(root, directory)).filter(file => file.endsWith('.sql')).map(file => {
      const source = directory + '/' + file;
      const name = file === '202609180002_suppliers_admin.sql' ? '202609180003_suppliers_admin.sql' : file;
      return { source, stagingFile: 'staging/supabase/migrations/' + name };
    }))
    .sort((a, b) => a.stagingFile.localeCompare(b.stagingFile));
  assert.deepEqual(manifest.applicationOrder.map(({ source, stagingFile }) => ({ source, stagingFile })), expected);
  assert.equal(new Set(manifest.applicationOrder.map(entry => entry.source)).size, expected.length);
  const versions=manifest.applicationOrder.map(e=>e.stagingFile.split('/').at(-1).split('_')[0]);assert.equal(new Set(versions).size,versions.length);
  for(const e of manifest.applicationOrder){assert.equal(hashStagingSql(read(e.source)),e.sourceSha256);assert.equal(hashStagingSql(read(e.stagingFile)),e.stagingSha256);if(e.source!=='supabase/schema.sql')assert.equal(read(e.source),read(e.stagingFile));}
  assert.match(manifest.applicationOrder.find(e=>e.source.endsWith('202609180002_suppliers_admin.sql')).stagingFile,/202609180003_suppliers_admin/);
  assert.equal(manifest.applicationOrder.at(-1).source, expected.at(-1).source);
});
describe('synthetic staging package: complete checkout and reservation lifecycle',{skip:!process.env.SFSTORE_TEST_PG_BIN,concurrency:false},()=>{
  let dir,db,connection,started=false,paidOrder;
  const product='22222222-2222-4222-8222-222222222222',buyer=randomUUID(),admin=randomUUID();
  const request=(method='transfer',shipping={method:'pickup'})=>({customer:{fullName:'Synthetic Guest',phone:'fixture-phone'},paymentMethod:method,shipping,items:[{productId:product,quantity:2}]});
  const buyers=new Map();
  const create=async(body=request(),key=randomUUID(),client=db)=>{if(!buyers.has(key))buyers.set(key,buyers.size===0?buyer:randomUUID());return(await client.query('select create_checkout_atomic($1,$2,$3) result',[buyers.get(key),key,body])).rows[0].result;};
  const stock=async()=>(await db.query('select stock from products where id=$1',[product])).rows[0].stock;
  function run(bin,args){const r=spawnSync(join(process.env.SFSTORE_TEST_PG_BIN,bin),args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr||r.error?.message);}
  before(async()=>{
    dir=mkdtempSync(join(tmpdir(),'sfstore-staging-db-'));run('initdb',['-D',join(dir,'data'),'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
    const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
    run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-h 127.0.0.1 -p ${port} -c fsync=off -c statement_timeout=10000`,'-w','start']);started=true;
    connection={host:'127.0.0.1',port,user:'postgres',database:'postgres'};db=new Client(connection);await db.connect();
    await db.query('create role anon;create role authenticated;create role service_role bypassrls;');
    await db.query(read('tests/fixtures/storage-permissions.sql'));
    for(const e of manifest.applicationOrder)await db.query(read(e.stagingFile));
    await db.query(read('staging/supabase/seed.sql'));await db.query('set role service_role');
  });
  after(async()=>{if(db)await db.end();if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop']);if(dir)rmSync(dir,{recursive:true,force:true});});
  test('all staging migrations apply in order; 24h reservation and single 25% freeze survive retries',async()=>{
    const key=randomUUID(),body=request(),first=await create(body,key);assert.equal(first.total,150);assert.equal(first.discount,50);assert.equal(first.shippingCost,0);assert.equal(await stock(),28);
    const op=(await db.query('select buyer_id,extract(epoch from expires_at-created_at)::float8 duration from checkout_operations where order_id=$1',[first.id])).rows[0];assert.equal(op.buyer_id,buyer);assert.ok(op.duration>86399 && op.duration<=86400);
    await db.query('update products set price=200,transfer_price=150 where id=$1',[product]);assert.deepEqual(await create(body,key),first);assert.equal(await stock(),28);await db.query('update products set price=100,transfer_price=75 where id=$1',[product]);paidOrder=first;
  });
  test('manual transfer payment is recorded once; paid order never releases stock on expiry',async()=>{
    const key=randomUUID(),args=[paidOrder.id,key,admin,150,'SYNTHETIC-NOT-BANK-PAYMENT'];
    const first=(await db.query('select confirm_checkout_manual_payment($1,$2,$3,$4,$5) result',args)).rows[0].result;
    assert.equal(first.payment_status,'paid');assert.deepEqual((await db.query('select confirm_checkout_manual_payment($1,$2,$3,$4,$5) result',args)).rows[0].result,first);
    await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[paidOrder.id]);
    assert.equal((await db.query('select expire_checkout_reservations(100) result')).rows[0].result.released,0);assert.equal(await stock(),28);
    assert.equal((await db.query('select count(*)::int n from checkout_manual_payments where order_id=$1',[paidOrder.id])).rows[0].n,1);
  });
  test('cash is denied; transfer expiry releases once without changing paid order',async()=>{
    await assert.rejects(create(request('cash')),/CHECKOUT_INVALID_REQUEST/);const order=await create();assert.equal(await stock(),26);
    assert.equal((await db.query('select expire_checkout_reservations(100) result')).rows[0].result.released,0);
    await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[order.id]);
    assert.equal((await db.query('select expire_checkout_reservations(100) result')).rows[0].result.released,1);assert.equal(await stock(),28);
    assert.equal((await db.query('select expire_checkout_reservations(100) result')).rows[0].result.released,0);assert.equal(await stock(),28);
    await assert.rejects(db.query('select confirm_checkout_manual_payment($1,$2,$3,150,$4)',[order.id,randomUUID(),admin,'late-fixture']),/CHECKOUT_INVALID_TRANSITION|CHECKOUT_EXPIRED|CHECKOUT_ORDER_NOT_PAYABLE/);
  });
  test('locked expired reservation is deferred and next manual run releases it exactly once',async()=>{
    const before=await stock(),order=await create(),other=new Client(connection);await other.connect();await other.query('set role service_role');
    await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[order.id]);
    try{await other.query('begin');await other.query('select id from orders where id=$1 for update',[order.id]);
      assert.equal((await db.query('select expire_checkout_reservations(100) result')).rows[0].result.released,0);assert.equal(await stock(),before-2);
      await other.query('rollback');assert.equal((await db.query('select expire_checkout_reservations(100) result')).rows[0].result.released,1);assert.equal(await stock(),before);
      assert.equal((await db.query('select expire_checkout_reservations(100) result')).rows[0].result.released,0);
    }finally{await other.query('rollback');await other.end();}
  });
  test('configured national shipping freezes server fee; missing rate creates only an idempotent quotation',async()=>{
    const destination={province:'Córdoba',city:'Synthetic City',postalCode:'5000'};
    const quote=(await db.query('select get_checkout_shipping_quote($1,$2) result',[buyer,destination])).rows[0].result.rates[0];assert.equal(quote.fee,12.5);
    const body=request('transfer',{method:'shipping',...destination,address:'Synthetic Street',carrier:quote.carrier,quoteKey:quote.quoteKey});const order=await create(body);assert.equal(order.total,162.5);assert.equal(order.shippingCost,12.5);assert.equal(order.discount,50);
    const unknown=request('transfer',{method:'shipping',province:'Jujuy',city:'Synthetic Other',postalCode:'4600',address:'Synthetic Street'}),before=await stock();
    await assert.rejects(create(unknown),/CHECKOUT_SHIPPING_QUOTE_REQUIRED/);assert.equal(await stock(),before);
    const key=randomUUID(),args=[buyer,key,unknown];const first=(await db.query('select request_checkout_shipping_quote($1,$2,$3) result',args)).rows[0].result;assert.equal(first.createsOrder,false);
    assert.deepEqual((await db.query('select request_checkout_shipping_quote($1,$2,$3) result',args)).rows[0].result,first);assert.equal(await stock(),before);
  });
  test('simultaneous identical purchases reserve once through the staging migration bundle',async()=>{
    const other=new Client(connection);await other.connect();await other.query('set role service_role');const before=await stock(),key=randomUUID(),body=request();
    try{const [a,b]=await Promise.all([create(body,key),create(body,key,other)]);assert.deepEqual(a,b);assert.equal(await stock(),before-2);}finally{await other.end();}
  });
  test('public identities cannot credit payments, release stock or read private checkout tables',async()=>{
    for(const role of ['anon','authenticated']){await db.query('reset role;set role '+role);try{
      for(const sql of ['select * from orders','select * from checkout_operations','select * from checkout_shipping_quote_requests','select confirm_checkout_manual_payment(null,null,null,null,null)','select expire_checkout_reservations(100)'])await assert.rejects(db.query(sql),e=>e.code==='42501');
    }finally{await db.query('reset role;set role service_role');}}
  });
  test('synthetic seed refuses to overwrite a populated staging database',async()=>{
    await db.query('reset role');await assert.rejects(db.query(read('staging/supabase/seed.sql')),/STAGING_REQUIRES_EMPTY_BUSINESS_TABLES/);await db.query('rollback');assert.ok(await stock()>0);
  });
});
