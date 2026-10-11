import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { before, after, describe, test } from 'node:test';
import { Client } from 'pg';
const root=resolve(import.meta.dirname,'..');
const pending=readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&f>='202610100001').sort();
const grantName='202610110005_pay01_inventory_transition_permissions.sql';
const sql=name=>readFileSync(join(root,'supabase/migrations',name),'utf8');
test('pending versions are unique; the preexisting legacy version collision is explicitly identified',()=>{
  assert.equal(new Set(pending.map(f=>f.split('_')[0])).size,pending.length);
  const versions=readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).map(f=>f.split('_')[0]);
  assert.deepEqual([...new Set(versions.filter((v,i)=>versions.indexOf(v)!==i))],['202609180002']);
});
describe('Storage/SEC-01/PAY-01 integration on preexisting synthetic rows without broad default service grants',{skip:!process.env.SFSTORE_TEST_PG_BIN,concurrency:false},()=>{
  let dir,db,started=false,baseline;
  const category=randomUUID(),product=randomUUID(),customer=randomUUID(),legacyOrder=randomUUID(),image=randomUUID(),operation=randomUUID();
  const business=['categories','products','product_images','customers','orders','order_items','inventory_movements','product_save_operations'];
  function run(bin,args){const r=spawnSync(join(process.env.SFSTORE_TEST_PG_BIN,bin),args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr||r.error?.message);}
  async function snapshot(){const rows={};for(const table of business)rows[table]=(await db.query(`select to_jsonb(t) row from public.${table} t order by to_jsonb(t)::text`)).rows;rows.tasks=(await db.query("select to_jsonb(t)-'result' row from product_storage_tasks t order by id")).rows;rows.objects=(await db.query('select to_jsonb(t) row from storage.objects t order by id')).rows;return rows;}
  before(async()=>{
    dir=mkdtempSync(join(tmpdir(),'sfstore-integration-db-'));run('initdb',['-D',join(dir,'data'),'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
    const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
    run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-h 127.0.0.1 -p ${port} -c fsync=off -c statement_timeout=10000`,'-w','start']);started=true;
    db=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await db.connect();
    await db.query('create role anon;create role authenticated;create role service_role bypassrls;');
    await db.query(readFileSync(join(root,'supabase/schema.sql'),'utf8'));await db.query(readFileSync(join(root,'tests/fixtures/storage-permissions.sql'),'utf8'));
    for(const file of readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<'202610100001').sort())await db.query(sql(file));
    await db.query("insert into categories(id,name,slug) values($1,'Synthetic','synthetic')",[category]);
    await db.query("insert into products(id,category_id,name,slug,short_description,price,transfer_price,stock,status) values($1,$2,'Synthetic','synthetic','Synthetic',100,75,20,'active')",[product,category]);
    await db.query("insert into product_images(id,product_id,url,is_primary) values($1,$2,'https://synthetic.invalid/product-images/retained.png',true)",[image,product]);
    await db.query("insert into customers(id,full_name,phone) values($1,'Synthetic','synthetic')",[customer]);
    await db.query("insert into orders(id,customer_id,order_number,payment_method,shipping_method,total) values($1,$2,'SYNTHETIC-LEGACY','mercadopago','pickup',100)",[legacyOrder,customer]);
    await db.query("insert into product_save_operations(operation_key,operation_type,product_id,payload_hash,status) values($1,'update_product',$2,repeat('a',64),'aborted')",[operation,product]);
    await db.query("insert into product_storage_tasks(operation_key,product_id,action,storage_path,expected_metadata) values($1,$2,'reconcile','retained.png','{\"path\":\"retained.png\"}')",[operation,product]);
    await db.query("insert into storage.buckets values('product-images',true);insert into storage.objects(bucket_id,name) values('product-images','retained.png');");baseline=await snapshot();
  });
  after(async()=>{await db?.end();if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop']);if(dir)rmSync(dir,{recursive:true,force:true});});
  test('PAY-01 refuses application before SEC-01 and rolls back its DDL',async()=>{
    await assert.rejects(db.query(sql('202610110002_pay01_atomic_checkout.sql')),/PAY01_REQUIRES_SEC01/);await db.query('rollback');
    assert.equal((await db.query("select to_regclass('checkout_configuration') t")).rows[0].t,null);assert.deepEqual(await snapshot(),baseline);
  });
  test('ordered pending migrations preserve legacy images, orders, stock, tasks and Storage metadata; nothing activates',async()=>{
    for(const file of pending.filter(f=>f!==grantName))await db.query(sql(file));
    assert.deepEqual(await snapshot(),baseline);
    assert.equal((await db.query('select result from product_storage_tasks')).rows[0].result,null);
    assert.equal((await db.query('select count(*)::int n from checkout_configuration')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from checkout_operations')).rows[0].n,0);
  });
  test('shipping preparation has no invented tariffs, destinations or activation',()=>{
    const template=JSON.parse(readFileSync(join(root,'config/checkout-shipping.pending.json'),'utf8'));
    assert.equal(template.checkoutEnabled,false);assert.equal(template.shipping.enabled,false);
    assert.equal(template.shipping.carrier,null);assert.equal(template.shipping.fee,null);assert.deepEqual(template.shipping.allowedDestinations,[]);
    assert.equal(template.pickup.fee,null);assert.equal(template.buyerAccess.implemented,true);
    assert.equal(template.shipping.country,'AR');assert.equal(template.shipping.nationalCoverage,true);assert.deepEqual(template.shipping.destinationRates,[]);assert.equal(template.reservationSeconds,86400);assert.equal(template.pricePolicy,'manual_25_frozen');
  });
  let order;
  test('minimal service grants expose missing inventory UPDATE and atomic manual credit rolls back',async()=>{
    await db.query("insert into checkout_configuration(id,enabled,reservation_seconds,price_policy,buyer_authorization,delivery_options,approved_revision) values($1,true,86400,'manual_25_frozen','authenticated','[{\"method\":\"pickup\",\"fee\":0}]','SYNTHETIC-ONLY')",[randomUUID()]);
    await db.query('set role service_role');
    assert.equal((await db.query("select has_column_privilege('service_role','inventory_movements','movement_type','UPDATE') permitted")).rows[0].permitted,false);
    order=(await db.query('select create_checkout_atomic($1,$2,$3) result',[randomUUID(),randomUUID(),{customer:{fullName:'Synthetic',phone:'synthetic',email:'buyer@example.invalid'},shipping:{method:'pickup'},paymentMethod:'transfer',items:[{productId:product,quantity:2}]}])).rows[0].result;
    assert.equal(order.total,150);assert.equal(order.discount,50);
    await assert.rejects(db.query('select confirm_checkout_manual_payment($1,$2,$3,150,$4)',[order.id,randomUUID(),randomUUID(),'synthetic-reference']),e=>e.code==='42501'&&/inventory_movements/.test(e.message));
    assert.equal((await db.query('select state from checkout_operations where order_id=$1',[order.id])).rows[0].state,'pending');
    assert.equal((await db.query('select count(*)::int n from checkout_manual_payments where order_id=$1',[order.id])).rows[0].n,0);
    await db.query('reset role');
  });
  test('narrow service column grant enables manual credit without broad UPDATE or public privileges',async()=>{
    await db.query(sql(grantName));await db.query('set role service_role');
    const rights=(await db.query("select has_table_privilege('service_role','inventory_movements','UPDATE') broad,has_column_privilege('service_role','inventory_movements','movement_type','UPDATE') movement,has_column_privilege('service_role','inventory_movements','reason','UPDATE') reason,has_column_privilege('service_role','inventory_movements','quantity','UPDATE') quantity")).rows[0];
    assert.deepEqual(rights,{broad:false,movement:true,reason:true,quantity:false});
    const key=randomUUID(),admin=randomUUID();const first=(await db.query('select confirm_checkout_manual_payment($1,$2,$3,150,$4) result',[order.id,key,admin,'synthetic-reference'])).rows[0].result;
    const repeat=(await db.query('select confirm_checkout_manual_payment($1,$2,$3,150,$4) result',[order.id,key,admin,'synthetic-reference'])).rows[0].result;assert.deepEqual(first,repeat);assert.equal(first.payment_status,'paid');
    await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[order.id]);await db.query('select expire_checkout_reservations(100)');
    assert.equal((await db.query('select stock from products where id=$1',[product])).rows[0].stock,18);await db.query('reset role');
    for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_any_column_privilege($1,'inventory_movements','UPDATE') permitted",[role])).rows[0].permitted,false);
  });
  test('read-only integration verification reports service-only RPCs, final definitions and required grants',async()=>{
    const results=await db.query(readFileSync(join(root,'reports/sec01-pay01-integration-read-only.sql'),'utf8'));
    assert.equal(results[2].rows[0].type,'jsonb');assert.equal(results[2].rows[0].attnotnull,false);
    assert.equal(results[3].rowCount,3);assert.ok(results[3].rows.every(v=>v.relrowsecurity));
    const rights=results[4].rows;assert.ok(rights.filter(v=>v.rolname!=='service_role').every(v=>!v.update_movement_type&&!v.update_reason&&!v.update_quantity));
    assert.ok(rights.find(v=>v.rolname==='service_role').update_movement_type);
    assert.equal(results[5].rowCount,5);assert.ok(results[5].rows.every(v=>!v.security_definer&&!v.anon_execute&&!v.authenticated_execute&&v.service_execute));
    assert.equal(results[6].rowCount,3);assert.match(results[6].rows.find(v=>v.proname==='create_checkout_atomic').definition,/round\(product.price \* 0.75,2\)/);
    assert.equal(results[8].rows[0].unsupported_enabled_configurations,'0');
  });

});
