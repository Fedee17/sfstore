import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {before,after,describe,test} from 'node:test';
import {Client} from 'pg';
import {prepareCheckoutExpirationRollout} from '../scripts/prepare-checkout-expiration-rollout.mjs';

const root=resolve(import.meta.dirname,'..');
const read=file=>readFileSync(join(root,file),'utf8');
const sql=prepareCheckoutExpirationRollout(root);
const runtimePath=process.env.SFSTORE_TEST_PGLITE_MODULE;
const localPgPort=process.env.SFSTORE_TEST_EXPIRATION_PG_PORT;
const connection=localPgPort?{host:'127.0.0.1',port:Number(localPgPort),user:'postgres',database:'sfstore_expiration_synthetic',password:process.env.SFSTORE_TEST_PG_PASSWORD,connectionTimeoutMillis:5000}:null;
async function nativeClient(){
  assert.ok(Number.isInteger(connection.port)&&connection.port>1024&&connection.port<=65535);
  const client=new Client(connection);await client.connect();
  client.exec=text=>client.query(text);client.close=()=>client.end();
  return client;
}

test('rollout reuses canonical migrations without registering jobs or running expiration',()=>{
  assert.match(sql,/create or replace function public.get_checkout_expiration_health\(\)/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/\b(?:create extension|cron\.schedule|update cron\.job)\b/i);
  assert.ok(sql.trimEnd().endsWith('commit;'));
  assert.equal((sql.match(/^begin;$/gm)||[]).length,1);
  assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
});

describe(`manual monitor upgrade / isolated PostgreSQL ${localPgPort?'native':'WASM'}`, {skip:!runtimePath&&!localPgPort,concurrency:false},()=>{
  let db,baseline;
  const q=async(text,args=[])=>(await db.query(text,args)).rows;
  const health=async()=>(await q('select get_checkout_expiration_health() result'))[0].result;
  const run=async(id=randomUUID(),client=db)=>{
    await client.exec('set role sfstore_reservation_executor');
    try{return (await client.query('select sfstore_maintenance.run_checkout_expiration($1,100) result',[id])).rows[0].result;}
    finally{await client.exec('reset role');}
  };
  const snapshot=async()=>{
    const rows={};
    for(const table of ['products','orders','order_items','checkout_operations','inventory_movements','checkout_payment_reports','checkout_manual_payments','order_payments'])rows[table]=await q(`select to_jsonb(t) row from public.${table} t order by to_jsonb(t)::text`);
    return rows;
  };
  before(async()=>{
    if(localPgPort){
      db=await nativeClient();
      assert.equal((await q('select current_database() name'))[0].name,'sfstore_expiration_synthetic');
      assert.equal(Number((await q("select count(*) n from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m','p')"))[0].n),0);
    }else{
      const runtime=createRequire(join(runtimePath,'package.json'));
      const {PGlite}=runtime('@electric-sql/pglite');
      const {pgcrypto}=runtime('@electric-sql/pglite/contrib/pgcrypto');
      db=new PGlite({extensions:{pgcrypto}});
    }
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(read('tests/fixtures/storage-permissions.sql'));
    const manifest=JSON.parse(read('staging/migration-manifest.json'));
    for(const entry of manifest.applicationOrder.filter(e=>e.source.split('/').at(-1)<'202610120003'))await db.exec(read(entry.stagingFile));
    await db.exec(read('staging/supabase/seed.sql'));
    await db.exec(`create function public.get_checkout_expiration_health() returns jsonb language sql security invoker
      set search_path=pg_catalog,public,pg_temp as $$select jsonb_build_object('monitoringEnabled',false,'recentRuns','[]'::jsonb)$$;
      revoke all on function public.get_checkout_expiration_health() from public,anon,authenticated;
      grant execute on function public.get_checkout_expiration_health() to service_role;`);
    const body=(await q("select prosrc from pg_proc where oid='get_checkout_expiration_health()'::regprocedure"))[0].prosrc;
    await q("select set_config('sfstore.expected_database',current_database(),false),set_config('sfstore.expiration_expected_health_md5',md5($1),false)",[body]);
    await q("select set_config('sfstore.expiration_expected_contracts',jsonb_object_agg(signature,md5(pg_get_functiondef(signature::regprocedure)))::text,false) from unnest(array['public.expire_checkout_reservations(integer)','public.transition_checkout_atomic(uuid,text)','public.prevent_historical_inventory_movement()']) signature");
    await fixture();
    baseline=await snapshot();
  });
  after(async()=>{await db?.close();});
  async function rejected(pattern){await assert.rejects(db.exec(sql),pattern);await db.exec('rollback');assert.deepEqual(await snapshot(),baseline);}
  test('no approval, wrong database, changed monitor and public grants stop before installation',async()=>{
    await rejected(/EXPIRATION_INSTALL_NOT_APPROVED_FOR_DATABASE/);
    await db.exec("set sfstore.expiration_install_approved='yes'; set sfstore.expected_database='wrong-database'");
    await rejected(/EXPIRATION_INSTALL_NOT_APPROVED_FOR_DATABASE/);
    await q("select set_config('sfstore.expected_database',current_database(),false)");
    await db.exec("set sfstore.expiration_expected_health_md5='changed'");
    await rejected(/EXPIRATION_MANUAL_MONITOR_CHANGED/);
    await q("select set_config('sfstore.expiration_expected_health_md5',md5(prosrc),false) from pg_proc where oid='get_checkout_expiration_health()'::regprocedure");
    await db.exec('grant execute on function get_checkout_expiration_health() to authenticated');
    await rejected(/EXPIRATION_BASE_PERMISSIONS_CHANGED/);
    await db.exec('revoke execute on function get_checkout_expiration_health() from authenticated');
    const contracts=(await q("select current_setting('sfstore.expiration_expected_contracts') value"))[0].value;
    await db.exec("set sfstore.expiration_expected_contracts='{}'");
    await rejected(/EXPIRATION_REVIEWED_CONTRACT_CHANGED/);
    await q("select set_config('sfstore.expiration_expected_contracts',$1,false)",[contracts]);
    assert.equal((await q("select to_regnamespace('sfstore_maintenance') value"))[0].value,null);
  });
  test('manual monitor upgrades atomically; existing data and checkout contract remain intact',async()=>{
    const definition=await q("select pg_get_functiondef('transition_checkout_atomic(uuid,text)'::regprocedure) definition");
    await db.exec(sql);
    assert.deepEqual(await snapshot(),baseline);
    assert.deepEqual(await q("select pg_get_functiondef('transition_checkout_atomic(uuid,text)'::regprocedure) definition"),definition);
    assert.equal((await health()).monitoringEnabled,false);
    assert.deepEqual((await health()).recentRuns,[]);
    assert.equal((await q("select to_regclass('cron.job') value"))[0].value,null);
    await rejected(/EXPIRATION_ALREADY_PREPARED_REVIEW_BEFORE_CHANGING/);
  });
  test('capability has no login, table access, payment authority or public invocation',async()=>{
    const role=(await q("select rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname='sfstore_reservation_executor'"))[0];
    assert.ok(Object.values(role).every(v=>v===false));
    for(const role of ['anon','authenticated','service_role'])assert.equal((await q("select has_function_privilege($1,'sfstore_maintenance.run_checkout_expiration(uuid,integer)','EXECUTE') value",[role]))[0].value,false);
    await db.exec('set role sfstore_reservation_executor');
    try{
      for(const command of ['select * from public.orders','select * from sfstore_maintenance.expiration_runs','select public.confirm_checkout_manual_payment(null,null,null,null,null)','select public.expire_checkout_reservations(100)','select public.get_checkout_expiration_health()'])await assert.rejects(q(command),e=>e.code==='42501');
      assert.deepEqual((await q("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','sfstore_maintenance') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') and has_function_privilege(current_user,p.oid,'EXECUTE') order by proname")).map(r=>r.proname),['run_checkout_expiration']);
    }finally{await db.exec('reset role');}
  });
  async function fixture(){
    const product=randomUUID(),buyer=randomUUID();
    await q("insert into products(id,category_id,name,slug,short_description,price,transfer_price,stock,status) values($1::uuid,'11111111-1111-4111-8111-111111111111','SYNTHETIC EXPIRATION',$1::text,'Synthetic only',100,75,4,'active')",[product]);
    const order=(await q('select create_checkout_atomic($1,$2,$3) result',[buyer,randomUUID(),JSON.stringify({customer:{fullName:'Synthetic Buyer',phone:'synthetic-only'},shipping:{method:'pickup'},paymentMethod:'transfer',items:[{productId:product,quantity:2}]})]))[0].result;
    return {product,buyer,order:order.id};
  }
  const expire=f=>q("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[f.order]);
  const stock=async f=>(await q('select stock from public.products where id=$1',[f.product]))[0].stock;
  const releases=async f=>Number((await q("select count(*) n from public.inventory_movements where order_id=$1 and movement_type='release'",[f.order]))[0].n);
  test('overdue unpaid releases once; current and paid reservations stay protected',async()=>{
    const due=await fixture(),live=await fixture(),paid=await fixture();
    await q('select confirm_checkout_manual_payment($1,$2,$3,150,$4)',[paid.order,randomUUID(),randomUUID(),'synthetic-reference']);
    await expire(due);await expire(paid);
    const id=randomUUID(),first=await run(id);
    assert.equal(first.status,'completed');assert.equal(first.released,1);
    assert.deepEqual(await run(id),first);
    await run();assert.equal(await stock(due),4);assert.equal(await releases(due),1);
    for(const f of [live,paid]){assert.equal(await stock(f),2);assert.equal(await releases(f),0);}
    const h=await health();assert.ok(h.recentRuns.length>=2);assert.ok(h.lastProgressAt);assert.equal(h.due,0);
  });
  test('timely payment report protects an overdue reservation and stays visible',async()=>{
    const f=await fixture(),key=randomUUID();
    const prepared=(await q("select prepare_checkout_payment_report($1,$2,$3,$4,'application/pdf',32) result",[f.buyer,f.order,key,'a'.repeat(64)]))[0].result;
    await q("insert into storage.objects(bucket_id,name,metadata) values('checkout-payment-proofs',$1,'{\"size\":32,\"mimetype\":\"application/pdf\"}')",[prepared.path]);
    await q('select submit_checkout_payment_report($1,$2,$3)',[f.buyer,f.order,key]);
    await q("update checkout_payment_reports set reported_at=reported_at-interval '25 hours' where order_id=$1",[f.order]);
    await expire(f);await run();assert.equal(await stock(f),2);assert.equal(await releases(f),0);assert.equal((await health()).protectedReports,1);
  });
  test('outer rollback restores stock, audit and run id; committed retry releases once',async()=>{
    const f=await fixture();await expire(f);const id=randomUUID();
    await db.exec('begin');await run(id);await db.exec('rollback');
    assert.equal(await stock(f),2);assert.equal(await releases(f),0);
    assert.equal(Number((await q('select count(*) n from sfstore_maintenance.expiration_runs where run_id=$1',[id]))[0].n),0);
    await run(id);assert.equal(await stock(f),4);assert.equal(await releases(f),1);
  });
  test('temporary table shadowing cannot redirect release or historical inventory guards',async()=>{
    const f=await fixture();await expire(f);
    await db.exec('create temporary table orders(id uuid); create temporary table products(id uuid); set search_path=pg_temp');
    try{
      await run();assert.equal(await stock(f),4);assert.equal(await releases(f),1);
      assert.equal(Number((await q('select count(*) n from pg_temp.products'))[0].n),0);
    }finally{await db.exec('set search_path=public; drop table pg_temp.orders; drop table pg_temp.products');}
  });
  async function withWorkers(action){
    const workers=[];
    try{
      workers.push(await nativeClient());workers.push(await nativeClient());
      assert.notEqual((await workers[0].query('select pg_backend_pid() pid')).rows[0].pid,(await workers[1].query('select pg_backend_pid() pid')).rows[0].pid);
      await action(...workers);
    }finally{await Promise.all(workers.map(client=>client.end()));}
  }
  test('simultaneous same-id calls return one result and restore inventory exactly once',{skip:!localPgPort},async()=>{
    const f=await fixture();await expire(f);const id=randomUUID();
    await withWorkers(async(a,b)=>{
      const [first,second]=await Promise.all([run(id,a),run(id,b)]);
      assert.deepEqual(first,second);assert.equal(first.released,1);
      assert.equal(Number((await q('select count(*) n from sfstore_maintenance.expiration_runs where run_id=$1',[id]))[0].n),1);
    });
    assert.equal(await stock(f),4);assert.equal(await releases(f),1);
  });
  test('global execution lock skips overlapping workers; concurrent retries release once',{skip:!localPgPort},async()=>{
    const f=await fixture();await expire(f);
    await withWorkers(async(a,b)=>{
      await db.exec("begin; select pg_advisory_xact_lock(hashtextextended('checkout-expiration-worker',0))");
      try{
        const results=await Promise.all([run(randomUUID(),a),run(randomUUID(),b)]);
        assert.ok(results.every(result=>result.status==='skipped_running'));
        assert.equal(await stock(f),2);assert.equal(await releases(f),0);
      }finally{await db.exec('rollback');}
      const results=await Promise.all([run(randomUUID(),a),run(randomUUID(),b)]);
      assert.ok(results.some(result=>result.status==='completed'));
    });
    assert.equal(await stock(f),4);assert.equal(await releases(f),1);
  });
  test('manual and automatic releases on different connections do not double-return stock',{skip:!localPgPort},async()=>{
    const f=await fixture();await expire(f);
    await withWorkers(async(a,b)=>{
      await b.exec('set role service_role');
      const [automatic,manual]=await Promise.all([run(randomUUID(),a),b.query('select public.expire_checkout_reservations(100) result')]);
      assert.equal(automatic.status,'completed');assert.deepEqual(manual.rows[0].result.failures,[]);
    });
    assert.equal(await stock(f),4);assert.equal(await releases(f),1);
  });
  test('a locked order is skipped while another expires; retry returns only the skipped stock',{skip:!localPgPort},async()=>{
    const blocked=await fixture(),free=await fixture();await expire(blocked);await expire(free);
    await withWorkers(async(a)=>{
      await db.exec('begin');await q('select id from public.orders where id=$1 for update',[blocked.order]);
      try{
        const result=await run(randomUUID(),a);assert.equal(result.status,'completed');assert.ok(result.dueAfter>=1);
        assert.equal(await stock(blocked),2);assert.equal(await releases(blocked),0);
        assert.equal(await stock(free),4);assert.equal(await releases(free),1);
      }finally{await db.exec('rollback');}
      await run(randomUUID(),a);
    });
    assert.equal(await stock(blocked),4);assert.equal(await releases(blocked),1);assert.equal(await releases(free),1);
  });
  test('a product lock rolls back only its order; free orders and later retry remain correct',{skip:!localPgPort},async()=>{
    const blocked=await fixture(),free=await fixture();await expire(blocked);await expire(free);
    await withWorkers(async(a)=>{
      await db.exec('begin');await q('select id from public.products where id=$1 for update',[blocked.product]);
      try{
        const result=await run(randomUUID(),a);assert.equal(result.status,'partial');
        assert.ok(result.failures.some(failure=>failure.orderId===blocked.order&&failure.sqlstate==='55P03'));
        assert.equal(await stock(blocked),2);assert.equal(await releases(blocked),0);
        assert.equal(await stock(free),4);assert.equal(await releases(free),1);
      }finally{await db.exec('rollback');}
      await run(randomUUID(),a);
    });
    assert.equal(await stock(blocked),4);assert.equal(await releases(blocked),1);assert.equal(await releases(free),1);
  });
  test('a cancelled batch restores no stock until the retry commits',{skip:!localPgPort},async()=>{
    const f=await fixture();await expire(f);
    await withWorkers(async(a,b)=>{
      await db.exec('begin');await q('select id from public.products where id=$1 for update',[f.product]);
      await a.exec("set statement_timeout='100ms'");
      try{
        const result=await run(randomUUID(),a);assert.equal(result.status,'failed');assert.equal(result.sqlstate,'57014');
        assert.equal(await stock(f),2);assert.equal(await releases(f),0);
      }finally{await a.exec('set statement_timeout=0');await db.exec('rollback');}
      await run(randomUUID(),b);
    });
    assert.equal(await stock(f),4);assert.equal(await releases(f),1);
  });
  test('concurrent runs leave no double releases, paid restitution or negative inventory',{skip:!localPgPort},async()=>{
    const result=(await q("select (select count(*)::int from (select order_id,order_item_id from inventory_movements where movement_type='release' group by order_id,order_item_id having count(*)>1) duplicated) duplicates,(select count(*)::int from inventory_movements m join orders o on o.id=m.order_id where movement_type='release' and o.payment_status='paid') paid_releases,(select count(*)::int from products where stock<0) negative_stock"))[0];
    assert.deepEqual(result,{duplicates:0,paid_releases:0,negative_stock:0});
    assert.equal((await health()).protectedReports,1);
  });
  test('stale heartbeat is reported only when monitoring is enabled; no schedule is installed',async()=>{
    await db.exec("begin; update sfstore_maintenance.expiration_monitor set monitoring_enabled=true; update sfstore_maintenance.expiration_runs set finished_at=finished_at-interval '1 hour'");
    try{assert.equal((await health()).heartbeatOverdue,true);}finally{await db.exec('rollback');}
    assert.equal((await health()).monitoringEnabled,false);
    assert.equal((await q("select to_regclass('cron.job') value"))[0].value,null);
    const setup=read('staging/operations/prepare-inactive-checkout-expiration-cron.sql');
    await assert.rejects(db.exec(setup),/EXPIRATION_SETUP_NOT_APPROVED_FOR_DATABASE/);await db.exec('rollback');
  });
});
