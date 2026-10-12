import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Explicit local-only opt-in. Keeps fixtures and evidence; no resets/migrations/cleanup.
// Direct fixture writes change only expires_at while an order is pending.
test('real local reservation expiry: authorization, exactly-once, locks, concurrency and rollback', {
  skip:process.env.SFSTORE_REAL_LOCAL_EXPIRY!=='true',timeout:180000,
},async t=>{
  const base='http://127.0.0.1:3107',url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.ok(['http://127.0.0.1:54331','http://localhost:54331'].includes(url));
  const email='admin@staging.invalid',product=randomUUID();
  assert.ok(process.env.ADMIN_ALLOWED_EMAILS.split(',').map(x=>x.trim()).includes(email));
  const connection={host:'127.0.0.1',port:54332,user:'postgres',password:process.env.SFSTORE_TEST_PG_PASSWORD,database:'postgres'};
  const db=new Client(connection);await db.connect();
  const evidence={purpose:'local_synthetic_reservation_expiry',branch:'codex/integration-sec01-pay01-storage-20261011',startedAt:new Date().toISOString(),fixtures:[],checks:[]};
  let failed=false;
  const check=async(name,fn)=>{assert.equal(failed,false,'Stop after failed dependent scenario');return t.test(name,async()=>{try{const detail=await fn();evidence.checks.push({name,status:'PASS',...detail});}catch(error){failed=true;evidence.checks.push({name,status:'FAIL'});throw error;}});};
  const stock=async(client=db)=>(await client.query('select stock from products where id=$1',[product])).rows[0].stock;
  const snapshot=async(id,client=db)=>(await client.query(`select c.state,o.status,o.payment_status,c.expires_at,(select count(*)::int from inventory_movements where order_id=c.order_id and movement_type='release') releases,(select coalesce(sum(quantity),0)::int from inventory_movements where order_id=c.order_id and movement_type='release') released_quantity from checkout_operations c join orders o on o.id=c.order_id where c.order_id=$1`,[id])).rows[0];
  const past=async(id)=>{const r=await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1 and state='pending' returning order_id",[id]);assert.equal(r.rowCount,1);};
  const serviceConnection=async()=>{const c=new Client(connection);await c.connect();await c.query('set role service_role');await c.query("set statement_timeout='5s'");return c;};
  const expire=async c=>(await c.query('select expire_checkout_reservations(100) result')).rows[0].result;
  let browser,adminPage,adminContext,publicContext,guest,paid,vigente;
  try{
    assert.equal((await db.query('select id from sfstore_staging.identity')).rows[0].id,'SFSTORE_SYNTHETIC_STAGING');
    assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,26);
    await db.query("insert into products(id,category_id,name,slug,short_description,price,transfer_price,stock,status) values($1,'11111111-1111-4111-8111-111111111111','Synthetic Expiry Regression',$2,'Synthetic local only',100,75,30,'active')",[product,'synthetic-expiry-'+product]);
    // The unfiltered admin mechanism must never touch unrelated business rows.
    const unsafe=(await db.query(`select count(*)::int n from orders o where not exists(select 1 from checkout_operations c where c.order_id=o.id) or not exists(select 1 from order_items i where i.order_id=o.id) or exists(select 1 from order_items i join products p on p.id=i.product_id where i.order_id=o.id and p.slug<>'staging-synthetic-product' and p.slug not like 'synthetic-%')`)).rows[0].n;assert.equal(unsafe,0);
    assert.equal((await db.query("select count(*)::int n from checkout_operations where state='pending' and expires_at<=clock_timestamp() and not exists(select 1 from checkout_payment_reports r where r.order_id=checkout_operations.order_id and r.status='pending')")).rows[0].n,0,'Review preexisting overdue fixtures before running');
    const adminId=(await db.query('select id from auth.users where email=$1 and not is_anonymous',[email])).rows[0]?.id;assert.ok(adminId);
    evidence.initialStock=await stock();assert.ok(evidence.initialStock>=6);
    const privileged=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    // Real local Auth verification for the already existing synthetic administrator.
    const jar=[],auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>jar,setAll:values=>{for(const v of values){const i=jar.findIndex(c=>c.name===v.name);if(i>=0)jar.splice(i,1);jar.push(v);}}}});
    const link=await privileged.auth.admin.generateLink({type:'magiclink',email});assert.equal(link.error,null);
    const verified=await auth.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});assert.equal(verified.error,null);
    const actor=await auth.auth.getUser();assert.equal(actor.error,null);assert.equal(actor.data.user.id,adminId);assert.equal(actor.data.user.is_anonymous,false);
    const {chromium}=createRequire(import.meta.url)(process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,channel:'msedge'});
    adminContext=await browser.newContext();await adminContext.addCookies(jar.map(c=>({name:c.name,value:c.value,url:base,httpOnly:true,sameSite:'Lax'})));
    adminPage=await adminContext.newPage();await adminPage.goto(base+'/admin/checkout');await adminPage.getByRole('heading',{name:'Pedidos web y pagos manuales'}).waitFor();
    publicContext=await browser.newContext();
    guest=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed=await guest.auth.signInAnonymously({options:{captchaToken:'XXXX.DUMMY.TOKEN.XXXX'}});assert.equal(signed.error,null);
    const create=async(label)=>{
      const session=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const signup=await session.auth.signInAnonymously({options:{captchaToken:'XXXX.DUMMY.TOKEN.XXXX'}});assert.equal(signup.error,null);const buyer=signup.data.user.id;
      const r=await privileged.rpc('create_checkout_atomic',{p_buyer_id:buyer,p_operation_key:randomUUID(),p_request:{customer:{fullName:'Synthetic Expiry '+label,phone:'synthetic-phone'},shipping:{method:'pickup'},paymentMethod:'transfer',items:[{productId:product,quantity:2}]}});
      assert.equal(r.error,null);assert.equal(r.data.total,150);evidence.fixtures.push({label,orderId:r.data.id,quantity:2});return r.data;
    };
    vigente=await create('vigente');paid=await create('paid');
    let capturedAction;
    const action=async()=>{
      if(!capturedAction){
        // Capture one real UI invocation after scripts settle. Replays use the
        // same authorized Server Action, with a stable APIResponse body.
        await adminPage.reload();await adminPage.waitForLoadState('networkidle');
        const reply=adminPage.waitForResponse(r=>r.url()===base+'/admin/checkout'&&r.request().method()==='POST');
        await adminPage.getByRole('button',{name:'Liberar reservas vencidas (hasta 100)',exact:true}).click();
        const r=await reply;assert.equal(r.status(),200);capturedAction={request:r.request(),headers:await r.request().allHeaders(),body:r.request().postDataBuffer()};
      }
      const r=await adminContext.request.post(base+'/admin/checkout',{headers:capturedAction.headers,data:capturedAction.body});assert.equal(r.status(),200);
      const text=await r.text(),match=text.match(/Reservas liberadas: (\d+)\. Fallos pendientes: (\d+)\./);assert.ok(match,'Release action must return bounded result');
      return{released:Number(match[1]),failures:Number(match[2]),request:capturedAction.request};
    };
    let replay;
    await check('live grants/RLS and verified admin action do not release current reservations',async()=>{
      const grants=(await db.query(`select has_function_privilege('anon','public.expire_checkout_reservations(integer)','EXECUTE') anon,has_function_privilege('authenticated','public.expire_checkout_reservations(integer)','EXECUTE') authenticated,has_function_privilege('service_role','public.expire_checkout_reservations(integer)','EXECUTE') service,(select relrowsecurity from pg_class where oid='public.checkout_operations'::regclass) rls`)).rows[0];assert.deepEqual(grants,{anon:false,authenticated:false,service:true,rls:true});
      const before=await stock(),r=await action();assert.equal(r.released,0);assert.equal(r.failures,0);assert.equal(await stock(),before);assert.equal((await snapshot(vigente.id)).state,'pending');
      replay={headers:await r.request.allHeaders(),body:r.request.postDataBuffer()};return{beforeStock:before,afterStock:await stock(),released:0};
    });
    await check('public/guest RPC and unauthenticated Server Action cannot release stock',async()=>{
      for(const client of [createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}}),guest]){const r=await client.rpc('expire_checkout_reservations',{p_limit:100});assert.ok(r.error);}
      const headers={'content-type':replay.headers['content-type'],origin:base,...(replay.headers['next-action']?{'next-action':replay.headers['next-action']}: {})};
      const r=await publicContext.request.post(base+'/admin/checkout',{headers,data:replay.body});assert.ok((await r.text()).includes('No se pudieron liberar reservas.'));
      for(const role of ['anon','authenticated']){const c=new Client(connection);await c.connect();try{await c.query('set role '+role);await assert.rejects(c.query('select expire_checkout_reservations(100)'),e=>e.code==='42501');}finally{await c.end();}}
      return{deniedRoles:['anon','authenticated'],actionDenied:true};
    });
    await check('paid order remains protected after its pending-only timestamp reaches expiry',async()=>{
      // Timestamp is shortened before payment; no direct paid-order writes.
      assert.equal((await db.query("update checkout_operations set expires_at=clock_timestamp()+interval '8 seconds' where order_id=$1 and state='pending' returning order_id",[paid.id])).rowCount,1);
      await adminPage.reload();const article=adminPage.locator('article').filter({has:adminPage.getByRole('heading',{name:paid.orderNumber,exact:true})});
      await article.getByLabel('Importe recibido completo').fill('150');await article.getByLabel('Referencia del cobro').fill('synthetic-expiry-paid-'+randomUUID());await article.getByRole('checkbox').check();
      const reply=adminPage.waitForResponse(r=>r.url()===base+'/admin/checkout'&&r.request().method()==='POST');await article.getByRole('button',{name:'Acreditar pago manual',exact:true}).click();assert.equal((await reply).status(),200);
      assert.equal((await snapshot(paid.id)).payment_status,'paid');
      const deadline=Date.now()+12000;while(Date.now()<deadline){if(Date.now()>new Date((await snapshot(paid.id)).expires_at).getTime())break;await new Promise(r=>setTimeout(r,250));}
      assert.ok(Date.now()>new Date((await snapshot(paid.id)).expires_at).getTime());const before=await stock();const r=await action();assert.equal(r.released,0);assert.equal(r.failures,0);assert.equal(await stock(),before);
      const c=await serviceConnection();try{await assert.rejects(c.query("select transition_checkout_atomic($1,'expired')",[paid.id]),e=>e.message==='CHECKOUT_INVALID_TRANSITION');}finally{await c.end();}
      assert.equal((await snapshot(paid.id)).releases,0);return{beforeStock:before,afterStock:await stock(),paidState:await snapshot(paid.id)};
    });
    await check('expired pending order releases exactly two units through admin action; replay is idempotent',async()=>{
      const order=await create('expired');await past(order.id);const before=await stock();const first=await action();assert.equal(first.released,1);assert.equal(first.failures,0);assert.equal(await stock(),before+2);
      const saved=await snapshot(order.id);assert.equal(saved.state,'expired');assert.equal(saved.status,'cancelled');assert.equal(saved.releases,1);assert.equal(saved.released_quantity,2);
      const again=await action();assert.equal(again.released,0);assert.equal(again.failures,0);assert.equal(await stock(),before+2);
      return{orderId:order.id,beforeStock:before,afterStock:await stock(),releaseMovements:1,replayReleased:0};
    });
    await check('locked order is skipped promptly and next authorized release restores stock once',async()=>{
      const order=await create('locked');await past(order.id);const lock=await serviceConnection();const before=await stock();
      try{await lock.query('begin');await lock.query('select id from orders where id=$1 for update',[order.id]);const start=Date.now();const r=await action();assert.equal(r.released,0);assert.equal(r.failures,0);assert.ok(Date.now()-start<3000);assert.equal(await stock(),before);assert.equal((await snapshot(order.id)).state,'pending');}
      finally{await lock.query('rollback');await lock.end();}
      const r=await action();assert.equal(r.released,1);assert.equal(await stock(),before+2);assert.equal((await action()).released,0);assert.equal((await snapshot(order.id)).releases,1);
      return{orderId:order.id,beforeStock:before,afterStock:await stock(),releaseMovements:1};
    });
    await check('outer transaction rollback removes stock restitution, release evidence and state change',async()=>{
      const order=await create('rollback');await past(order.id);const before=await stock(),c=await serviceConnection();
      try{await c.query('begin');const r=await expire(c);assert.equal(r.released,1);assert.equal(r.failures.length,0);assert.equal(await stock(c),before+2);assert.equal((await snapshot(order.id,c)).state,'expired');assert.equal((await snapshot(order.id,c)).releases,1);
        assert.equal(await stock(),before);await c.query('rollback');assert.equal(await stock(),before);assert.equal((await snapshot(order.id)).state,'pending');assert.equal((await snapshot(order.id)).releases,0);
      }finally{await c.query('rollback');await c.end();}
      evidence.rollbackOrder=order.id;return{orderId:order.id,beforeStock:before,afterStock:await stock(),committedReleaseMovements:0};
    });
    await check('two concurrent expiry workers restore the same reservation exactly once',async()=>{
      const before=await stock(),a=await serviceConnection(),b=await serviceConnection();let results;
      try{results=await Promise.all([expire(a),expire(b)]);}finally{await a.end();await b.end();}
      assert.equal(results.reduce((n,r)=>n+r.released,0),1);assert.equal(results.reduce((n,r)=>n+r.failures.length,0),0);assert.equal(await stock(),before+2);assert.equal((await snapshot(evidence.rollbackOrder)).releases,1);
      assert.equal((await action()).released,0);return{orderId:evidence.rollbackOrder,beforeStock:before,afterStock:await stock(),workers:results};
    });
    await check('product lock timeout is reported safely with per-order rollback; retry succeeds once',async()=>{
      const order=await create('product-lock');await past(order.id);const before=await stock(),lock=await serviceConnection(),worker=await serviceConnection();let result;
      try{await lock.query('begin');await lock.query('select id from products where id=$1 for update',[product]);await worker.query('begin');await worker.query("set local lock_timeout='200ms'");result=await expire(worker);await worker.query('commit');assert.equal(result.released,0);assert.equal(result.failures.length,1);assert.equal(result.failures[0].orderId,order.id);assert.equal(result.failures[0].code,'CHECKOUT_EXPIRATION_FAILED');assert.equal(await stock(),before);assert.equal((await snapshot(order.id)).state,'pending');assert.equal((await snapshot(order.id)).releases,0);}
      finally{await worker.query('rollback');await worker.end();await lock.query('rollback');await lock.end();}
      assert.equal((await action()).released,1);assert.equal(await stock(),before+2);assert.equal((await action()).released,0);assert.equal((await snapshot(order.id)).releases,1);
      return{orderId:order.id,beforeStock:before,afterStock:await stock(),controlledFailure:result};
    });
    await check('final repeated executions preserve paid order and all current reservations',async()=>{
      const before=await stock();for(let i=0;i<3;i++){const r=await action();assert.equal(r.released,0);assert.equal(r.failures,0);}
      assert.equal(await stock(),before);assert.equal((await snapshot(vigente.id)).state,'pending');assert.equal((await snapshot(vigente.id)).releases,0);assert.equal((await snapshot(paid.id)).payment_status,'paid');assert.equal((await snapshot(paid.id)).releases,0);
      assert.equal(await stock(),evidence.initialStock-4);return{beforeStock:before,afterStock:await stock(),paidReleaseMovements:0,currentReleaseMovements:0};
    });
  }finally{
    if(browser)await browser.close();evidence.finishedAt=new Date().toISOString();
    evidence.finalStock=await stock();for(const f of evidence.fixtures)f.final=await snapshot(f.orderId);
    writeFileSync(new URL('../reports/reservation-expiry-local-evidence-20261012.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');await db.end();
  }
});
