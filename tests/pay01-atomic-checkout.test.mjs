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
const migration=readFileSync(join(root,'supabase/migrations/202610110002_pay01_atomic_checkout.sql'),'utf8');
test('PAY-01 migration seeds no business configuration and enables no checkout or scheduled worker',()=>{
  assert.doesNotMatch(migration,/insert into public.checkout_configuration|cron\.|net\.http|create extension|alter role/i);
  assert.match(migration,/PAY01_REQUIRES_SEC01/);
  const approved=readFileSync(join(root,'supabase/migrations/202610110004_pay01_approved_commercial_rules.sql'),'utf8');
  assert.doesNotMatch(approved,/insert into public.checkout_configuration|cron\.|net\.http|alter role/i);
});
describe('PAY-01 real transactions against synthetic isolated PostgreSQL', {skip:!process.env.SFSTORE_TEST_PG_BIN,concurrency:false},()=>{
  let dir,db,connection,started=false;
  const buyer=randomUUID(), config=randomUUID();
  function run(bin,args){const r=spawnSync(join(process.env.SFSTORE_TEST_PG_BIN,bin),args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr||r.error?.message);}
  before(async()=>{
    dir=mkdtempSync(join(tmpdir(),'sfstore-pay01-db-'));
    run('initdb',['-D',join(dir,'data'),'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
    const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
    run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-h 127.0.0.1 -p ${port} -c fsync=off -c statement_timeout=10000`,'-w','start']);started=true;
    connection={host:'127.0.0.1',port,user:'postgres',database:'postgres'};db=new Client(connection);await db.connect();
    await db.query('create role anon; create role authenticated; create role service_role bypassrls; alter default privileges in schema public grant all on tables to service_role;');
    await db.query(readFileSync(join(root,'supabase/schema.sql'),'utf8'));
    await db.query(readFileSync(join(root,'tests/fixtures/storage-permissions.sql'),'utf8'));
    for(const file of readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query(readFileSync(join(root,'supabase/migrations',file),'utf8'));
    await db.query('set role service_role');
  });
  after(async()=>{await db?.end();if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop']);if(dir)rmSync(dir,{recursive:true,force:true});});
  async function fixture({stock=5,price=100,transfer=80,status='active',active=true,historical=false}={}){
    const category=randomUUID(),product=randomUUID();
    await db.query('insert into categories(id,name,slug,is_active) values($1,$2,$3,$4)',[category,'Fixture','fixture-'+category,active]);
    await db.query('insert into products(id,category_id,name,slug,short_description,price,transfer_price,stock,status,historical_identity,historical_group_key) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[product,category,'Fixture','fixture-'+product,historical?null:'Synthetic',historical?null:price,historical?null:transfer,stock,status,historical,historical?'fixture-'+product:null]);
    const request={customer:{fullName:'Synthetic Buyer',phone:'fixture-phone',email:'buyer@example.invalid'},shipping:{method:'pickup'},paymentMethod:'transfer',items:[{productId:product,quantity:2}]};
    return{product,category,request,key:randomUUID()};
  }
  async function create(f,{who=buyer,key=f.key,request=f.request,client=db}={}){return(await client.query('select create_checkout_atomic($1,$2,$3) result',[who,key,request])).rows[0].result;}
  async function transition(id,target){return(await db.query('select transition_checkout_atomic($1,$2) result',[id,target])).rows[0].result;}
  async function stock(id){return(await db.query('select stock from products where id=$1',[id])).rows[0].stock;}
  async function counts(){return(await db.query(`select (select count(*) from customers)::int customers,(select count(*) from orders)::int orders,(select count(*) from order_items)::int items,(select count(*) from checkout_operations)::int operations,(select count(*) from inventory_movements)::int movements`)).rows[0];}
  test('read-only verification finds intact service-only ACLs and no automatic activation',async()=>{
    await db.query('reset role');
    try{
      const results=await db.query(readFileSync(join(root,'reports/pay01-permissions-read-only.sql'),'utf8'));
      assert.equal(results[0].rowCount,2);assert.ok(results[0].rows.every(r=>r.relrowsecurity));assert.equal(results[1].rowCount,0);assert.equal(results[2].rowCount,0);
      assert.deepEqual(results[3].rows,[{configuration_rows:'0',enabled_configurations:'0'}]);assert.equal(results[4].rows[0].checkout_rows,'0');assert.equal(results[5].rowCount,3);assert.equal(results[6].rowCount,5);assert.ok(results[6].rows.every(r=>r.service_execute));
      const manual=await db.query(readFileSync(join(root,'reports/pay01-manual-payments-read-only.sql'),'utf8'));
      assert.equal(manual[0].rowCount,3);assert.ok(manual[0].rows.every(r=>r.relrowsecurity));
      assert.equal(manual[1].rowCount,0);assert.equal(manual[2].rowCount,0);
      assert.equal(manual[3].rowCount,8);assert.ok(manual[3].rows.every(r=>!r.security_definer&&r.service_execute));
      assert.deepEqual(manual[4].rows,[{configuration_rows:'0',enabled_configurations:'0',checkout_rows:'0',manual_receipts:'0'}]);
    }finally{await db.query('set role service_role');}
  });
  test('empty configuration rejects without changing customer, order or inventory data',async()=>{
    const f=await fixture(),before=await counts();await assert.rejects(create(f),/CHECKOUT_NOT_CONFIGURED/);assert.deepEqual(await counts(),before);assert.equal(await stock(f.product),5);
    // Explicit SYNTHETIC policy, not production defaults or owner approval.
    await db.query(`insert into checkout_configuration(id,enabled,reservation_seconds,price_policy,buyer_authorization,delivery_options,approved_revision) values($1,true,86400,'manual_25_frozen','authenticated','[{"method":"pickup","fee":7.25}]','synthetic-test-only')`,[config]);
  });
  test('server prices, exact numeric totals, product FK and reservation commit together',async()=>{
    const f=await fixture({price:100.01,transfer:80.03});const r=await create(f);
    assert.equal(r.total,157.27);assert.equal(r.subtotal,200.02);assert.equal(r.discount,50);assert.equal(r.shippingCost,7.25);assert.equal(r.state,'pending');assert.equal((await db.query('select channel from orders where id=$1',[r.id])).rows[0].channel,'web');assert.equal(await stock(f.product),3);
    const item=(await db.query('select product_id,unit_price,quantity from order_items where order_id=$1',[r.id])).rows[0];assert.equal(item.product_id,f.product);assert.equal(item.unit_price,'75.01');assert.equal(item.quantity,2);
    assert.equal((await db.query('select count(*)::int n from inventory_movements where order_id=$1 and movement_type=\'reservation\'',[r.id])).rows[0].n,1);
  });
  test('differentiated catalogue price above list cannot override the approved 25 percent policy',async()=>{const r=await create(await fixture({transfer:120}));assert.equal(r.total,157.25);assert.equal(r.subtotal,200);assert.equal(r.discount,50);assert.equal(r.total,r.subtotal-r.discount+r.shippingCost);});
  test('tampered totals, unit prices, buyer identity and quantities are rejected atomically',async()=>{
    for(const mutate of [r=>({...r,total:1}),r=>({...r,buyerId:randomUUID()}),r=>({...r,items:[{...r.items[0],unitPrice:0}]}),r=>({...r,items:[{...r.items[0],quantity:0}]}),r=>({...r,items:[{...r.items[0],quantity:1.5}]}),r=>({...r,items:[r.items[0],r.items[0]]})]){
      const f=await fixture(),before=await counts();await assert.rejects(create(f,{request:mutate(f.request)}),/CHECKOUT_(INVALID|DUPLICATE)/);assert.deepEqual(await counts(),before);assert.equal(await stock(f.product),5);
    }
  });
  test('inactive product, category, missing product, historical product and excluded Yara cannot be ordered',async()=>{
    for(const options of [{status:'draft'},{active:false},{stock:0}]){
      const f=await fixture(options);await assert.rejects(create(f),/CHECKOUT_(PRODUCT_UNAVAILABLE|STOCK_INSUFFICIENT)/);
    }
    const f=await fixture();f.request.items[0].productId=randomUUID();await assert.rejects(create(f),/CHECKOUT_PRODUCT_UNAVAILABLE/);
    const yara=await fixture();await db.query("update products set slug='perfume-yara-rosa' where id=$1",[yara.product]);await assert.rejects(create(yara),/CHECKOUT_PRODUCT_UNAVAILABLE/);
    const historical=await fixture({stock:0,status:'archived',historical:true});await assert.rejects(create(historical),/CHECKOUT_PRODUCT_UNAVAILABLE/);
  });
  test('insufficient stock on a later item leaves every item, customer and order untouched',async()=>{
    const f=await fixture(),second=await fixture({stock:1});f.request.items.push({productId:second.product,quantity:2});const before=await counts();await assert.rejects(create(f),/CHECKOUT_STOCK_INSUFFICIENT/);assert.deepEqual(await counts(),before);assert.equal(await stock(f.product),5);
  });
  test('shipping requires explicit destination coverage and takes its fee exclusively from configuration',async()=>{
    const options=[{method:'pickup',fee:7.25},{method:'shipping',carrier:'Andreani',fee:15,allowedDestinations:[{province:'Córdoba',city:'Synthetic City',postalCode:'FIXTURE'}]}];
    await db.query('update checkout_configuration set delivery_options=$1 where id=$2',[JSON.stringify(options),config]);
    try{
      const f=await fixture();f.request.shipping={method:'shipping',carrier:'Andreani',province:'Córdoba',city:'Synthetic City',postalCode:'FIXTURE',address:'Synthetic Address'};
      const r=await create(f);assert.equal(r.shippingCost,15);assert.equal(r.total,165);
      const denied=await fixture();denied.request.shipping={...f.request.shipping,postalCode:'UNAPPROVED'};const before=await counts();await assert.rejects(create(denied),/CHECKOUT_DELIVERY_NOT_CONFIGURED/);assert.deepEqual(await counts(),before);assert.equal(await stock(denied.product),5);
    }finally{await db.query('update checkout_configuration set delivery_options=$1 where id=$2',[JSON.stringify([{method:'pickup',fee:7.25}]),config]);}
  });
  test('canonical item ordering preserves idempotency and live price is read only once',async()=>{
    const f=await fixture(),second=await fixture();f.request.items.push({productId:second.product,quantity:1});const first=await create(f);
    await db.query('update products set price=999,transfer_price=500 where id=$1',[f.product]);f.request.items.reverse();assert.deepEqual(await create(f),first);
  });
  test('retry after lost response returns same order without additional stock or customers',async()=>{
    const f=await fixture(),first=await create(f),before=await counts();assert.deepEqual(await create(f),first);assert.deepEqual(await counts(),before);assert.equal(await stock(f.product),3);
    f.request.customer.phone='changed';await assert.rejects(create(f),/CHECKOUT_IDEMPOTENCY_CONFLICT/);assert.deepEqual(await counts(),before);
  });
  test('concurrent double submit creates exactly one order',async()=>{
    const f=await fixture(),other=new Client(connection);await other.connect();await other.query('set role service_role');
    try{const before=await counts();const [a,b]=await Promise.all([create(f),create(f,{client:other})]);assert.equal(a.id,b.id);assert.equal((await counts()).orders,before.orders+1);assert.equal(await stock(f.product),3);}finally{await other.end();}
  });
  test('concurrent buyers cannot oversell last stock',async()=>{
    const f=await fixture({stock:3}),other=new Client(connection);await other.connect();await other.query('set role service_role');
    try{const results=await Promise.allSettled([create(f),create(f,{who:randomUUID(),key:randomUUID(),client:other})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/CHECKOUT_STOCK_INSUFFICIENT/);assert.equal(await stock(f.product),1);}finally{await other.end();}
  });
  test('same idempotency UUID in different verified buyer scopes is independent',async()=>{
    const f=await fixture({stock:6});const a=await create(f),b=await create(f,{who:randomUUID()});assert.notEqual(a.id,b.id);assert.equal(await stock(f.product),2);
  });
  test('injected failure after stock update rolls back all rows and retry succeeds',async()=>{
    const f=await fixture(),before=await counts();await db.query('reset role');
    await db.query(`create function public.fixture_fail_checkout() returns trigger language plpgsql as $$ begin if new.reason='PAY-01 pending reservation' then raise exception 'SYNTHETIC_STORAGE_FAILURE'; end if; return new; end $$;create trigger fixture_fail_checkout before insert on inventory_movements for each row execute function fixture_fail_checkout();`);await db.query('set role service_role');
    try{await assert.rejects(create(f),/SYNTHETIC_STORAGE_FAILURE/);assert.deepEqual(await counts(),before);assert.equal(await stock(f.product),5);}finally{await db.query('reset role');await db.query('drop trigger fixture_fail_checkout on inventory_movements;drop function fixture_fail_checkout()');await db.query('set role service_role');}
    assert.equal((await create(f)).state,'pending');
  });
  test('cancel releases once, repeated cancellation and replay preserve terminal state',async()=>{
    const f=await fixture(),r=await create(f);await transition(r.id,'cancelled');assert.equal(await stock(f.product),5);const before=await counts();assert.equal((await transition(r.id,'cancelled')).state,'cancelled');assert.deepEqual(await counts(),before);assert.equal((await create(f)).state,'cancelled');await assert.rejects(transition(r.id,'confirmed'),/CHECKOUT_INVALID_TRANSITION/);await assert.rejects(db.query('select apply_sale_inventory($1)',[r.id]),/CHECKOUT_NOT_CONFIRMED/);
  });
  test('expiry checks the database clock and releases once; late confirmation denied',async()=>{
    const f=await fixture(),r=await create(f);await assert.rejects(transition(r.id,'expired'),/CHECKOUT_NOT_EXPIRED/);await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[r.id]);await assert.rejects(transition(r.id,'confirmed'),/CHECKOUT_EXPIRED/);await transition(r.id,'expired');await transition(r.id,'expired');assert.equal(await stock(f.product),5);
  });
  test('confirmation rechecks expiry after waiting for a product lock',async()=>{
    const f=await fixture(),r=await create(f),locker=new Client(connection);await locker.connect();
    try{
      await locker.query('begin');await locker.query('select id from products where id=$1 for update',[f.product]);
      await db.query("update checkout_operations set expires_at=clock_timestamp()+interval '1 second' where order_id=$1",[r.id]);
      const rejected=assert.rejects(transition(r.id,'confirmed'),/CHECKOUT_EXPIRED/);
      await new Promise(resolve=>setTimeout(resolve,1100));await locker.query('commit');await rejected;
      assert.equal((await db.query('select state from checkout_operations where order_id=$1',[r.id])).rows[0].state,'pending');assert.equal(await stock(f.product),3);
      await transition(r.id,'expired');assert.equal(await stock(f.product),5);
    }finally{await locker.query('rollback');await locker.end();}
  });
  test('confirm consumes reservation once and legacy inventory RPC cannot double debit',async()=>{
    const f=await fixture(),r=await create(f);await assert.rejects(db.query('select apply_sale_inventory($1)',[r.id]),/CHECKOUT_NOT_CONFIRMED/);assert.equal(await stock(f.product),3);
    await transition(r.id,'confirmed');await transition(r.id,'confirmed');assert.equal((await db.query('select apply_sale_inventory($1) result',[r.id])).rows[0].result.status,'already_applied');assert.equal(await stock(f.product),3);await assert.rejects(transition(r.id,'cancelled'),/CHECKOUT_INVALID_TRANSITION/);
  });
  test('concurrent confirmation vs cancellation has exactly one terminal winner',async()=>{
    const f=await fixture(),r=await create(f),other=new Client(connection);await other.connect();await other.query('set role service_role');try{
      const results=await Promise.allSettled([transition(r.id,'confirmed'),other.query("select transition_checkout_atomic($1,'cancelled')",[r.id])]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/CHECKOUT_INVALID_TRANSITION/);const state=(await db.query('select state from checkout_operations where order_id=$1',[r.id])).rows[0].state;assert.equal(await stock(f.product),state==='confirmed'?3:5);
    }finally{await other.end();}
  });
  test('legacy direct edits cannot change price, lines or bypass reservation lifecycle',async()=>{
    const f=await fixture(),r=await create(f);await assert.rejects(db.query('update orders set total=1 where id=$1',[r.id]),/CHECKOUT_USE_ATOMIC_LIFECYCLE/);await assert.rejects(db.query("update orders set status='cancelled' where id=$1",[r.id]),/CHECKOUT_USE_ATOMIC_LIFECYCLE/);await assert.rejects(db.query('update order_items set quantity=1 where order_id=$1',[r.id]),/CHECKOUT_IMMUTABLE_ITEMS/);await assert.rejects(db.query("insert into order_items(order_id,product_id,product_name,product_slug,unit_price,quantity,subtotal) values($1,$2,'Forged','forged',0,1,0)",[r.id,f.product]),/CHECKOUT_IMMUTABLE_ITEMS/);
  });
  test('unconfigured shipping, anonymous identity, unsupported buyer mode and MP reject before writes',async()=>{
    const f=await fixture();await assert.rejects(create(f,{who:null}),/CHECKOUT_UNAUTHORIZED/);await assert.rejects(create(f,{request:{...f.request,paymentMethod:'mercadopago'}}),/CHECKOUT_INVALID_REQUEST/);await assert.rejects(create(f,{request:{...f.request,shipping:{method:'shipping',carrier:'Andreani',province:'Córdoba',city:'Synthetic City',postalCode:'5000',address:'Synthetic 123'}}}),/CHECKOUT_DELIVERY_NOT_CONFIGURED/);
    await db.query("update checkout_configuration set buyer_authorization='guest_capability' where id=$1",[config]);try{await assert.rejects(create(f),/CHECKOUT_AUTHORIZATION_NOT_IMPLEMENTED/);}finally{await db.query("update checkout_configuration set buyer_authorization='authenticated' where id=$1",[config]);}
  });
  async function manual(id,{key=randomUUID(),admin=randomUUID(),amount=157.25,reference='synthetic-'+randomUUID(),client=db}={}){
    return (await client.query('select confirm_checkout_manual_payment($1,$2,$3,$4,$5) result',[id,key,admin,amount,reference])).rows[0].result;
  }
  async function expire(client=db){return(await client.query('select expire_checkout_reservations(100) result')).rows[0].result;}
  test('cash uses the same single discount without legacy policy and remains pickup only',async()=>{
    const f=await fixture();f.request.paymentMethod='cash';const r=await create(f);
    assert.equal(r.total,157.25);assert.equal(r.paymentMethod,'cash');
    const shipped=await fixture();shipped.request.paymentMethod='cash';shipped.request.shipping={method:'shipping',carrier:'Synthetic Carrier'};
    await assert.rejects(create(shipped),/CHECKOUT_INVALID_SHIPPING/);
    await db.query("update checkout_configuration set cash_price_policy='list' where id=$1",[config]);
    try{const other=await fixture();other.request.paymentMethod='cash';assert.equal((await create(other)).total,157.25);}finally{await db.query('update checkout_configuration set cash_price_policy=null where id=$1',[config]);}
  });
  test('25 percent applies once to every line for both methods regardless of differentiated catalogue price',async()=>{
    for(const method of ['transfer','cash'])for(const transfer of [null,75,80,50,120]){
      const f=await fixture({price:100,transfer});f.request.paymentMethod=method;
      const second=await fixture({price:40,transfer:30});f.request.items.push({productId:second.product,quantity:3});
      const r=await create(f);assert.equal(r.subtotal,320);assert.equal(r.discount,80);assert.equal(r.total,247.25);
      const items=(await db.query('select product_id,unit_price from order_items where order_id=$1',[r.id])).rows;
      assert.equal(items.find(v=>v.product_id===f.product).unit_price,'75.00');assert.equal(items.find(v=>v.product_id===second.product).unit_price,'30.00');
    }
  });
  test('both methods reserve for 24 hours without changing expiry on retries',async()=>{
    for(const method of ['transfer','cash']){
      const f=await fixture();f.request.paymentMethod=method;const r=await create(f);
      const remaining=Number((await db.query('select extract(epoch from (expires_at-clock_timestamp())) remaining from checkout_operations where order_id=$1',[r.id])).rows[0].remaining);
      assert.ok(remaining>86390&&remaining<=86400);assert.equal((await create(f)).expiresAt,r.expiresAt);
    }
  });
  test('unapproved legacy price policy or arbitrary duration fails closed without writes',async()=>{
    for(const change of ["price_policy='current_catalog'","reservation_seconds=600"]){
      const f=await fixture(),before=await counts();await db.query('update checkout_configuration set '+change+' where id=$1',[config]);
      try{await assert.rejects(create(f),/CHECKOUT_POLICY_NOT_CONFIGURED/);assert.deepEqual(await counts(),before);assert.equal(await stock(f.product),5);}finally{await db.query("update checkout_configuration set price_policy='manual_25_frozen',reservation_seconds=86400 where id=$1",[config]);}
    }
  });
  test('price is frozen through catalogue changes, retry and manual credit',async()=>{
    const f=await fixture(),r=await create(f);await db.query('update products set price=900,transfer_price=1 where id=$1',[f.product]);
    assert.deepEqual(await create(f),r);assert.equal((await db.query('select unit_price from order_items where order_id=$1',[r.id])).rows[0].unit_price,'75.00');
    await assert.rejects(manual(r.id,{amount:1357.25}),/CHECKOUT_MANUAL_AMOUNT_MISMATCH/);await manual(r.id,{amount:r.total});
    assert.equal((await db.query('select total from orders where id=$1',[r.id])).rows[0].total,'157.25');
  });
  test('paid orders cannot expire or release stock even with a stale pending operation',async()=>{
    const f=await fixture(),r=await create(f);await manual(r.id);
    await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[r.id]);
    await expire();assert.equal(await stock(f.product),3);await assert.rejects(transition(r.id,'expired'),/CHECKOUT_INVALID_TRANSITION/);
    // Synthetic inconsistency exercises the defensive check; not a supported production mutation.
    await db.query("update checkout_operations set state='pending' where order_id=$1",[r.id]);
    try{await expire();await assert.rejects(transition(r.id,'expired'),/CHECKOUT_PAID_RESERVATION_PROTECTED/);await assert.rejects(transition(r.id,'cancelled'),/CHECKOUT_PAID_RESERVATION_PROTECTED/);assert.equal(await stock(f.product),3);}finally{await db.query("update checkout_operations set state='confirmed' where order_id=$1",[r.id]);}
    assert.equal((await db.query("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='release'",[r.id])).rows[0].n,0);
  });
  test('shipping fails atomically without valid carrier, fee and coverage configuration',async()=>{
    for(const option of [{method:'shipping',carrier:'Synthetic Carrier',fee:10},{method:'shipping',carrier:'Synthetic Carrier',fee:-1,allowedDestinations:[]},{method:'shipping',carrier:'Synthetic Carrier',allowedDestinations:[{province:'Córdoba',city:'S',postalCode:'S'}]},{method:'shipping',carrier:'',fee:10,allowedDestinations:[{province:'Córdoba',city:'S',postalCode:'S'}]}]){
      await db.query('update checkout_configuration set delivery_options=$1 where id=$2',[JSON.stringify([option]),config]);
      const f=await fixture();f.request.shipping={method:'shipping',carrier:option.carrier,province:'Córdoba',city:'S',postalCode:'S',address:'Synthetic'};const before=await counts();
      try{await assert.rejects(create(f),/CHECKOUT_DELIVERY_NOT_CONFIGURED/);assert.deepEqual(await counts(),before);assert.equal(await stock(f.product),5);}finally{await db.query('update checkout_configuration set delivery_options=$1 where id=$2',[JSON.stringify([{method:'pickup',fee:7.25}]),config]);}
    }
  });
  test('manual transfer is atomic, auditable, idempotent and payment paid is independent of confirmed',async()=>{
    const f=await fixture(),r=await create(f),input={key:randomUUID(),admin:randomUUID(),reference:'synthetic-transfer-'+randomUUID()};
    assert.equal((await db.query('select payment_status from orders where id=$1',[r.id])).rows[0].payment_status,'pending');
    const payment=await manual(r.id,input);assert.equal(payment.payment_status,'paid');assert.equal(payment.checkout_state,'confirmed');assert.equal(payment.verified_by,input.admin);assert.equal(await stock(f.product),3);
    const ledger=(await db.query('select method,amount,status from order_payments where order_id=$1',[r.id])).rows;assert.deepEqual(ledger,[{method:'transfer',amount:'157.25',status:'approved'}]);
    assert.deepEqual(await manual(r.id,input),payment);assert.equal((await db.query('select count(*)::int n from order_payments where order_id=$1',[r.id])).rows[0].n,1);
    await assert.rejects(manual(r.id),/CHECKOUT_MANUAL_ALREADY_RECORDED/);assert.equal((await db.query('select admin_id,external_reference from checkout_manual_payments where order_id=$1',[r.id])).rows[0].admin_id,input.admin);
    assert.equal((await db.query('select apply_sale_inventory($1) result',[r.id])).rows[0].result.status,'already_applied');
  });
  test('cash is accredited manually on pickup without generating any automatic payment',async()=>{
    await db.query("update checkout_configuration set cash_price_policy='transfer' where id=$1",[config]);
    try{const f=await fixture();f.request.paymentMethod='cash';const r=await create(f);const payment=await manual(r.id,{reference:''});assert.equal(payment.payment_status,'paid');assert.equal((await db.query('select method from order_payments where order_id=$1',[r.id])).rows[0].method,'cash');assert.equal(await stock(f.product),3);}finally{await db.query('update checkout_configuration set cash_price_policy=null where id=$1',[config]);}
  });
  test('null admin, incorrect amount, missing transfer reference and expired reservation cannot be credited',async()=>{
    const f=await fixture(),r=await create(f);for(const [input,code] of [[{admin:null},'UNAUTHORIZED'],[{amount:1},'AMOUNT_MISMATCH'],[{reference:''},'REFERENCE_REQUIRED']])await assert.rejects(manual(r.id,input),new RegExp('CHECKOUT_MANUAL_'+code));
    await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[r.id]);await assert.rejects(manual(r.id),/CHECKOUT_EXPIRED/);assert.equal((await db.query('select count(*)::int n from checkout_manual_payments where order_id=$1',[r.id])).rows[0].n,0);assert.equal(await stock(f.product),3);await expire();assert.equal(await stock(f.product),5);
  });
  test('confirmed reservation alone does not credit payment and legacy direct payment writes are blocked',async()=>{
    const f=await fixture(),r=await create(f);await transition(r.id,'confirmed');assert.equal((await db.query('select payment_status from orders where id=$1',[r.id])).rows[0].payment_status,'pending');
    await assert.rejects(db.query("update orders set payment_status='paid' where id=$1",[r.id]),/CHECKOUT_MANUAL_PAYMENT_REQUIRED/);await assert.rejects(db.query("select record_order_payment($1,'transfer',157.25)",[r.id]),/CHECKOUT_MANUAL_PAYMENT_REQUIRED/);
  });
  test('concurrent manual credits record exactly one payment and preserve stock',async()=>{
    const f=await fixture(),r=await create(f),input={key:randomUUID(),admin:randomUUID(),reference:'synthetic-'+randomUUID()},other=new Client(connection);await other.connect();await other.query('set role service_role');
    try{const [a,b]=await Promise.all([manual(r.id,input),manual(r.id,{...input,client:other})]);assert.equal(a.payment_id,b.payment_id);assert.equal(await stock(f.product),3);assert.equal((await db.query('select count(*)::int n from order_payments where order_id=$1',[r.id])).rows[0].n,1);}finally{await other.end();}
  });
  test('same transfer reference cannot credit a second order and leaves its reservation pending',async()=>{
    const first=await fixture(),a=await create(first),second=await fixture(),b=await create(second),reference='synthetic-bank-'+randomUUID();await manual(a.id,{reference});
    await assert.rejects(manual(b.id,{reference}),e=>e.code==='23505');assert.equal((await db.query('select state from checkout_operations where order_id=$1',[b.id])).rows[0].state,'pending');assert.equal((await db.query('select count(*)::int n from order_payments where order_id=$1',[b.id])).rows[0].n,0);assert.equal(await stock(second.product),3);
  });
  test('expired manual credit racing expiry never records a payment or leaks stock',async()=>{
    const f=await fixture(),r=await create(f);await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[r.id]);const other=new Client(connection);await other.connect();await other.query('set role service_role');
    try{const denied=assert.rejects(manual(r.id,{client:other}),/CHECKOUT_(EXPIRED|INVALID_TRANSITION)/);const first=await expire();await denied;const retry=await expire();assert.equal(first.released+retry.released,1);assert.ok(first.failures.length===0&&retry.failures.length===0);assert.equal(await stock(f.product),5);assert.equal((await db.query('select count(*)::int n from order_payments where order_id=$1',[r.id])).rows[0].n,0);assert.equal((await db.query("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='release'",[r.id])).rows[0].n,1);}finally{await other.end();}
  });
  test('failure while inserting the ledger rolls back receipt, state and reservation conversion',async()=>{
    const f=await fixture(),r=await create(f);await db.query('reset role');await db.query(`create function public.fixture_fail_manual() returns trigger language plpgsql as $$ begin if new.reference like 'manual-checkout:%' then raise exception 'SYNTHETIC_LEDGER_FAILURE'; end if;return new;end $$;create trigger fixture_fail_manual before insert on order_payments for each row execute function fixture_fail_manual();`);await db.query('set role service_role');
    try{await assert.rejects(manual(r.id),/SYNTHETIC_LEDGER_FAILURE/);assert.equal((await db.query('select state from checkout_operations where order_id=$1',[r.id])).rows[0].state,'pending');assert.equal((await db.query('select count(*)::int n from checkout_manual_payments where order_id=$1',[r.id])).rows[0].n,0);assert.equal(await stock(f.product),3);assert.equal((await db.query("select movement_type from inventory_movements where order_id=$1",[r.id])).rows[0].movement_type,'reservation');}
    finally{await db.query('reset role');await db.query('drop trigger fixture_fail_manual on order_payments;drop function fixture_fail_manual()');await db.query('set role service_role');}
    assert.equal((await manual(r.id)).payment_status,'paid');
  });
  test('single-run expiry skips unexpired/confirmed and concurrent runs release a reservation exactly once',async()=>{
    const f=await fixture(),r=await create(f),fresh=await fixture(),freshOrder=await create(fresh);await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[r.id]);
    const other=new Client(connection);await other.connect();await other.query('set role service_role');try{const results=await Promise.all([expire(),expire(other)]);assert.equal(results.reduce((n,r)=>n+r.released,0),1);assert.ok(results.every(r=>r.failures.length===0));assert.equal(await stock(f.product),5);assert.equal((await expire()).released,0);assert.equal((await db.query('select state from checkout_operations where order_id=$1',[freshOrder.id])).rows[0].state,'pending');}finally{await other.end();}
  });
  test('expiry failure is reported without releasing partial stock and can be retried safely',async()=>{
    const f=await fixture(),r=await create(f);await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[r.id]);await db.query('reset role');await db.query(`create function public.fixture_fail_release() returns trigger language plpgsql as $$ begin if new.movement_type='release' then raise exception 'SYNTHETIC_RELEASE_FAILURE'; end if;return new;end $$;create trigger fixture_fail_release before insert on inventory_movements for each row execute function fixture_fail_release();`);await db.query('set role service_role');
    try{const result=await expire();assert.equal(result.released,0);assert.equal(result.failures.length,1);assert.equal(result.failures[0].orderId,r.id);assert.equal(await stock(f.product),3);assert.equal((await db.query('select state from checkout_operations where order_id=$1',[r.id])).rows[0].state,'pending');}
    finally{await db.query('reset role');await db.query('drop trigger fixture_fail_release on inventory_movements;drop function fixture_fail_release()');await db.query('set role service_role');}assert.equal((await expire()).released,1);assert.equal(await stock(f.product),5);
  });

  const nationalDestination={province:'Córdoba',city:'Synthetic City',postalCode:'FIXTURE'};
  async function withNationalRates(rates,fn){
    await db.query('update checkout_configuration set delivery_options=$1 where id=$2',[JSON.stringify([{method:'pickup',fee:7.25},{method:'shipping',country:'AR',enabled:true,carrier:'Andreani',destinationRates:rates}]),config]);
    try{await fn();}finally{await db.query('update checkout_configuration set delivery_options=$1 where id=$2',[JSON.stringify([{method:'pickup',fee:7.25}]),config]);}
  }
  async function shippingQuote(destination=nationalDestination){return(await db.query('select get_checkout_shipping_quote($1,$2) result',[buyer,destination])).rows[0].result;}
  test('national destination rates come only from server and freeze in the order without discounting shipping',async()=>{
    await withNationalRates([{...nationalDestination,fee:12.5,enabled:true}],async()=>{
      const quote=await shippingQuote();assert.equal(quote.status,'available');assert.equal(quote.rates[0].fee,12.5);
      const f=await fixture({transfer:75});f.request.shipping={method:'shipping',...nationalDestination,address:'Synthetic Address',...quote.rates[0]};delete f.request.shipping.fee;
      const r=await create(f);assert.equal(r.total,162.5);assert.equal(r.discount,50);assert.equal(r.shippingCost,12.5);
      await db.query('update checkout_configuration set delivery_options=$1 where id=$2',[JSON.stringify([{method:'shipping',country:'AR',enabled:true,carrier:'Andreani',destinationRates:[{...nationalDestination,fee:99,enabled:true}]}]),config]);
      assert.deepEqual(await create(f),r);await manual(r.id,{amount:r.total});assert.equal(await stock(f.product),3);
    });
  });
  test('national province, locality and postal code variations return independently configured costs',async()=>{
    await withNationalRates([{province:'Córdoba',city:'Synthetic City',postalCode:'FIXTURE',fee:10,enabled:true},{province:'Buenos Aires',fee:20,enabled:true},{province:'Córdoba',city:'Other City',fee:30,enabled:true}],async()=>{
      assert.equal((await shippingQuote()).rates[0].fee,10);
      assert.equal((await shippingQuote({province:'Buenos Aires',city:'Other',postalCode:'1234'})).rates[0].fee,20);
      assert.equal((await shippingQuote({province:'Córdoba',city:'Other City',postalCode:'OTHER'})).rates[0].fee,30);
      assert.equal((await shippingQuote({province:'Tierra del Fuego',city:'Synthetic',postalCode:'9410'})).status,'quotation_required');
      await assert.rejects(shippingQuote({province:'Outside Argentina',city:'Synthetic',postalCode:'1234'}),/CHECKOUT_INVALID_DESTINATION/);
    });
  });
  test('missing, disabled, negative, overprecision, expired and malformed rates permit quotation but never an unknown order total',async()=>{
    for(const invalid of [{fee:null},{fee:-1},{fee:1.001},{fee:10,enabled:false},{fee:10,validUntil:'2000-01-01T00:00:00Z'},{fee:10,validUntil:'invalid'},{fee:999999999999}])await withNationalRates([{...nationalDestination,enabled:true,...invalid}],async()=>{
      assert.equal((await shippingQuote()).status,'quotation_required');
      const f=await fixture();f.request.shipping={method:'shipping',...nationalDestination,address:'Synthetic'};const before=await counts();
      await assert.rejects(create(f),/CHECKOUT_SHIPPING_QUOTE_REQUIRED/);assert.deepEqual(await counts(),before);assert.equal(await stock(f.product),5);
    });
  });
  test('changed or forged quote keys require recalculation before creating or reserving',async()=>{
    await withNationalRates([{...nationalDestination,fee:10,enabled:true}],async()=>{
      const quote=(await shippingQuote()).rates[0],f=await fixture();f.request.shipping={method:'shipping',...nationalDestination,address:'Synthetic',carrier:quote.carrier,quoteKey:quote.quoteKey};
      await db.query('update checkout_configuration set approved_revision=$1 where id=$2',['SYNTHETIC-CHANGED',config]);
      try{const before=await counts();await assert.rejects(create(f),/CHECKOUT_SHIPPING_QUOTE_CHANGED/);assert.deepEqual(await counts(),before);f.request.shipping.quoteKey='f'.repeat(64);await assert.rejects(create(f),/CHECKOUT_SHIPPING_QUOTE_CHANGED/);}finally{await db.query('update checkout_configuration set approved_revision=$1 where id=$2',['synthetic-test-only',config]);}
    });
  });
  test('quotation request is private and idempotent and creates no order, customer, inventory movement or reservation',async()=>{
    await withNationalRates([],async()=>{
      const f=await fixture();delete f.request.customer.email;f.request.shipping={method:'shipping',...nationalDestination,address:'Synthetic'};
      const before=await counts(),a=(await db.query('select request_checkout_shipping_quote($1,$2,$3) result',[buyer,f.key,f.request])).rows[0].result;
      const repeat=(await db.query('select request_checkout_shipping_quote($1,$2,$3) result',[buyer,f.key,f.request])).rows[0].result;
      assert.deepEqual(a,repeat);assert.equal(a.createsOrder,false);assert.equal(a.status,'requested');assert.deepEqual(await counts(),before);assert.equal(await stock(f.product),5);
      f.request.customer.phone='changed';await assert.rejects(db.query('select request_checkout_shipping_quote($1,$2,$3)',[buyer,f.key,f.request]),/CHECKOUT_IDEMPOTENCY_CONFLICT/);
      const unrelated=(await db.query('select request_checkout_shipping_quote($1,$2,$3) result',[randomUUID(),f.key,f.request])).rows[0].result;assert.notEqual(unrelated.id,a.id);
      await assert.rejects(db.query('select request_checkout_shipping_quote($1,$2,$3)',[buyer,randomUUID(),{...f.request,total:0}]),/CHECKOUT_INVALID_REQUEST/);
    });
  });
  test('guest order requires no registration email or password and keeps identity-bound ownership',async()=>{
    const f=await fixture();delete f.request.customer.email;const r=await create(f);
    assert.equal((await db.query('select email from customers c join orders o on o.customer_id=c.id where o.id=$1',[r.id])).rows[0].email,null);
    assert.equal((await db.query('select buyer_id from checkout_operations where order_id=$1',[r.id])).rows[0].buyer_id,buyer);
  });
  test('public SQL roles cannot read guest quotations or call shipping RPCs',async()=>{
    const checks=await db.query(readFileSync(join(root,'reports/pay01-guest-shipping-read-only.sql'),'utf8'));
    assert.equal(checks[1].rows[0].relrowsecurity,true);
    for(const row of checks[2].rows){assert.equal(row.can_select,row.role_name==='service_role');assert.equal(row.can_insert,row.role_name==='service_role');assert.equal(row.can_delete,false);}
    assert.equal(checks[3].rows.length,2);for(const row of checks[3].rows){assert.equal(row.prosecdef,false);assert.equal(row.anon_execute,false);assert.equal(row.authenticated_execute,false);assert.equal(row.service_execute,true);assert.ok(row.proconfig.some(setting=>setting.startsWith('search_path=')));}
    for(const role of ['anon','authenticated']){
      await db.query('reset role;set role '+role);
      try{for(const query of ['select * from checkout_shipping_quote_requests','insert into checkout_shipping_quote_requests default values','select get_checkout_shipping_quote(null,null)','select request_checkout_shipping_quote(null,null,null)'])await assert.rejects(db.query(query),e=>e.code==='42501');}finally{await db.query('reset role;set role service_role');}
    }
  });
  for(const role of ['anon','authenticated'])test(`${role}: SEC-01 still denies direct orders, checkout state/configuration and all new RPCs`,async()=>{
    await db.query(`reset role;set role ${role}`);
    try{for(const query of ['select * from checkout_configuration','select * from checkout_operations','insert into orders default values','update products set stock=0','select create_checkout_atomic(null,null,null)','select transition_checkout_atomic(null,null)','select guard_checkout_order()','select * from checkout_manual_payments','insert into checkout_manual_payments default values','select confirm_checkout_manual_payment(null,null,null,null,null)','select expire_checkout_reservations(100)'])await assert.rejects(db.query(query),e=>e.code==='42501');}finally{await db.query('reset role;set role service_role');}
  });
});
