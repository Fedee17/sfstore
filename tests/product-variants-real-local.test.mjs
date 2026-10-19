import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createRequire} from 'node:module';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
const enabled=process.env.SFSTORE_REAL_LOCAL_VARIANTS==='true';
const root=resolve(import.meta.dirname,'..');
test('variant admin: actual UI, admin Auth, PostgREST and isolated PostgreSQL17.6',{skip:!enabled,timeout:360000},async t=>{
 const run=randomUUID(),name=`sfstore-variants-ui-${run.slice(0,8)}`,project='sfstore-checkout-synthetic-staging';
 const work=join(root,'staging/runtime/variants-integration',run);mkdirSync(work,{recursive:true});
 const resources=[],users=[];let db,proxy,next,browser,auth,output='',serviceKey,anonKey,jwtSecret;
 const base='http://127.0.0.1:3161';
 function docker(args,env={}){const r=spawnSync('docker',args,{encoding:'utf8',timeout:60000,windowsHide:true,env:{...process.env,...env}});if(r.status!==0)throw new Error('LOCAL_DOCKER_FAILED');return r.stdout.trim();}
 const inspect=n=>JSON.parse(docker(['inspect',n]))[0];
 const envOf=d=>Object.fromEntries(d.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
 async function q(s,args=[]){return(await db.query(s,args)).rows;}
 async function session(email,url){
  const user=await auth.auth.admin.createUser({email,email_confirm:true,user_metadata:{synthetic:true,purpose:'variants-phase1-and2',run}});assert.equal(user.error,null,'LOCAL_AUTH_CREATE_FAILED');users.push(user.data.user.id);
  const link=await auth.auth.admin.generateLink({type:'magiclink',email});assert.equal(link.error,null,'LOCAL_AUTH_LINK_FAILED');
  const cookies=[];const client=createServerClient(url,anonKey,{cookies:{getAll:()=>cookies,setAll:items=>{for(const item of items){const i=cookies.findIndex(v=>v.name===item.name);if(i<0)cookies.push(item);else cookies[i]=item;}}}});
  const verified=await client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});assert.equal(verified.error,null,'LOCAL_AUTH_VERIFY_FAILED');
  return cookies.filter(v=>v.value).map(v=>({name:v.name,value:v.value,url:base,httpOnly:!!v.options.httpOnly,sameSite:'Lax'}));
 }
 try{
  assert.equal(docker(['context','show']),'desktop-linux');assert.ok(!process.env.DOCKER_HOST||process.env.DOCKER_HOST.startsWith('npipe:'));
  for(const f of ['.env','.env.local','.env.development','.env.development.local'])assert.equal(existsSync(join(root,f)),false,'REFUSE_ENV_FILE');
  const rest=inspect(`supabase_rest_${project}`),au=inspect(`supabase_auth_${project}`),kong=inspect(`supabase_kong_${project}`);
  for(const x of [rest,au,kong])assert.equal(x.Config.Labels['com.supabase.cli.project'],project);
  assert.equal(envOf(au).GOTRUE_SECURITY_CAPTCHA_ENABLED,'true');jwtSecret=envOf(rest).PGRST_JWT_SECRET;assert.ok(jwtSecret);
  const config=docker(['exec',kong.Id,'cat','/home/kong/kong.yml']);
  for(const token of config.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]){const p=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));assert.notEqual(p.ref,'xspvoicelbxlmtqoiolc');if(p.role==='service_role')serviceKey=token;if(p.role==='anon')anonKey=token;}
  assert.ok(serviceKey&&anonKey);auth=createClient('http://127.0.0.1:54331',serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  docker(['network','create','--label',`sfstore.test.run=${run}`,name]);resources.push({type:'network',name});
  docker(['run','-d','--pull','never','--name',name+'-db','--network',name,'--network-alias','db','--label',`sfstore.test.run=${run}`,'--tmpfs','/var/lib/postgresql/data','--env','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:17.6']);resources.push({type:'container',name:name+'-db'});
  const port=Number(inspect(name+'-db').NetworkSettings.Ports['5432/tcp'][0].HostPort);
  for(let i=0;i<60;i++){const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',statement_timeout:15000});try{await c.connect();db=c;break;}catch{await c.end().catch(()=>{});await delay(250);}}assert.ok(db);
  await q('create role anon;create role authenticated;create role service_role bypassrls;create role authenticator login noinherit;grant anon,authenticated,service_role to authenticator;');
  await q(readFileSync(join(root,'tests/fixtures/storage-permissions.sql'),'utf8'));
  const manifest=JSON.parse(readFileSync(join(root,'staging/migration-manifest.json'),'utf8'));for(const e of manifest.applicationOrder)await q(readFileSync(join(root,e.stagingFile),'utf8'));
  const cat=randomUUID();await q("insert into categories(id,name,slug) values($1,'Mates sintéticos','mates')",[cat]);
  await q("insert into checkout_configuration(id,enabled,reservation_seconds,price_policy,buyer_authorization,delivery_options,approved_revision) values($1,true,86400,'manual_25_frozen','authenticated','[{\"method\":\"pickup\",\"fee\":0}]','SYNTHETIC-VARIANTS-NOT-COMMERCIAL')",[randomUUID()]);
  docker(['run','-d','--pull','never','--name',name+'-rest','--label',`sfstore.test.run=${run}`,'--network',name,'-p','127.0.0.1::3000','--env','PGRST_DB_URI=postgres://authenticator@db:5432/postgres','--env','PGRST_DB_SCHEMAS=public','--env','PGRST_DB_ANON_ROLE=anon','--env','PGRST_JWT_SECRET','public.ecr.aws/supabase/postgrest:v16.4'],{PGRST_JWT_SECRET:jwtSecret});resources.push({type:'container',name:name+'-rest'});
  const restUrl=`http://127.0.0.1:${inspect(name+'-rest').NetworkSettings.Ports['3000/tcp'][0].HostPort}`;
  for(let i=0;i<60;i++){try{if((await fetch(restUrl)).ok)break;}catch{}if(i===59)throw new Error('LOCAL_REST_NOT_READY');await delay(250);}
  proxy=createServer(async(req,res)=>{
   try{const u=new URL(req.url,'http://127.0.0.1');let target;
    if(u.pathname.startsWith('/rest/v1/'))target=restUrl+u.pathname.slice(8)+u.search;
    else if(u.pathname.startsWith('/auth/v1/'))target='http://127.0.0.1:54331'+u.pathname+u.search;
    else {res.writeHead(404);return res.end();}
    const chunks=[];for await(const c of req)chunks.push(c);
    const headers=Object.fromEntries(Object.entries(req.headers).filter(([k])=>!['host','connection','content-length'].includes(k)));
    const r=await fetch(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),signal:AbortSignal.timeout(15000)});
    const h={'content-type':r.headers.get('content-type')??'application/json'};if(r.headers.has('content-range'))h['content-range']=r.headers.get('content-range');
    res.writeHead(r.status,h);res.end(Buffer.from(await r.arrayBuffer()));
   }catch{res.writeHead(502);res.end();}
  });await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const proxyUrl=`http://127.0.0.1:${proxy.address().port}`;
  const email=`variants-${run}@staging.invalid`;const cookies=await session(email,proxyUrl),other=await session(`other-${run}@staging.invalid`,proxyUrl);
  const harness=join(work,'harness');mkdirSync(join(harness,'app/admin/login'),{recursive:true});
  writeFileSync(join(harness,'package.json'),JSON.stringify({name:'sfstore-variants-local',private:true}));
  writeFileSync(join(harness,'tsconfig.json'),JSON.stringify({extends:join(root,'tsconfig.json'),compilerOptions:{baseUrl:root,paths:{'@/*':[join(root,'*')]}},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts']}));
  writeFileSync(join(harness,'next.config.mjs'),`export default {devIndicators:false,webpack(c){c.resolve.alias['@']=${JSON.stringify(root.replaceAll('\\','/'))};return c;}};`);
  writeFileSync(join(harness,'postcss.config.mjs'),readFileSync(join(root,'postcss.config.mjs'),'utf8'));
  writeFileSync(join(harness,'app/layout.tsx'),'import "@/app/globals.css";export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}');
  writeFileSync(join(harness,'app/admin/login/page.tsx'),'export default function Login(){return <p>LOCAL AUTH REQUIRED</p>}');
  for(const route of ['productos/familias','productos/familias/[id]','productos/[id]/editar','compras/nueva','compras/[id]','ventas/nueva','ventas/[id]','analytics']){const dir=join(harness,'app/admin',route);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'page.tsx'),`export {default} from '@/app/admin/${route}/page';`);}
  for(const route of ['mates','producto/[slug]','carrito','checkout','checkout/exito']){const dir=join(harness,'app',route);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'page.tsx'),`export const dynamic='force-dynamic';export {default} from '@/app/${route}/page';`);}
  for(const route of ['checkout','checkout/session']){const dir=join(harness,'app/api',route);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'route.ts'),`export {POST} from '@/app/api/${route}/route';`);}
  mkdirSync(join(harness,'public'),{recursive:true});for(const [color,fill] of [['black','black'],['green','green']])writeFileSync(join(harness,'public',color+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${fill}"/><text x="20" y="150" fill="white">SYNTHETIC ${color}</text></svg>`);
  mkdirSync(join(harness,'app/import-probe'),{recursive:true});writeFileSync(join(harness,'app/import-probe/route.ts'),'import {requireAdminActionSession} from "@/lib/admin-session";import {syncImportedProductRows} from "@/services/product-import";export async function POST(req:Request){await requireAdminActionSession();const input=await req.json();return Response.json(await syncImportedProductRows("Precios Productos",[{rowNumber:1,row:{Producto:input.name,"PRECIO LISTA":999,"PRECIO EFECTIVO":1}}]));}');
  // Actual administrative action in a local probe, to test denied calls before any RPC.
  mkdirSync(join(harness,'app/denied'),{recursive:true});writeFileSync(join(harness,'app/denied/route.ts'),'import {saveFamily} from "@/app/admin/productos/familias/actions";export async function POST(){try{await saveFamily({ok:false,message:""},new FormData());return Response.json({denied:false})}catch{return Response.json({denied:true},{status:403})}}');
  const env=Object.fromEntries(['PATH','Path','SystemRoot','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:proxyUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,SUPABASE_SERVICE_ROLE_KEY:serviceKey,ADMIN_ALLOWED_EMAILS:email,NEXT_TELEMETRY_DISABLED:'1'});
  try{await fetch(base,{signal:AbortSignal.timeout(500)});throw new Error('LOCAL_PORT_IN_USE');}catch(e){if(e.message==='LOCAL_PORT_IN_USE')throw e;}
  // Use a built server: dev HMR can reload a tab while a lazily compiled POST
  // has already committed, hiding its response from the browser test.
  const built=spawnSync(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'build',harness,'--webpack'],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:180000});
  output=(built.stdout??'')+(built.stderr??'');assert.equal(built.status,0,'LOCAL_PRODUCTION_HARNESS_BUILD_FAILED');
  next=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'start',harness,'--hostname','127.0.0.1','--port','3161'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  next.stdout.on('data',x=>{output=(output+x).slice(-16000);});next.stderr.on('data',x=>{output=(output+x).slice(-16000);});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/admin/login',{signal:AbortSignal.timeout(1000)})).status===200)break;}catch{}if(next.exitCode!==null||i===99)throw new Error('LOCAL_NEXT_NOT_READY');await delay(300);}
  const require=createRequire(import.meta.url);const {chromium}=require(process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,channel:'msedge'});
  const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await context.addCookies(cookies);
  const page=await context.newPage();page.setDefaultTimeout(30000);
  async function ready(p){
   await p.waitForLoadState('domcontentloaded');
   // Next production prefetch can keep the network busy indefinitely. Wait for
   // the real form hydration instead of treating network idleness as readiness.
   await p.waitForFunction(()=>{const field=document.querySelector('main input:not([type=hidden]),main select');return !field||Object.keys(field).some(k=>k.startsWith('__reactProps$'));});
  }
  await t.test('no-session and nonallowlisted user denied; actual Server Action denies unauthenticated call',async()=>{
   assert.equal((await fetch(base+'/denied',{method:'POST'})).status,403);
   const c=await browser.newContext();const p=await c.newPage();await p.goto(base+'/admin/productos/familias');await p.waitForURL(/admin\/login/);await c.addCookies(other);await p.goto(base+'/admin/productos/familias');await p.waitForURL(/admin\/login/);await c.close();
   assert.equal((await q('select count(*)::int n from product_families'))[0].n,0);
  });
  await t.test('real family create and option definition through Server Actions and PostgREST',async()=>{
   await page.goto(base+'/admin/productos/familias');await ready(page);const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Crear familia',exact:true})});
   await form.getByLabel('Nombre',{exact:true}).fill('SYNTHETIC Termo Stanley 1L — Pico MateSystem');await form.getByLabel('Precio base de lista').fill('100');await form.getByRole('button',{name:'Guardar',exact:true}).click();await form.getByRole('status').waitFor();await form.getByRole('link',{name:'Ver familia actualizada'}).click();await ready(page);
   const opts=page.locator('form').filter({has:page.getByRole('heading',{name:'Agregar opción',exact:true})});await opts.getByLabel('Nombre (por ejemplo, Color)').fill('Color');await opts.getByLabel('Valores, uno por renglón').fill('Negro\nVerde');await opts.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('heading',{name:'Color: Negro, Verde',exact:true}).waitFor();
   assert.equal((await q('select count(*)::int n from product_families'))[0].n,1);
  });
  await t.test('new SKU inherits list price, begins draft and stock zero; duplicate combination rejected visibly',async()=>{
   let form=page.locator('form').filter({has:page.getByRole('heading',{name:'Agregar SKU',exact:true})});await form.getByLabel('Nombre específico').fill('SYNTHETIC Stanley Negro');await form.getByLabel('SKU único').fill('SYNTHETIC-STANLEY-NEGRO');await form.getByLabel('Color',{exact:true}).selectOption({label:'Negro'});await form.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('heading',{name:'SYNTHETIC Stanley Negro',exact:true}).waitFor();
   const p=(await q("select * from products where sku='SYNTHETIC-STANLEY-NEGRO'"))[0];assert.equal(p.price,'100.00');assert.equal(p.stock,0);assert.equal(p.cost,null);assert.equal(p.status,'draft');
   await page.reload();await ready(page);form=page.locator('form').filter({has:page.getByRole('heading',{name:'Agregar SKU',exact:true})});await form.getByLabel('Nombre específico').fill('SYNTHETIC Duplicate');await form.getByLabel('SKU único').fill('SYNTHETIC-DUPLICATE');await form.getByLabel('Color',{exact:true}).selectOption({label:'Negro'});await form.getByRole('button',{name:'Guardar',exact:true}).click();await form.getByRole('alert').waitFor();assert.match(await form.getByRole('alert').textContent(),/Ya existe/);assert.equal((await q('select count(*)::int n from products'))[0].n,1);
  });
  await t.test('exception price and base change keep independent prices and stock',async()=>{
   await page.reload();await ready(page);const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Agregar SKU',exact:true})});await form.getByLabel('Nombre específico').fill('SYNTHETIC Stanley Verde');await form.getByLabel('SKU único').fill('SYNTHETIC-STANLEY-VERDE');await form.getByLabel('Color',{exact:true}).selectOption({label:'Verde'});await form.getByLabel(/Heredar precio base/).uncheck();await form.getByLabel(/Excepción de precio lista/).fill('125');await form.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('heading',{name:'SYNTHETIC Stanley Verde',exact:true}).waitFor();
   const fam=page.locator('form').filter({has:page.getByRole('heading',{name:'Editar familia',exact:true})});await fam.getByLabel('Precio base de lista').fill('100.01');await fam.getByRole('button',{name:'Guardar',exact:true}).click();await fam.getByRole('status').waitFor();
   const rows=await q('select sku,price,stock from products order by sku');assert.equal(rows[0].price,'100.01');assert.equal(rows[1].price,'125.00');assert.ok(rows.every(p=>p.stock===0));
  });
  await t.test('availability flags and existing photo editor usable on notebook and mobile',async()=>{
   await page.reload();await ready(page);const form=page.locator('form').filter({has:page.getByRole('heading',{name:'SYNTHETIC Stanley Verde',exact:true})});await form.getByLabel(/Bloqueado para nuevas ventas/).check();await form.getByRole('button',{name:'Guardar',exact:true}).click();await form.getByRole('status').waitFor();assert.equal((await q("select commercial_blocked from products where sku='SYNTHETIC-STANLEY-VERDE'"))[0].commercial_blocked,true);
   for(const [width,height] of [[1366,900],[390,844]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:join(work,`families-${width}.png`),fullPage:true});}
   const link=page.locator('form').filter({has:page.getByRole('heading',{name:'SYNTHETIC Stanley Negro',exact:true})}).getByRole('link',{name:'Editar fotografías y datos del SKU'});await link.click();await page.getByRole('heading',{name:'Editar producto',exact:true}).waitFor();assert.ok(await page.locator('[name=productId]').count());
   assert.equal((await q('select count(*)::int n from inventory_movements'))[0].n,0);assert.equal((await q('select count(*)::int n from orders'))[0].n,0);
  });
  await t.test('explicitly associate a simple SKU without redistributing its stock or price',async()=>{
   const product=randomUUID();await q("insert into products(id,category_id,name,slug,short_description,sku,price,stock,status) values($1::uuid,$2,'SYNTHETIC EXISTING SKU',$1::text,'SYNTHETIC','SYNTHETIC-EXISTING',99.98,7,'draft')",[product,cat]);
   const fam=(await q('select id from product_families'))[0].id;await page.goto(base+'/admin/productos/familias/'+fam);await ready(page);
   const values=page.locator('form').filter({has:page.getByRole('heading',{name:'Color: Negro, Verde',exact:true})});await values.getByLabel('Nuevo valor').fill('Azul');await values.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('heading',{name:'Color: Negro, Verde, Azul',exact:true}).waitFor();
   await page.getByLabel('Nombre o SKU',{exact:true}).fill('SYNTHETIC-EXISTING');await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('link',{name:/SYNTHETIC EXISTING SKU/}).click();await ready(page);
   const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Asociar SYNTHETIC EXISTING SKU',exact:true})});await form.getByLabel('Color',{exact:true}).selectOption({label:'Azul'});await form.getByRole('button',{name:'Guardar',exact:true}).click();
   await page.getByRole('heading',{name:'SYNTHETIC EXISTING SKU',exact:true}).waitFor();const p=(await q('select stock,price,list_price_override,cost,family_id from products where id=$1',[product]))[0];assert.equal(p.stock,7);assert.equal(p.price,'99.98');assert.equal(p.list_price_override,'99.98');assert.equal(p.cost,null);assert.equal(p.family_id,fam);
  });
  const family=(await q('select id,slug,name from product_families'))[0];
  const black=(await q("select id,sku from products where sku='SYNTHETIC-STANLEY-NEGRO'"))[0],green=(await q("select id,sku from products where sku='SYNTHETIC-STANLEY-VERDE'"))[0];
  await q('update product_families set base_price=100 where id=$1',[family.id]);
  await q("update products set status='active',web_visible=true,commercial_blocked=false,stock=3 where id=any($1::uuid[])",[[black.id,green.id]]);
  for(const [p,color] of [[black,'black'],[green,'green']])await q('insert into product_images(product_id,url,alt,is_primary) values($1,$2,$3,true)',[p.id,base+'/'+color+'.svg','SYNTHETIC '+color]);
  const buyer=await browser.newContext();await buyer.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await buyer.addCookies(other);const shop=await buyer.newPage();shop.setDefaultTimeout(30000);
  await t.test('one public family card; explicit color selection changes photo, price, availability and stores distinct SKU in cart',async()=>{
   await shop.goto(base+'/mates');await ready(shop);assert.equal(await shop.getByRole('link',{name:'Ver producto '+family.name,exact:true}).count(),1);
   await shop.getByRole('link',{name:'Ver producto '+family.name,exact:true}).click();await ready(shop);assert.equal(await shop.getByRole('button',{name:'Seleccioná una variante',exact:true}).isDisabled(),true);
   await shop.getByLabel('Color',{exact:true}).selectOption('Negro');assert.match(await shop.getByTestId('variant-transfer-price').textContent(),/75/);assert.match(await shop.getByTestId('variant-stock').textContent(),/3/);assert.ok(await shop.locator('img[src$="black.svg"]').count());
   await shop.getByRole('button',{name:/Agregar .* al carrito/}).click();
   await shop.getByLabel('Color',{exact:true}).selectOption('Verde');assert.match(await shop.getByTestId('variant-transfer-price').textContent(),/93,75/);assert.ok(await shop.locator('img[src$="green.svg"]').count());await shop.getByRole('button',{name:/Agregar .* al carrito/}).click();
   const ids=await shop.evaluate(()=>JSON.parse(localStorage.getItem('sfstore-cart')).state.items.map(p=>p.productId));assert.deepEqual(new Set(ids),new Set([black.id,green.id]));assert.ok(!ids.includes(family.id));
   for(const [width,height] of [[1366,900],[390,844]]){await shop.setViewportSize({width,height});await shop.getByLabel('Color',{exact:true}).selectOption('Negro');await shop.getByLabel('Color',{exact:true}).selectOption('Verde');assert.equal(await shop.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shop.screenshot({path:join(work,`public-family-${width}.png`),fullPage:true});}
  });
  await t.test('purchase selector distinguishes two variants and existing receipt RPC receives each SKU once',async()=>{
   const supplier=randomUUID();await q("insert into suppliers(id,name,normalized_name) values($1::uuid,'SYNTHETIC VARIANT SUPPLIER',$1::text)",[supplier]);
   await page.goto(base+'/admin/compras/nueva');await ready(page);await page.locator('[name=supplierId]').selectOption(supplier);await page.locator('[name=purchaseDate]').fill('2026-10-18');
   await page.getByRole('searchbox').first().fill(black.sku);await page.getByRole('button',{name:/Color: Negro/}).click();await page.locator('[name=quantity]').first().fill('1');await page.locator('[name=unitPurchaseCost]').first().fill('40');
   await page.getByRole('button',{name:/Agregar.*producto|Agregar.*línea|Agregar.*linea/}).click();await page.getByRole('searchbox').nth(1).fill(green.sku);await page.getByRole('button',{name:/Color: Verde/}).click();await page.locator('[name=quantity]').nth(1).fill('2');await page.locator('[name=unitPurchaseCost]').nth(1).fill('50');await page.locator('[name=shippingCost]').fill('0');
   await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.waitForURL(/admin\/compras\/[a-f0-9-]{36}$/);const purchase=page.url().split('/').at(-1);
   page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirmar compra',exact:true}).click();await page.getByText('Confirmada',{exact:true}).waitFor();
   const lines=await q('select product_id,quantity,family_id_snapshot from purchase_items where purchase_id=$1',[purchase]);assert.equal(lines.length,2);assert.ok(lines.every(l=>l.family_id_snapshot===family.id));assert.equal((await q('select stock from products where id=$1',[black.id]))[0].stock,4);assert.equal((await q('select stock from products where id=$1',[green.id]))[0].stock,5);
  });
  await t.test('physical sale search identifies variant, combined cash/transfer keeps 25% and freezes cost',async()=>{
   await page.goto(base+'/admin/ventas/nueva');await ready(page);await page.getByRole('searchbox').fill(green.sku);await page.getByRole('button',{name:/Color: Verde/}).click();await page.locator('[name=quantity]').fill('1');
   await page.getByRole('button',{name:'Agregar otro medio',exact:true}).click();await page.locator('[name=paymentMethod]').nth(0).selectOption('cash');await page.locator('[name=paymentMethod]').nth(1).selectOption('transfer');await page.locator('[name=paymentAmount]').nth(0).fill('50');await page.locator('[name=paymentAmount]').nth(1).fill('43.75');
   await page.getByRole('button',{name:'Registrar venta',exact:true}).click();await page.getByRole('link',{name:'Ver venta',exact:true}).waitFor();const href=await page.getByRole('link',{name:'Ver venta',exact:true}).getAttribute('href');const order=href.split('/').at(-1);
   const o=(await q('select total,discount from orders where id=$1',[order]))[0];assert.equal(o.total,'93.75');assert.equal(o.discount,'31.25');const l=(await q('select product_id,family_id_snapshot,unit_cost_snapshot from order_items where order_id=$1',[order]))[0];assert.equal(l.product_id,green.id);assert.equal(l.family_id_snapshot,family.id);assert.equal(l.unit_cost_snapshot,'50.00');
  });
  await t.test('cart -> checkout -> order -> own receipt identifies both variants through real HTTP and verified buyer session',async()=>{
   await shop.goto(base+'/checkout');await ready(shop);await shop.getByLabel('Nombre completo',{exact:true}).fill('SYNTHETIC VARIANT BUYER');await shop.getByLabel('Teléfono',{exact:true}).fill('TEST-ONLY');
   const submitted=shop.waitForResponse(r=>r.url().endsWith('/api/checkout')&&r.request().method()==='POST');
   await shop.getByRole('button',{name:'Preparar pedido por transferencia',exact:true}).click();const response=await submitted;const result=await response.json();assert.equal(response.status(),200,JSON.stringify({code:result.code,error:result.error}));await shop.waitForURL(/checkout\/exito\?order=/);await shop.getByRole('heading',{name:'Esperando transferencia',exact:true}).waitFor();
   assert.match(await shop.getByRole('list',{name:'Productos del pedido'}).textContent(),/Color: Negro/);assert.match(await shop.getByRole('list',{name:'Productos del pedido'}).textContent(),/Color: Verde/);
   const order=new URL(shop.url()).searchParams.get('order');const lines=await q('select product_id,family_id_snapshot,variant_options_snapshot from order_items where order_id=$1',[order]);assert.equal(lines.length,2);assert.ok(lines.every(l=>l.family_id_snapshot===family.id));assert.equal((await q('select total from orders where id=$1',[order]))[0].total,'168.75');
   const beforeRetry=await q('select id,stock from products where id=any($1::uuid[]) order by id',[[black.id,green.id]]);
   const retried=await buyer.request.post(base+'/api/checkout',{headers:{origin:base},data:response.request().postDataJSON()});assert.equal(retried.status(),200);assert.equal((await retried.json()).id,order);
   assert.deepEqual(await q('select id,stock from products where id=any($1::uuid[]) order by id',[[black.id,green.id]]),beforeRetry);
  });
  await t.test('real import service rejects variant/family overwrites and Analytics groups only frozen family snapshots',async()=>{
   const before=await q('select id,price,stock,cost from products where id=any($1::uuid[]) order by id',[[black.id,green.id]]);
   for(const name of ['SYNTHETIC Stanley Negro',family.name]){const r=await context.request.post(base+'/import-probe',{data:{name}});assert.equal(r.status(),200);const data=await r.json();assert.equal(data.review,1);assert.equal(data.updated,0);assert.equal(data.created,0);}
   assert.deepEqual(await q('select id,price,stock,cost from products where id=any($1::uuid[]) order by id',[[black.id,green.id]]),before);
   await page.goto(base+'/admin/analytics?month=2026-10');await ready(page);await page.getByRole('heading',{name:'Familias documentadas',exact:true}).waitFor();assert.ok(await page.getByText(family.name,{exact:true}).count());
  });
  await buyer.close();
 }finally{
  writeFileSync(join(work,'server-private.log'),output);await browser?.close();
  if(next?.pid)spawnSync('taskkill',['/PID',String(next.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  if(proxy)await new Promise(r=>proxy.close(r));await db?.end();
  for(const id of users)await auth.auth.admin.deleteUser(id);
  for(const r of resources.reverse()){if(r.type==='container'){const i=inspect(r.name);assert.equal(i.Config.Labels['sfstore.test.run'],run);docker(['rm','-f',r.name]);}else docker(['network','rm',r.name]);}
 }
});
