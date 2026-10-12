import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
// Explicit real-local opt-in. Never installs cron, deletes data or contacts remote Supabase.
test('private expiration executor with real local Supabase', {skip:process.env.SFSTORE_REAL_LOCAL_EXECUTOR!=='true',timeout:120000}, async t=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 assert.equal(url,'http://127.0.0.1:54331');
 const connection={host:'127.0.0.1',port:54332,user:'postgres',password:process.env.SFSTORE_TEST_PG_PASSWORD,database:'postgres'};
 const db=new Client(connection);await db.connect();const clients=[],temporaryRoles=[];
 const q=async(sql,args=[],c=db)=>(await c.query(sql,args)).rows;
 const svc=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(name,args)=>{const r=await svc.rpc(name,args);assert.equal(r.error,null,r.error?.code);return r.data;};
 const worker=async()=>{const c=new Client(connection);await c.connect();await c.query('set role sfstore_reservation_executor');clients.push(c);return c;};
 const isolatedWorker=async()=>{
  // PostgreSQL's managed postgres role cannot SET SESSION AUTHORIZATION.
  // A fresh local-only login proves escalation resistance without a privileged session_user.
  const name='synthetic_expiry_audit_'+randomUUID().replaceAll('-','');const password=randomUUID()+randomUUID();
  await db.query('create role '+name+" login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '"+password+"'");temporaryRoles.push(name);
  await db.query('grant sfstore_reservation_executor to '+name);
  const c=new Client({...connection,user:name,password});await c.connect();clients.push(c);await c.query('set role sfstore_reservation_executor');return{c,name};
 };
 const run=async(c,id=randomUUID(),limit=100)=>(await q('select sfstore_maintenance.run_checkout_expiration($1,$2) result',[id,limit],c))[0].result;
 const stock=async(p)=>Number((await q('select stock from products where id=$1',[p]))[0].stock);
 const releases=async(o)=>Number((await q("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='release'",[o]))[0].n);
 const expire=async(o)=>{assert.equal((await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1 and state='pending'",[o])).rowCount,1);};
 const fixture=async()=>{
  const p=randomUUID();await db.query("insert into products(id,category_id,name,slug,short_description,price,transfer_price,stock,status) values($1,'11111111-1111-4111-8111-111111111111','SYNTHETIC EXPIRATION EXECUTOR',$2,'Synthetic local fixture',100,75,4,'active')",[p,'synthetic-executor-'+p]);
  const guest=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await guest.auth.signInAnonymously({options:{captchaToken:'XXXX.DUMMY.TOKEN.XXXX'}});assert.equal(signed.error,null,signed.error?.code);
  const buyer=signed.data.user.id;const order=await rpc('create_checkout_atomic',{p_buyer_id:buyer,p_operation_key:randomUUID(),p_request:{customer:{fullName:'Synthetic Executor Buyer',phone:'synthetic-only'},shipping:{method:'pickup'},paymentMethod:'transfer',items:[{productId:p,quantity:2}]}});return{p,order,buyer,guest};
 };
 let live,paid,reported;const a=await worker(),b=await worker();
 try {
  assert.equal((await q('select id from sfstore_staging.identity'))[0].id,'SFSTORE_SYNTHETIC_STAGING');
  assert.equal((await q('select count(*)::int n from supabase_migrations.schema_migrations'))[0].n,29);
  assert.equal((await q("select count(*)::int n from orders o where exists(select 1 from order_items i join products p on p.id=i.product_id where i.order_id=o.id and p.slug<>'staging-synthetic-product' and p.slug not like 'synthetic-%')"))[0].n,0);
  await t.test('capability is NOLOGIN, no table writes/payment RPC; public/guest monitoring denied',async()=>{
   const role=(await q("select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls from pg_roles where rolname='sfstore_reservation_executor'"))[0];assert.ok(Object.values(role).every(v=>v===false));
   for(const table of ['orders','products','checkout_operations','checkout_manual_payments'])assert.equal((await q('select has_table_privilege(current_user,$1,\'INSERT,UPDATE,DELETE,TRUNCATE\') allowed',['public.'+table],a))[0].allowed,false);
   assert.equal((await q("select has_function_privilege(current_user,'public.confirm_checkout_manual_payment(uuid,uuid,uuid,numeric,text)','EXECUTE') allowed",[],a))[0].allowed,false);
   assert.equal((await q("select has_function_privilege(current_user,'public.expire_checkout_reservations(integer)','EXECUTE') allowed",[],a))[0].allowed,false);
   for(const role of ['anon','authenticated','service_role'])assert.equal((await q("select has_function_privilege($1,'sfstore_maintenance.run_checkout_expiration(uuid,integer)','EXECUTE') allowed",[role]))[0].allowed,false);
   const anon=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});assert.ok((await anon.rpc('get_checkout_expiration_health')).error);
   assert.equal((await rpc('get_checkout_expiration_health')).monitoringEnabled,false);
  });
  await t.test('effective executor identity cannot escalate, access private data, rewrite functions or invoke arbitrary mutations',async()=>{
   const {c,name}=await isolatedWorker();
   assert.deepEqual((await q('select current_user,session_user',[],c))[0],{current_user:'sfstore_reservation_executor',session_user:name});
   for(const role of ['postgres','service_role','authenticator','supabase_admin'])await assert.rejects(c.query('set role '+role),e=>e.code==='42501');
   const grants=await q("select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','sfstore_maintenance') and has_function_privilege(current_user,p.oid,'EXECUTE') order by 1",[],c);
   assert.deepEqual(grants,[{signature:'sfstore_maintenance.run_checkout_expiration(uuid,integer)'}]);
   assert.equal((await q("select count(*)::int n from pg_auth_members where member=(select oid from pg_roles where rolname=current_user)",[],c))[0].n,0);
   for(const schema of ['public','sfstore_maintenance','auth','storage'])assert.equal((await q("select has_schema_privilege(current_user,$1,'CREATE') allowed",[schema],c))[0].allowed,false);
   for(const sql of ['select * from public.orders limit 1','select * from auth.users limit 1','select * from storage.objects limit 1','select * from public.checkout_payment_reports limit 1','select * from sfstore_maintenance.expiration_runs limit 1',"update public.orders set payment_status='paid' where false","select public.transition_checkout_atomic(null,'expired')","select public.confirm_checkout_manual_payment(null,null,null,150,'synthetic')",'select public.get_checkout_expiration_health()',"alter function sfstore_maintenance.run_checkout_expiration(uuid,integer) owner to sfstore_reservation_executor"]){await assert.rejects(c.query(sql),e=>e.code==='42501');}
   assert.equal((await run(c)).status,'completed');
  });
  await t.test('caller search_path and temporary shadow tables cannot redirect SECURITY DEFINER work',async()=>{
   const f=await fixture();await expire(f.order.id);const {c}=await isolatedWorker();
   await c.query('create temporary table orders(id uuid); create temporary table checkout_operations(order_id uuid); set search_path=pg_temp');
   const result=await run(c);assert.equal(result.status,'completed');assert.equal(await stock(f.p),4);assert.equal(await releases(f.order.id),1);
   assert.equal((await q('select count(*)::int n from pg_temp.orders',[],c))[0].n,0);
  });
  await t.test('current, paid and timely reported orders remain protected; expired unreported releases once',async()=>{
   live=await fixture();paid=await fixture();reported=await fixture();const due=await fixture();
   const admin=(await q("select id from auth.users where email='admin@staging.invalid' and not is_anonymous"))[0].id;
   await rpc('confirm_checkout_manual_payment',{p_order_id:paid.order.id,p_operation_key:randomUUID(),p_admin_id:admin,p_amount:150,p_reference:'synthetic-executor-'+randomUUID()});
   const bytes=Buffer.from('%PDF-1.7 synthetic proof');const {createHash}=await import('node:crypto');const key=randomUUID();
   const prepared=await rpc('prepare_checkout_payment_report',{p_buyer_id:reported.buyer,p_order_id:reported.order.id,p_operation_key:key,p_sha256:createHash('sha256').update(bytes).digest('hex'),p_mime:'application/pdf',p_bytes:bytes.length});
   assert.equal((await svc.storage.from('checkout-payment-proofs').upload(prepared.path,bytes,{contentType:'application/pdf',upsert:false})).error,null);
   await rpc('submit_checkout_payment_report',{p_buyer_id:reported.buyer,p_order_id:reported.order.id,p_operation_key:key});
   // Keep a timely report while simulating passage of 24 hours with timestamps only.
   await db.query("update checkout_payment_reports set reported_at=reported_at-interval '25 hours' where order_id=$1",[reported.order.id]);
   await expire(reported.order.id);await expire(due.order.id);
   const result=await run(a);assert.equal(result.status,'completed');assert.equal(await stock(due.p),4);assert.equal(await releases(due.order.id),1);
   for(const f of [live,paid,reported]){assert.equal(await stock(f.p),2);assert.equal(await releases(f.order.id),0);}
   assert.ok((await reported.guest.rpc('get_checkout_expiration_health')).error);
   assert.equal((await run(b)).status,'completed');assert.equal(await releases(due.order.id),1);
  });
  await t.test('same run ID replays its result and records one immutable execution',async()=>{
   const f=await fixture();await expire(f.order.id);const id=randomUUID();const replies=await Promise.all([run(a,id),run(b,id)]);assert.deepEqual(replies[0],replies[1]);assert.equal(await releases(f.order.id),1);
   assert.equal((await q('select count(*)::int n from sfstore_maintenance.expiration_runs where run_id=$1',[id]))[0].n,1);
  });
  await t.test('concurrent automatic invocations skip overlapping work and safely retry with a new ID',async()=>{
   const f=await fixture();await expire(f.order.id);await db.query('begin');await db.query("select pg_advisory_xact_lock(hashtextextended('checkout-expiration-worker',0))");
   try{const skipped=await run(a);assert.equal(skipped.status,'skipped_running');assert.equal(await stock(f.p),2);}finally{await db.query('rollback');}
   const replies=await Promise.all([run(a),run(b)]);assert.ok(replies.some(r=>r.status==='completed'));assert.equal(await stock(f.p),4);assert.equal(await releases(f.order.id),1);
  });
  await t.test('manual and automatic workers in parallel share order locks and restore exactly once',async()=>{
   const f=await fixture();await expire(f.order.id);
   const [automatic,manual]=await Promise.all([run(a),rpc('expire_checkout_reservations',{p_limit:100})]);
   assert.equal(automatic.status,'completed');assert.equal(manual.failures.length,0);assert.equal(await stock(f.p),4);assert.equal(await releases(f.order.id),1);
  });
  await t.test('in-flight confirmable payment locks skip release until confirmed; protected sale never releases',async()=>{
   const f=await fixture();await expire(f.order.id);
   await db.query('begin');await db.query('select id from orders where id=$1 for update',[reported.order.id]);
   try {const result=await run(a);assert.equal(result.status,'completed');assert.equal(await releases(reported.order.id),0);assert.equal(await stock(f.p),4);
    const admin=(await q("select id from auth.users where email='admin@staging.invalid'"))[0].id;
    await db.query('select confirm_checkout_manual_payment($1,$2,$3,$4,$5)',[reported.order.id,randomUUID(),admin,150,'synthetic-executor-'+randomUUID()]);await db.query('commit');
   }catch(e){await db.query('rollback');throw e;}
   await run(b);assert.equal(await stock(reported.p),2);assert.equal(await releases(reported.order.id),0);
  });
  await t.test('locked due order is skipped, backlog is detected and a later attempt releases it',async()=>{
   const f=await fixture();await expire(f.order.id);await db.query("update checkout_operations set expires_at=expires_at-interval '20 minutes' where order_id=$1",[f.order.id]);
   await db.query('begin');await db.query('select id from orders where id=$1 for update',[f.order.id]);
   try{const result=await run(a);assert.equal(result.status,'completed');assert.ok(result.dueAfter>=1);assert.equal(await stock(f.p),2);const health=await rpc('get_checkout_expiration_health');assert.equal(health.backlogOverdue,true);}finally{await db.query('rollback');}
   await run(b);assert.equal(await stock(f.p),4);assert.equal(await releases(f.order.id),1);
  });
  await t.test('partial product lock failure rolls back that order, audits SQLSTATE and allows other orders/retry',async()=>{
   const blocked=await fixture(),free=await fixture();await expire(blocked.order.id);await expire(free.order.id);
   await db.query('begin');await db.query('select id from products where id=$1 for update',[blocked.p]);
   try{const result=await run(a);assert.equal(result.status,'partial');assert.ok(result.failures.some(f=>f.orderId===blocked.order.id&&f.sqlstate==='55P03'));assert.equal(await stock(blocked.p),2);assert.equal(await releases(blocked.order.id),0);assert.equal(await stock(free.p),4);assert.equal(await releases(free.order.id),1);
    assert.equal((await q('select status from sfstore_maintenance.expiration_runs where run_id=$1',[result.runId]))[0].status,'partial');
   }finally{await db.query('rollback');}
   await run(b);assert.equal(await stock(blocked.p),4);assert.equal(await releases(blocked.order.id),1);
  });
  await t.test('batch cancellation is rolled back and recorded as a sanitized failed run before retry',async()=>{
   const f=await fixture();await expire(f.order.id);await db.query('begin');await db.query('select id from products where id=$1 for update',[f.p]);
   try{await a.query("set statement_timeout='100ms'");const result=await run(a);assert.equal(result.status,'failed');assert.equal(result.sqlstate,'57014');assert.equal(result.errorCode,'CHECKOUT_EXPIRATION_RUN_FAILED');assert.equal(await stock(f.p),2);assert.equal(await releases(f.order.id),0);
    assert.equal((await q('select status from sfstore_maintenance.expiration_runs where run_id=$1',[result.runId]))[0].status,'failed');
   }finally{await a.query('set statement_timeout=0');await db.query('rollback');}
   await run(b);assert.equal(await stock(f.p),4);assert.equal(await releases(f.order.id),1);
  });
  await t.test('outer rollback removes both release and run audit; retry commits once',async()=>{
   const f=await fixture();await expire(f.order.id);const id=randomUUID();await a.query('begin');await run(a,id);await a.query('rollback');assert.equal(await stock(f.p),2);assert.equal(await releases(f.order.id),0);
   assert.equal((await q('select count(*)::int n from sfstore_maintenance.expiration_runs where run_id=$1',[id]))[0].n,0);await run(b,id);assert.equal(await stock(f.p),4);assert.equal(await releases(f.order.id),1);
  });
  await t.test('stale heartbeat is detected when monitoring is armed; configuration stays disabled afterward',async()=>{
   await db.query('begin');try{await db.query('update sfstore_maintenance.expiration_monitor set monitoring_enabled=true');await db.query("update sfstore_maintenance.expiration_runs set finished_at=finished_at-interval '1 hour'");
    const health=(await q('select get_checkout_expiration_health() result'))[0].result;assert.equal(health.heartbeatOverdue,true);
   }finally{await db.query('rollback');}assert.equal((await rpc('get_checkout_expiration_health')).monitoringEnabled,false);
  });
  await t.test('exact scheduler payload executes manually with the capability role and creates no schedule',async()=>{
   const f=await fixture();await expire(f.order.id);const command=readFileSync(new URL('../staging/operations/checkout-expiration-command.sql',import.meta.url),'utf8');
   await db.query(command);assert.equal(await stock(f.p),4);assert.equal(await releases(f.order.id),1);
   const audit=(await q('select executor,status from sfstore_maintenance.expiration_runs order by finished_at desc limit 1'))[0];assert.equal(audit.executor,'sfstore_reservation_executor');assert.equal(audit.status,'completed');
   const health=await rpc('get_checkout_expiration_health');assert.equal(health.monitoringEnabled,false);
  });
  await t.test('future setup script fails closed without approval and never reaches job registration',async()=>{
   const sql=readFileSync(new URL('../staging/operations/prepare-inactive-checkout-expiration-cron.sql',import.meta.url),'utf8');
   try{await assert.rejects(db.query(sql),e=>e.code==='P0001'&&e.message==='EXPIRATION_SETUP_NOT_APPROVED_FOR_DATABASE');}finally{await db.query('rollback');}
  });
  await t.test('final invariants: no double releases, paid restitution, negative stock or jobs installed',async()=>{
   const invariant=(await q("select (select count(*) from (select order_id,order_item_id from inventory_movements where movement_type='release' group by order_id,order_item_id having count(*)>1) x)::int duplicates,(select count(*) from inventory_movements m join orders o on o.id=m.order_id where movement_type='release' and o.payment_status='paid')::int paid_releases,(select count(*) from products where stock<0)::int negative_stock"))[0];assert.deepEqual(invariant,{duplicates:0,paid_releases:0,negative_stock:0});
   const hasCron=(await q("select to_regclass('cron.job') present"))[0].present;
   if(hasCron)assert.equal((await q("select count(*)::int n from cron.job where jobname='sfstore-checkout-expiration'"))[0].n,0);
   assert.equal(await releases(live.order.id),0);assert.equal(await releases(paid.order.id),0);
  });
 }finally{await Promise.all(clients.map(c=>c.end()));for(const name of temporaryRoles){assert.match(name,/^synthetic_expiry_audit_[a-f0-9]{32}$/);await db.query('drop role '+name);}await db.end();}
});
