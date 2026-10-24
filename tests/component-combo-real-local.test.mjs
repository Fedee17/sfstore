import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import ts from 'typescript';
import {createRequire} from 'node:module';
import * as componentHelpers from '../lib/products/component-combos.ts';
const enabled=process.env.SFSTORE_REAL_LOCAL_COMBOS==='true';
const root=resolve(import.meta.dirname,'..'),read=file=>readFileSync(join(root,file),'utf8');
const dockerBin=process.env.SFSTORE_TEST_DOCKER;

test('combo: actual Auth, HTTP actions/services and PostgREST with isolated business database; no browser',{skip:!enabled,timeout:240000},async t=>{
 const run=randomUUID(),name=`sfstore-combo-http-${run.slice(0,8)}`,project='sfstore-checkout-synthetic-staging';
 const resources=[],users=[],results=[],requests={auth:0,rest:0,blocked:0};
 const work=join(root,'staging/runtime/combo-http',run);mkdirSync(work,{recursive:true});
 let db,proxy,next,auth,anonKey,serviceKey,jwtSecret,base,proxyUrl;
 function docker(args,env={}){const r=spawnSync(dockerBin,args,{encoding:'utf8',windowsHide:true,timeout:90000,env:{...process.env,...env}});assert.equal(r.status,0,'LOCAL_DOCKER_FAILED');return r.stdout.trim();}
 const inspect=n=>JSON.parse(docker(['inspect',n]))[0];
 const envOf=c=>Object.fromEntries(c.Config.Env.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 async function check(label,fn){await t.test(label,async()=>{try{await fn();results.push({label,passed:true});}catch(error){results.push({label,passed:false});throw error;}});}
 async function session(email,checkout=false){
  const created=await auth.auth.admin.createUser({email,email_confirm:true,user_metadata:{synthetic:true,purpose:'combo-local',run}});
  assert.equal(created.error,null,'LOCAL_AUTH_CREATE_FAILED');users.push(created.data.user.id);
  const link=await auth.auth.admin.generateLink({type:'magiclink',email});assert.equal(link.error,null,'LOCAL_AUTH_LINK_FAILED');
  const cookies=[],client=createServerClient(proxyUrl,anonKey,{...(checkout?{cookieOptions:{name:'sfstore-checkout-auth',httpOnly:true,path:'/'}}:{}),cookies:{getAll:()=>cookies,setAll:items=>{for(const item of items){const i=cookies.findIndex(v=>v.name===item.name);if(i>=0)cookies.splice(i,1);cookies.push(item);}}}});
  const verified=await client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});assert.equal(verified.error,null,'LOCAL_AUTH_VERIFY_FAILED');
  assert.equal((await client.auth.getUser()).data.user?.id,created.data.user.id);
  return {id:created.data.user.id,bearer:verified.data.session.access_token,cookie:cookies.filter(v=>v.value).map(v=>`${v.name}=${v.value}`).join(';')};
 }
 async function http(path,body,cookie){const r=await fetch(base+path,{method:'POST',redirect:'manual',headers:{'content-type':'application/json',origin:base,...(cookie?{cookie}: {})},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});let data;try{data=await r.json();}catch{throw new Error('LOCAL_APP_NON_JSON_RESPONSE');}return{status:r.status,data};}
 const probe=(body,cookie)=>http('/probe',body,cookie);
 const stock=async id=>Number((await q('select stock from products where id=$1',[id]))[0].stock);
 try{
  assert.ok(dockerBin,'LOCAL_DOCKER_PATH_REQUIRED');
  for(const file of ['.env','.env.local','.env.development','.env.development.local'])assert.equal(existsSync(join(root,file)),false,'REFUSE_WORKTREE_ENV');
  const rest=inspect(`supabase_rest_${project}`),au=inspect(`supabase_auth_${project}`),kong=inspect(`supabase_kong_${project}`);
  for(const c of [rest,au,kong])assert.equal(c.Config.Labels['com.supabase.cli.project'],project,'LOCAL_PROJECT_MISMATCH');
  assert.equal(envOf(au).GOTRUE_SECURITY_CAPTCHA_ENABLED,'true','CAPTCHA_MUST_REMAIN_ENABLED');
  assert.equal(new URL(envOf(au).GOTRUE_DB_DATABASE_URL).hostname,`supabase_db_${project}`,'AUTH_DATABASE_MUST_BE_LOCAL');
  assert.ok(kong.NetworkSettings.Ports['8000/tcp'].some(p=>p.HostPort==='54331'),'LOCAL_GATEWAY_PORT_MISMATCH');
  jwtSecret=envOf(rest).PGRST_JWT_SECRET;assert.ok(jwtSecret);
  const kongConfig=docker(['exec',kong.Id,'cat','/home/kong/kong.yml']);
  for(const token of kongConfig.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]){const p=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));assert.notEqual(p.ref,'xspvoicelbxlmtqoiolc');if(p.role==='anon')anonKey=token;if(p.role==='service_role')serviceKey=token;}
  assert.ok(anonKey&&serviceKey,'LOCAL_KEYS_REQUIRED');
  auth=createClient('http://127.0.0.1:54331',serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  docker(['network','create','--label',`sfstore.test.run=${run}`,name]);resources.push({type:'network',name});
  docker(['run','-d','--pull','never','--name',name+'-db','--network',name,'--network-alias','db','--label',`sfstore.test.run=${run}`,'--tmpfs','/var/lib/postgresql/data','--env','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:17.6']);resources.push({type:'container',name:name+'-db'});
  const port=Number(inspect(name+'-db').NetworkSettings.Ports['5432/tcp'][0].HostPort);
  for(let i=0;i<80;i++){const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',statement_timeout:15000});try{await c.connect();db=c;break;}catch{await c.end().catch(()=>{});await delay(250);}}assert.ok(db);
  await q('create role anon;create role authenticated;create role service_role bypassrls;create role authenticator login noinherit;grant anon,authenticated,service_role to authenticator;');
  await q(read('tests/fixtures/storage-permissions.sql'));
  for(const e of JSON.parse(read('staging/migration-manifest.json')).applicationOrder.filter(e=>e.source.split('/').at(-1)<'202610190001'))await q(read(e.stagingFile));
  await q(read('staging/supabase/seed.sql'));
  await q(read('supabase/migrations/202610190001_component_inventory.sql'));
  await q(read('supabase/migrations/202610200001_component_combo_pricing.sql'));
  docker(['run','-d','--pull','never','--name',name+'-rest','--network',name,'--label',`sfstore.test.run=${run}`,'-p','127.0.0.1::3000','--env','PGRST_DB_URI=postgres://authenticator@db:5432/postgres','--env','PGRST_DB_SCHEMAS=public','--env','PGRST_DB_ANON_ROLE=anon','--env','PGRST_JWT_SECRET',rest.Config.Image],{PGRST_JWT_SECRET:jwtSecret});resources.push({type:'container',name:name+'-rest'});
  const restUrl=`http://127.0.0.1:${inspect(name+'-rest').NetworkSettings.Ports['3000/tcp'][0].HostPort}`;
  for(let i=0;i<80;i++){try{if((await fetch(restUrl)).ok)break;}catch{}if(i===79)throw new Error('LOCAL_REST_NOT_READY');await delay(250);}
  proxy=createServer(async(req,res)=>{
   try{const url=new URL(req.url,'http://127.0.0.1');let target;
    if(url.pathname.startsWith('/rest/v1/')){target=restUrl+url.pathname.slice(8)+url.search;requests.rest++;}
    else if(url.pathname.startsWith('/auth/v1/')){target='http://127.0.0.1:54331'+url.pathname+url.search;requests.auth++;}
    else{requests.blocked++;res.writeHead(404);res.end();return;}
    const chunks=[];for await(const c of req)chunks.push(c);
    const headers=Object.fromEntries(Object.entries(req.headers).filter(([k])=>!['host','connection','content-length'].includes(k)));
    const r=await fetch(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),signal:AbortSignal.timeout(15000)});
    res.writeHead(r.status,{'content-type':r.headers.get('content-type')??'application/json'});res.end(Buffer.from(await r.arrayBuffer()));
   }catch{res.writeHead(502);res.end();}
  });await new Promise(r=>proxy.listen(0,'127.0.0.1',r));proxyUrl=`http://127.0.0.1:${proxy.address().port}`;
  const adminEmail=`combo-admin-${run}@staging.invalid`,admin=await session(adminEmail),buyer=await session(`combo-buyer-${run}@staging.invalid`,true);
  const harness=join(work,'harness');mkdirSync(join(harness,'app/probe'),{recursive:true});mkdirSync(join(harness,'app/api/checkout'),{recursive:true});
  writeFileSync(join(harness,'package.json'),JSON.stringify({name:'sfstore-local-combo-http',private:true}));
  writeFileSync(join(harness,'tsconfig.json'),JSON.stringify({extends:join(root,'tsconfig.json'),compilerOptions:{baseUrl:root,paths:{'@/*':[join(root,'*')]}},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts']}));
  writeFileSync(join(harness,'next.config.mjs'),`export default {devIndicators:false,webpack(c){c.resolve.alias['@']=${JSON.stringify(root.replaceAll('\\','/'))};return c;}};`);
  writeFileSync(join(harness,'app/layout.tsx'),'export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}');
  writeFileSync(join(harness,'app/api/checkout/route.ts'),"export {POST} from '@/app/api/checkout/route';");
  writeFileSync(join(harness,'app/probe/route.ts'),`
import {requireAdminActionSession} from '@/lib/admin-session';
import {createStoreSaleAction} from '@/app/admin/ventas/actions';
import {confirmPurchaseAction} from '@/app/admin/compras/actions';
import {saveComponentComposition} from '@/app/admin/compras/component-actions';
import {savePurchaseDraft,getPurchaseById} from '@/services/purchases';
import {getStoreSaleById} from '@/services/store-sales';
import {listComponentRecipes} from '@/services/component-inventory';
import {getComponentOffers} from '@/services/public-component-offers';
import {getBuyerCheckoutReceipt} from '@/services/checkout-buyer-receipt';
import {confirmManualCheckoutPayment} from '@/services/checkout-manual-admin';
export async function GET(){return Response.json({local:true});}
export async function POST(request:Request){try{
 const x=await request.json();
 if(x.op==='offers')return Response.json(await getComponentOffers(x.head));
 if(x.op==='receipt')return Response.json(await getBuyerCheckoutReceipt(x.order));
 const user=await requireAdminActionSession();
 const form=new FormData();for(const [k,v] of Object.entries(x.form??{}))for(const value of Array.isArray(v)?v:[v])form.append(k,String(value));
 if(x.op==='sale')return Response.json(await createStoreSaleAction({status:'idle',message:''},form));
 if(x.op==='purchase')return Response.json({id:await savePurchaseDraft({...x.input,createdBy:user.id})});
 if(x.op==='composition')return Response.json(await saveComponentComposition({message:'',success:false},form));
 if(x.op==='confirmPurchase')return Response.json(await confirmPurchaseAction({status:'idle',message:''},form));
 if(x.op==='purchaseDetail')return Response.json(await getPurchaseById(x.id));
 if(x.op==='saleDetail')return Response.json(await getStoreSaleById(x.id));
 if(x.op==='recipes')return Response.json(await listComponentRecipes());
 if(x.op==='payment')return Response.json(await confirmManualCheckoutPayment(x.input));
 return Response.json({error:'UNKNOWN_LOCAL_PROBE'},{status:400});
 }catch{return Response.json({error:'LOCAL_PROBE_REJECTED'},{status:403});}}
`);
  const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const appPort=listener.address().port;await new Promise(r=>listener.close(r));base=`http://127.0.0.1:${appPort}`;
  const env=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:proxyUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,SUPABASE_SERVICE_ROLE_KEY:serviceKey,ADMIN_ALLOWED_EMAILS:adminEmail,CHECKOUT_GUEST_ENABLED:'true',NEXT_TELEMETRY_DISABLED:'1'});
  next=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev',harness,'--hostname','127.0.0.1','--port',String(appPort),'--webpack'],{cwd:root,env,windowsHide:true,stdio:'ignore'});
  for(let i=0;i<120;i++){if(next.exitCode!==null)throw new Error('LOCAL_NEXT_STOPPED');try{if((await fetch(base+'/probe',{signal:AbortSignal.timeout(1200)})).ok)break;}catch{}if(i===119)throw new Error('LOCAL_NEXT_NOT_READY');await delay(250);}
  const category=randomUUID(),supplier=randomUUID();await q("insert into categories(id,name,slug) values($1,'SYNTHETIC COMPONENTS','mates')",[category]);
  await q("insert into suppliers(id,name,normalized_name) values($1::uuid,'SYNTHETIC',$1::text)",[supplier]);
  async function product(label,stock=0,cost=0,price=100){const id=randomUUID();await q("insert into products(id,category_id,name,slug,short_description,price,cost,stock,status) values($1::uuid,$2,$3,$1::text,'SYNTHETIC',$4,$5,$6,'active')",[id,category,'SYNTHETIC '+label,price,cost,stock]);return id;}
  const f={source:await product('SOURCE'),head:await product('HEAD',1,3650,22000),cc:await product('C-C',0,0,15800),lightning:await product('LIGHTNING',0,0,15800),presentation:await product('PRESENTATION'),legacy:await product('LEGACY'),other:await product('VAPER')};
  const po=(await q("select save_purchase_draft(null,$1,'2026-10-20',17000,'SYNTHETIC',$2,$3) id",[supplier,admin.id,JSON.stringify([{product_id:f.source,quantity:20,unit_purchase_cost:5957},{product_id:f.other,quantity:9,unit_purchase_cost:13443.5}])]))[0].id;
  await q('select confirm_purchase($1,$2)',[po,admin.id]);
  f.recipe=(await q("select register_component_recipe('SYNTHETIC CHARGER',$1,$2,$3,$4,$5,$6) id",[f.source,f.head,f.cc,f.lightning,f.presentation,f.legacy]))[0].id;
  const plan=(await q('select get_component_conversion_plan($1,$2,10,10) p',[po,f.recipe]))[0].p;
  await q('select apply_component_conversion($1,$2,$3,$4,10,10,$5)',[randomUUID(),admin.id,po,f.recipe,plan.fingerprint]);
  async function approve(){await q('select approve_component_prices($1,$2,$3,$4)',[randomUUID(),admin.id,f.recipe,JSON.stringify({[f.head]:22000,[f.cc]:15800,[f.lightning]:15800})]);}
  await approve();await q('select configure_component_combo_price($1,$2,$3,30666.67,23000,true)',[randomUUID(),admin.id,f.recipe]);
  const svc=createClient(proxyUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  await check('prepared Production state preflight executes read-only on the synthetic purchase without changes',async()=>{
   const before=await q('select id,stock,price,cost from products order by id');
   const script=read('reports/charger-components-release-state-read-only.sql').replace('aa56d2fc-ceda-4205-a52f-39c3f62102e5',po);
   const rows=(await db.query(script)).find(r=>r.command==='SELECT').rows;
   const result=rows[0].private_preflight;
   assert.equal(result.read_only,true);assert.equal(result.purchase.id,po);
   assert.equal(result.products.length,2);assert.ok(result.contracts.length>=9);
   assert.deepEqual(await q('select id,stock,price,cost from products order by id'),before);
  });
  await check('real Auth cookies authorize admin and reject signed non-admin/absent sessions',async()=>{
   assert.equal((await probe({op:'recipes'})).status,403);assert.equal((await probe({op:'recipes'},buyer.cookie)).status,403);
   const r=await probe({op:'recipes'},admin.cookie);assert.equal(r.status,200);assert.equal(r.data[0].combo_transfer_price,23000);
  });
  await check('public catalog offers preserve two connectors and special prices without exposing costs',async()=>{
   const r=await probe({op:'offers',head:f.head});assert.equal(r.status,200);assert.equal(r.data.length,2);
   assert.deepEqual(r.data.map(o=>o.connector).sort(),['cc','lightning']);
   assert.ok(r.data.every(o=>o.listPrice===30666.67&&o.transferPrice===23000&&o.head.price===22000&&o.cable.price===15800));
   assert.doesNotMatch(JSON.stringify(r.data),/unit_cost|cost_source|price_audit/);
  });
  let receiptId;
  await check('purchase service + composition action + confirmation action receive exact real components once',async()=>{
   const r=await probe({op:'purchase',input:{supplierId:supplier,purchaseDate:'2026-10-20',shippingCost:'0',notes:'SYNTHETIC',lines:[{productId:f.source,quantity:2,unitPurchaseCost:'6000'}]}},admin.cookie);
   assert.equal(r.status,200);receiptId=r.data.id;assert.ok(receiptId);
   const comp=await probe({op:'composition',form:{purchaseId:receiptId,recipeId:f.recipe,cc:1,lightning:1}},admin.cookie);assert.equal(comp.data.success,true);
   for(let i=0;i<2;i++){const confirmed=await probe({op:'confirmPurchase',form:{purchaseId:receiptId}},admin.cookie);assert.equal(confirmed.data.status,'success');}
   assert.equal(await stock(f.head),23);assert.equal(await stock(f.cc),11);assert.equal(await stock(f.lightning),11);assert.equal(await stock(f.source),0);
   const detail=await probe({op:'purchaseDetail',id:receiptId},admin.cookie);assert.equal(detail.data.status,'confirmed');
  });
  await check('confirmed receipt preserves the approved individual prices and combo rule',async()=>{
   const prices=await q('select id,price from products where id=any($1::uuid[])',[[f.head,f.cc,f.lightning]]);
   assert.ok(prices.every(p=>Number(p.price)===(p.id===f.head?22000:15800)));
   assert.equal((await probe({op:'offers',head:f.head})).data.length,2);
  });
  const saleForm=(connector='cc',unit=23000,methods=['cash','transfer'],amounts=[10000,13000])=>({idempotencyKey:randomUUID(),customerName:'SYNTHETIC',notes:'SYNTHETIC',productId:[f.presentation],quantity:[1],unitPrice:[unit],comboConnector:[connector],paymentMethod:methods,paymentAmount:amounts});
  await check('actual physical-sale action charges mixed cash/transfer once and retries do not duplicate stock',async()=>{
   const form=saleForm(),r=await probe({op:'sale',form},admin.cookie);assert.equal(r.data.status,'success');
   const again=await probe({op:'sale',form},admin.cookie);assert.equal(again.data.orderId,r.data.orderId);assert.equal(await stock(f.head),22);assert.equal(await stock(f.cc),10);
   const detail=await probe({op:'saleDetail',id:r.data.orderId},admin.cookie);assert.equal(Number(detail.data.total),23000);assert.equal(detail.data.order_items.length,2);assert.ok(detail.data.order_items.every(l=>l.combo_price_snapshot));
   assert.equal(detail.data.order_payments.reduce((n,p)=>n+Number(p.amount),0),23000);
  });
  await check('actual physical-sale action applies full list for any debit and rejects double discount',async()=>{
   const r=await probe({op:'sale',form:saleForm('lightning',30666.67,['cash','debit'],[10000,20666.67])},admin.cookie);assert.equal(r.data.status,'success');
   const detail=await probe({op:'saleDetail',id:r.data.orderId},admin.cookie);assert.equal(Number(detail.data.total),30666.67);
   const before=await stock(f.head);const bad=await probe({op:'sale',form:saleForm('cc',17250,['cash'],[17250])},admin.cookie);assert.equal(bad.data.status,'error');assert.equal(await stock(f.head),before);
  });
  // Exercise the real Zustand cart and serializer; no browser or desktop automation.
  const require=createRequire(import.meta.url),memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  function load(file,modules,globals){const out={},code=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',...Object.keys(globals),code)(n=>Object.hasOwn(modules,n)?modules[n]:require(n),out,...Object.values(globals));return out;}
  const {useCartStore}=load('store/cart-store.ts',{'@/lib/products/component-combos':componentHelpers},{localStorage:storage});
  const {createOrderFromCheckout}=load('services/orders.ts',{}, {sessionStorage:storage,fetch:(url,options)=>fetch(base+url,{...options,headers:{...options.headers,origin:base,cookie:buyer.cookie}})});
  const offers=(await probe({op:'offers',head:f.head})).data;
  let order;
  await check('real cart -> serializer -> checkout HTTP -> real Auth -> PostgREST -> RPC -> frozen receipt',async()=>{
   for(const connector of ['cc','lightning']){const offer=offers.find(o=>o.connector===connector);assert.equal(useCartStore.getState().addCombo(offer.presentationId,offer.name,connector,offer.listPrice,offer.priceVersion,offer.head,offer.cable),true);}
   const input={customer:{fullName:'SYNTHETIC',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:useCartStore.getState().items};
   order=await createOrderFromCheckout(input);assert.equal(order.total,46000);assert.equal(order.subtotal,61333.34);
   const before=await stock(f.head),retry=await createOrderFromCheckout(input);assert.equal(retry.id,order.id);assert.equal(await stock(f.head),before);
   const own=await probe({op:'receipt',order:order.id},buyer.cookie);assert.equal(own.data.total,46000);assert.equal(own.data.lines.length,4);assert.equal(new Set(own.data.lines.map(l=>l.combo_group)).size,2);
   assert.equal((await probe({op:'receipt',order:order.id},admin.cookie)).data,null);
   assert.doesNotMatch(JSON.stringify(own.data),/unit_cost|cost_source/);
  });
  await check('checkout rejects absent Auth and unsupported extra discounts without a write',async()=>{
   const before=(await q('select count(*)::int n from orders'))[0].n;
   const input={operationKey:randomUUID(),customer:{fullName:'SYNTHETIC',phone:'TEST'},paymentMethod:'transfer',shipping:{method:'pickup'},items:[{productId:f.presentation,quantity:1,comboConnector:'cc'}]};
   assert.equal((await http('/api/checkout',input)).status,401);
   assert.equal((await http('/api/checkout',{...input,coupon:'EXTRA25'},buyer.cookie)).status,400);
   assert.equal((await q('select count(*)::int n from orders'))[0].n,before);
  });
  await check('admin payment confirmation through real Auth/PostgREST is idempotent and never deducts again',async()=>{
   const before=await stock(f.head),input={orderId:order.id,operationKey:randomUUID(),amount:46000,reference:'SYNTHETIC NO MONEY',received:true};
   assert.equal((await probe({op:'payment',input},buyer.cookie)).status,403);
   for(let i=0;i<2;i++)assert.equal((await probe({op:'payment',input},admin.cookie)).status,200);
   assert.equal(await stock(f.head),before);assert.equal((await q('select payment_status from orders where id=$1',[order.id]))[0].payment_status,'paid');
  });
  await check('PostgREST public identities cannot mutate recipe or execute protected combo RPCs',async()=>{
   for(const token of [anonKey,buyer.bearer,admin.bearer]){const response=await fetch(proxyUrl+'/rest/v1/rpc/configure_component_combo_price',{method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({p_key:randomUUID(),p_actor:admin.id,p_recipe:f.recipe,p_list:32000,p_target:24000,p_enabled:true})});assert.ok([401,403,404].includes(response.status));}
   const r=await svc.from('component_combo_pricing').select('list_price,transfer_target').eq('recipe_id',f.recipe).single();assert.equal(r.error,null);assert.equal(Number(r.data.transfer_target),23000);
  });
  assert.ok(requests.auth>0&&requests.rest>0);assert.equal(requests.blocked,0);
 }finally{
  if(next?.pid)spawnSync('taskkill',['/PID',String(next.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}
  await db?.end();
  for(const id of users){const removed=await auth.auth.admin.deleteUser(id);assert.equal(removed.error,null,'LOCAL_AUTH_CLEANUP_FAILED');}
  for(const resource of resources.reverse()){if(resource.type==='container'){assert.equal(inspect(resource.name).Config.Labels['sfstore.test.run'],run);docker(['rm','-f',resource.name]);}else docker(['network','rm',resource.name]);}
  writeFileSync(join(work,'result-sanitized.json'),JSON.stringify({run,localOnly:true,postgres:'17.6',browserUsed:false,authSessionMethod:'real Auth magiclink/OTP; no CAPTCHA bypass or configuration changes',guestCaptchaValidated:false,checks:results,passed:results.length===11&&results.every(r=>r.passed),requests,cleanupCompleted:true,finishedAt:new Date().toISOString()},null,2));
 }
});
