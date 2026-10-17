import assert from 'node:assert/strict';
import { before,after,describe,test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn,spawnSync } from 'node:child_process';
import { readFileSync,existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Explicit local-only acceptance. No remote URL/env file, passwords, CAPTCHA changes or browser UI mocks.
const root=resolve(import.meta.dirname,'..'),project='sfstore-checkout-synthetic-staging';
const local='http://127.0.0.1:54331',base='http://127.0.0.1:3148';
const enabled=process.env.SFSTORE_REAL_LOCAL_STORE_SALES==='true';
const migration='202610170001_store_sales_full_payment.sql';
const docker=process.env.SFSTORE_TEST_DOCKER;
const require=createRequire(import.meta.url);

describe('physical sales: real local UI + Auth + PostgREST + RPC + inventory',{skip:!enabled,concurrency:false,timeout:360000},()=>{
 let db,svc,anon,service,browser,server,category,adminId,adminContext,buyerContext,legacyOrder,legacyBefore;
 let serverError=false,networkFailures=0;
 const run=randomUUID(),prefix=`SYNTHETIC-STORE-1B-${run.slice(0,8)}`,adminEmail=`store-1b-${run}@staging.invalid`;
 const ownProducts=[],ownOrders=[],results=[];
 const output=join(root,'staging/runtime/store-sales-1b',run);
 function dockerRead(args){const r=spawnSync(docker,args,{encoding:'utf8',timeout:15000});if(r.status!==0)throw new Error('LOCAL_DOCKER_READ_FAILED');return r.stdout;}
 function inspect(name){const d=JSON.parse(dockerRead(['inspect',name]))[0];assert.equal(d.Config.Labels['com.supabase.cli.project'],project);return d;}
 function config(d){return Object.fromEntries(d.Config.Env.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));}
 async function q(sql,args=[]){return(await db.query(sql,args)).rows;}
 async function stock(id){return(await q('select stock from products where id=$1',[id]))[0].stock;}
 async function product(suffix,{price=100,cost=40,stock:units=2}={}){
  const id=randomUUID();await q("insert into products(id,category_id,name,slug,short_description,price,transfer_price,cost,stock,status) values($1,$2,$3,$4,'SYNTHETIC ONLY',$5,1,$6,$7,'active')",[id,category,`${prefix}-${suffix}`,`synthetic-1b-${id}`,price,cost,units]);ownProducts.push(id);return id;
 }
 async function session(email,checkout=false){
  const created=await svc.auth.admin.createUser({email,email_confirm:true,user_metadata:{synthetic:true,purpose:'store-sales-1b',run}});
  assert.ok(!created.error,'SYNTHETIC_AUTH_USER_CREATE_FAILED');
  const link=await svc.auth.admin.generateLink({type:'magiclink',email});assert.ok(!link.error,'SYNTHETIC_AUTH_LINK_FAILED');
  const cookies=[];const client=createServerClient(local,anon,{...(checkout?{cookieOptions:{name:'sfstore-checkout-auth',httpOnly:true,sameSite:'lax',secure:false,path:'/'}}:{}),cookies:{getAll:()=>cookies,setAll:items=>{for(const item of items){const i=cookies.findIndex(x=>x.name===item.name);if(i>=0)cookies.splice(i,1);cookies.push(item);}}}});
  const verified=await client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});assert.ok(!verified.error,'SYNTHETIC_AUTH_OTP_FAILED');
  const user=await client.auth.getUser();assert.equal(user.error?.code,undefined);assert.equal(user.data.user.email,email);assert.equal(user.data.user.is_anonymous,false);
  const context=await browser.newContext();
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base&&url.origin!==local){networkFailures++;return route.abort();}return route.continue();});
  await context.addCookies(cookies.filter(x=>x.value).map(x=>({name:x.name,value:x.value,url:base,httpOnly:!!x.options.httpOnly,sameSite:'Lax'})));
  return{context,userId:user.data.user.id};
 }
 async function pageWithProduct(suffix,id){
  const page=await adminContext.newPage();await page.goto(base+'/admin/ventas/nueva');await page.getByRole('heading',{name:'Nueva venta local',exact:true}).waitFor();
  // SSR heading can precede hydration; wait for local JS requests before typing into the controlled search.
  await page.waitForLoadState('networkidle');
  await page.getByRole('searchbox').fill(`${prefix}-${suffix}`);await page.getByRole('button',{name:new RegExp(`${prefix}-${suffix}`)}).click();await page.locator('[name=quantity]').fill('2');
  assert.equal(await page.locator('[name=productId]').inputValue(),id);return page;
 }
 async function setPayments(page,payments){
  for(let i=0;i<payments.length;i++){
   if(i)await page.getByRole('button',{name:'Agregar otro medio'}).click();
   await page.locator('[name=paymentMethod]').nth(i).selectOption(payments[i].method);await page.locator('[name=paymentAmount]').nth(i).fill(String(payments[i].amount));
  }
 }
 async function ownCounts(){return(await q("select (select count(*)::int from orders where notes=$1) orders,(select count(*)::int from order_payments p join orders o on o.id=p.order_id where o.notes=$1) payments,(select count(*)::int from inventory_movements m join orders o on o.id=m.order_id where o.notes=$1) movements",[prefix]))[0];}
 before(async()=>{
  assert.ok(docker);assert.equal(new URL(local).hostname,'127.0.0.1');assert.equal(new URL(base).hostname,'127.0.0.1');
  for(const file of ['.env','.env.local','.env.development','.env.development.local'])assert.equal(existsSync(join(root,file)),false,'REFUSE_WORKTREE_ENV_FILES');
  const database=inspect(`supabase_db_${project}`),auth=inspect(`supabase_auth_${project}`),gateway=inspect(`supabase_kong_${project}`);
  assert.equal(config(auth).GOTRUE_SECURITY_CAPTCHA_ENABLED,'true','CAPTCHA_MUST_REMAIN_ENABLED');
  const kong=dockerRead(['exec',gateway.Id,'cat','/home/kong/kong.yml']);
  for(const token of kong.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]){try{const p=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));if(p.ref)assert.notEqual(p.ref,'xspvoicelbxlmtqoiolc');if(p.role==='anon')anon=token;if(p.role==='service_role')service=token;}catch(e){if(e.code==='ERR_ASSERTION')throw e;}}
  assert.ok(anon&&service,'LOCAL_GATEWAY_KEYS_UNAVAILABLE');
  db=new Client({host:'127.0.0.1',port:54332,user:'postgres',password:config(database).POSTGRES_PASSWORD,database:'postgres',statement_timeout:15000});await db.connect();
  assert.equal((await q("select id from sfstore_staging.identity"))[0].id,'SFSTORE_SYNTHETIC_STAGING');
  const cfg=await q('select enabled,reservation_seconds,price_policy from checkout_configuration');assert.equal(cfg.length,1);assert.equal(cfg[0].enabled,true);assert.equal(cfg[0].reservation_seconds,86400);assert.equal(cfg[0].price_policy,'manual_25_frozen');
  svc=createClient(local,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {chromium}=require(process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,channel:'msedge'});
  const admin=await session(adminEmail);adminContext=admin.context;adminId=admin.userId;
  const buyer=await session(`buyer-1b-${run}@staging.invalid`,true);buyerContext=buyer.context;
  category=randomUUID();await q("insert into categories(id,name,slug) values($1,$2,$3)",[category,prefix,`synthetic-1b-${run}`]);
  // Create an old-format sale before migration; retain its exact amounts and metadata.
  const oldProduct=await product('LEGACY',{stock:5});
  const old=(await q('select create_store_sale($1,$2,$3,$4,$5) result',[randomUUID(),adminId,'SYNTHETIC LEGACY',prefix,JSON.stringify([{product_id:oldProduct,quantity:1,unit_price:80}])]))[0].result;
  legacyOrder=old.order_id;ownOrders.push(legacyOrder);
  await q('select record_store_sale_payment_atomic($1,$2,$3,$4,$5)',[legacyOrder,adminId,'transfer',80,`synthetic-1b-${run}-legacy`]);
  legacyBefore=(await q('select subtotal,discount,total,status,payment_status,metadata from orders where id=$1',[legacyOrder]))[0];
  const columns=(await q("select count(*)::int n from information_schema.columns where table_schema='public' and ((table_name='order_items' and column_name in('list_unit_price_snapshot','unit_cost_snapshot')) or (table_name='order_payments' and column_name='store_payment_method'))"))[0].n;
  if(columns===0){assert.equal(process.env.SFSTORE_STORE_SALES_APPLY_LOCAL_MIGRATION,'true','LOCAL_MIGRATION_APPROVAL_REQUIRED');await db.query(readFileSync(join(root,'supabase/migrations',migration),'utf8'));}
  else assert.equal(columns,3,'PARTIAL_LOCAL_SCHEMA_STOP');
  await q("notify pgrst,'reload schema'");
  for(let i=0;i<40;i++){const r=await svc.from('order_items').select('unit_cost_snapshot,list_unit_price_snapshot').limit(0);if(!r.error)break;if(i===39)throw new Error('POSTGREST_SCHEMA_CACHE_NOT_READY');await delay(250);}
  const env=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:local,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,ADMIN_ALLOWED_EMAILS:adminEmail,CHECKOUT_GUEST_ENABLED:'true',NEXT_TELEMETRY_DISABLED:'1'});
  server=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3148','--webpack'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',()=>{});server.stderr.on('data',()=>{});server.on('error',()=>{serverError=true});
  for(let i=0;i<100;i++){if(serverError||server.exitCode!==null)throw new Error('LOCAL_NEXT_SERVER_STOPPED');try{const r=await fetch(base+'/admin/login',{signal:AbortSignal.timeout(1500)});if(r.status===200)break;}catch{}if(i===99)throw new Error('LOCAL_NEXT_SERVER_NOT_READY');await delay(500);}
  mkdirSync(output,{recursive:true});
 });
 after(async()=>{
  if(db&&ownProducts.length)await q("update products set status='draft' where id=any($1::uuid[])",[ownProducts]);
  const state={run,localOnly:true,url:local,application:base,sourceBranch:'codex/store-sales-full-payment-20261017',captchaUnchanged:true,sessionMethod:'local Auth admin-generated email link verified by OTP; real getUser and SSR cookies',serverActionsMocked:false,postgrestMocked:false,results,fixtureProducts:ownProducts,fixtureOrders:ownOrders,fixturesRetained:true,fixtureProductsHidden:true,externalBrowserRequestsBlocked:networkFailures,finishedAt:new Date().toISOString()};
  if(existsSync(output))writeFileSync(join(output,'result-private.json'),JSON.stringify(state,null,2));
  await browser?.close();if(server?.pid){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else server.kill('SIGTERM');}await db?.end();
 });
 function checked(label,fn){test(label,async()=>{try{await fn();results.push({case:label,status:'PASS'});}catch(e){results.push({case:label,status:'FAIL',code:e.code??e.name});throw e;}});}
 checked('Auth real: no session and buyer session cannot access administrator',async()=>{
  const c=await browser.newContext();const p=await c.newPage();await p.goto(base+'/admin/ventas');await p.waitForURL(/admin\/login/,{timeout:15000});assert.match(p.url(),/admin\/login/);await c.close();
  const other=await session(`nonadmin-1b-${run}@staging.invalid`);const b=await other.context.newPage();await b.goto(base+'/admin/ventas');await b.waitForURL(/admin\/login/,{timeout:15000});assert.match(b.url(),/admin\/login/);await other.context.close();
  const pub=createClient(local,anon,{auth:{persistSession:false,autoRefreshToken:false}});const denied=await pub.rpc('create_store_sale_atomic',{p_idempotency_key:randomUUID(),p_created_by:adminId,p_customer_name:'SYNTHETIC',p_notes:prefix,p_items:[],p_payments:[]});assert.ok(denied.error);
 });
 const cases=[['CASH',[{method:'cash',amount:150}],150,50],['TRANSFER',[{method:'transfer',amount:150}],150,50],['CASH-TRANSFER',[{method:'cash',amount:50},{method:'transfer',amount:100}],150,50],['CASH-DEBIT',[{method:'cash',amount:50},{method:'debit',amount:150}],200,0],['CREDIT',[{method:'credit',amount:200}],200,0],['QR',[{method:'qr',amount:200}],200,0],['OTHER',[{method:'other',amount:200}],200,0]];
 for(const [label,payments,total,discount] of cases)checked(`UI -> Server Action -> PostgREST -> RPC: ${label}`,async()=>{
  const id=await product(label),page=await pageWithProduct(label,id);await page.locator('[name=notes]').fill(prefix);await setPayments(page,payments);
  const captured=page.waitForRequest(r=>r.method()==='POST'&&!!r.headers()['next-action']);
  await page.getByRole('button',{name:'Registrar venta',exact:true}).click();const action=await captured;
  await page.getByRole('status').filter({hasText:'Venta cobrada y confirmada'}).waitFor({timeout:20000});
  const href=await page.getByRole('link',{name:'Ver venta',exact:true}).getAttribute('href');const orderId=href.split('/').at(-1);ownOrders.push(orderId);
  const order=(await q('select * from orders where id=$1',[orderId]))[0];assert.equal(Number(order.subtotal),200);assert.equal(Number(order.discount),discount);assert.equal(Number(order.total),total);assert.equal(order.payment_status,'paid');assert.equal(order.channel,'store');assert.equal(order.status,'paid');
  const item=(await q('select * from order_items where order_id=$1',[orderId]))[0];assert.equal(Number(item.list_unit_price_snapshot),100);assert.equal(Number(item.unit_price),total/2);assert.equal(Number(item.unit_cost_snapshot),40);assert.equal(item.quantity,2);
  const ledger=await q('select store_payment_method,amount from order_payments where order_id=$1 order by created_at,id',[orderId]);assert.equal(ledger.length,payments.length);assert.equal(ledger.reduce((n,x)=>n+Number(x.amount),0),total);assert.deepEqual(ledger.map(x=>x.store_payment_method).sort(),payments.map(x=>x.method).sort());
  assert.equal(await stock(id),0);assert.equal((await q("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='sale'",[orderId]))[0].n,1);
  if(label==='CASH'){
   await q('update products set cost=99,price=300 where id=$1',[id]);const counts=await ownCounts();
   const headers={...action.headers()};delete headers['content-length'];delete headers.host;
   const replay=await adminContext.request.fetch(action.url(),{method:'POST',headers,data:action.postDataBuffer()});assert.equal(replay.status(),200);assert.ok((await replay.text()).includes(orderId));assert.deepEqual(await ownCounts(),counts);assert.equal(await stock(id),0);
   assert.equal(Number((await q('select unit_cost_snapshot from order_items where order_id=$1',[orderId]))[0].unit_cost_snapshot),40);
  }
  await page.goto(base+href);await page.getByText('Subtotal de lista:',{exact:false}).waitFor();assert.ok((await page.locator('main').innerText()).includes('Costo unitario al vender:'));await page.close();
 });
 for(const amount of [149.99,150.01])checked(`server rejects ${amount} even if client submit guard is bypassed`,async()=>{
  const label=`INVALID-${String(amount).replace('.','-')}`,id=await product(label),page=await pageWithProduct(label,id);await page.locator('[name=notes]').fill(prefix);await setPayments(page,[{method:'cash',amount}]);
  assert.equal(await page.getByRole('button',{name:'Registrar venta',exact:true}).isDisabled(),true);const before=await ownCounts();
  await page.locator('form').filter({has:page.locator('[name=idempotencyKey]')}).evaluate(f=>f.requestSubmit());
  await page.getByRole('alert').filter({hasText:'Debés cobrar exactamente el total'}).waitFor({timeout:20000});assert.deepEqual(await ownCounts(),before);assert.equal(await stock(id),2);await page.close();
 });
 checked('active online reservation prevents physical sale of the same units',async()=>{
  const id=await product('RESERVED'),page=await pageWithProduct('RESERVED',id);await page.locator('[name=notes]').fill(prefix);await setPayments(page,[{method:'cash',amount:150}]);
  const body={operationKey:randomUUID(),customer:{fullName:'SYNTHETIC 1B BUYER',phone:'0000000000',email:`checkout-1b-${run}@example.invalid`},shipping:{method:'pickup'},paymentMethod:'transfer',items:[{productId:id,quantity:2}]};
  const response=await buyerContext.request.post(base+'/api/checkout',{data:body,headers:{Origin:base}});assert.equal(response.status(),200);const online=await response.json();assert.equal(online.total,150);assert.equal(online.discount,50);ownOrders.push(online.id);
  const op=(await q('select state,extract(epoch from expires_at-created_at)::int seconds from checkout_operations where order_id=$1',[online.id]))[0];assert.equal(op.state,'pending');assert.equal(op.seconds,86400);assert.equal(await stock(id),0);
  await page.getByRole('button',{name:'Registrar venta',exact:true}).click();await page.getByRole('alert').filter({hasText:'No hay stock suficiente'}).waitFor({timeout:20000});assert.equal(await stock(id),0);
  assert.equal((await q('select count(*)::int n from order_items where product_id=$1',[id]))[0].n,1);
  const again=await buyerContext.request.post(base+'/api/checkout',{data:body,headers:{Origin:base}});assert.equal(again.status(),200);assert.equal((await again.json()).id,online.id);assert.equal(await stock(id),0);
  const row=(await q('select unit_cost_snapshot,list_unit_price_snapshot from order_items where order_id=$1',[online.id]))[0];assert.equal(row.unit_cost_snapshot,null);assert.equal(row.list_unit_price_snapshot,null);await page.close();
 });
 checked('old-format sale remains readable with its original price and NULL snapshots',async()=>{
  assert.deepEqual((await q('select subtotal,discount,total,status,payment_status,metadata from orders where id=$1',[legacyOrder]))[0],legacyBefore);
  const items=await q('select unit_price,unit_cost_snapshot,list_unit_price_snapshot from order_items where order_id=$1',[legacyOrder]);assert.equal(Number(items[0].unit_price),80);assert.equal(items[0].unit_cost_snapshot,null);assert.equal(items[0].list_unit_price_snapshot,null);
  const p=await adminContext.newPage();await p.goto(base+`/admin/ventas/${legacyOrder}`);await p.getByText('Sin costo registrado',{exact:false}).waitFor();assert.ok((await p.locator('main').innerText()).includes('80,00'));await p.close();
 });
});
