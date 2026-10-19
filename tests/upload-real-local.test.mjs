import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync,spawn} from 'node:child_process';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import XLSX from 'xlsx';
const require=createRequire(import.meta.url);
test('real local bounded uploads, protected proofs and administrative Excel previews', {skip:process.env.SFSTORE_UPLOAD_REAL_LOCAL!=='true',timeout:150000}, async t=>{
 const docker='C:/Users/feder/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
 const inspect=name=>{const c=JSON.parse(execFileSync(docker,['inspect',name],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];assert.ok(c.Name==='/'+name&&c.State.Running,'LOCAL_CONTAINER_REQUIRED');return Object.fromEntries(c.Config.Env.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}));};
 const dbEnv=inspect('supabase_db_sfstore-checkout-synthetic-staging'),authEnv=inspect('supabase_auth_sfstore-checkout-synthetic-staging');
 const db=new Client({host:'127.0.0.1',port:54332,user:'postgres',database:'postgres',password:dbEnv.POSTGRES_PASSWORD});await db.connect();
 assert.ok((await db.query('select id from sfstore_staging.identity')).rows[0]?.id==='SFSTORE_SYNTHETIC_STAGING','SYNTHETIC_DATABASE_REQUIRED');
 assert.ok(authEnv.GOTRUE_SECURITY_CAPTCHA_ENABLED==='true','CAPTCHA_MUST_REMAIN_ENABLED');
 assert.ok(authEnv.GOTRUE_SECURITY_CAPTCHA_SECRET==='1x0000000000000000000000000000000AA','OFFICIAL_LOCAL_TEST_CAPTCHA_REQUIRED');
 const jwt=role=>{const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000),input=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,iss:'supabase',iat:now,exp:now+3600});return input+'.'+createHmac('sha256',authEnv.GOTRUE_JWT_SECRET).update(input).digest('base64url');};
 const url='http://127.0.0.1:54331',anon=jwt('anon'),service=jwt('service_role'),base='http://127.0.0.1:3112';
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),email='upload-'+randomUUID()+'@staging.invalid',password=randomBytes(24).toString('base64url');
 let userId,server,browser;
 try {
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ok(!created.error&&created.data.user,'SYNTHETIC_ADMIN_CREATE_FAILED');userId=created.data.user.id;
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3112'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,ADMIN_ALLOWED_EMAILS:email,CHECKOUT_GUEST_ENABLED:'true',NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY:'1x00000000000000000000AA',NEXT_PUBLIC_ADMIN_TURNSTILE_SITE_KEY:'1x00000000000000000000AA'},stdio:['ignore','ignore','ignore'],windowsHide:true});
  let ready=false;for(let i=0;i<40;i++){try{const r=await fetch(base+'/checkout/fallo');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'LOCAL_NEXT_START_FAILED');
  const {chromium}=require('C:/Users/feder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({channel:'msedge',headless:true});
  const adminContext=await browser.newContext(),guest=await browser.newContext(),other=await browser.newContext();
  await t.test('unauthorized administrative preview page remains inaccessible',async()=>{const p=await other.newPage();await p.goto(base+'/admin/productos/importar');await p.waitForURL('**/admin/login**');});
  const cookies=[];const auth=createServerClient(url,anon,{cookies:{getAll:()=>[],setAll:values=>cookies.push(...values)}});const login=await auth.auth.signInWithPassword({email,password,options:{captchaToken:'synthetic-local-always-pass'}});assert.ok(!login.error,'LOCAL_AUTH_LOGIN_FAILED');
  await adminContext.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:base,httpOnly:c.options.httpOnly??false,sameSite:'Lax'})));
  const snapshot=async()=> (await db.query("select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) fingerprint from (select id,price,transfer_price,cost,stock,updated_at from products) x")).rows[0].fingerprint;
  const beforePreview=await snapshot();
  const page=await adminContext.newPage();
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Producto','Precio de venta','Precio final con descuento','Costo unitario'],['Synthetic Upload Preview Ñ',100,75,50]]),'Producto Perfumes');
  for(const [format,extension,mime]of [['xlsx','xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],['biff8','xls','application/vnd.ms-excel'],['csv','csv','text/csv']])await t.test(extension+' preview through actual authenticated Server Action and worker',async()=>{
   await page.goto(base+'/admin/productos/importar');await page.waitForLoadState('networkidle');await page.locator('input[name=file]').setInputFiles({name:'synthetic.'+extension,mimeType:mime,buffer:XLSX.write(book,{type:'buffer',bookType:format})});await page.getByRole('button',{name:'Previsualizar',exact:true}).click();try{await page.getByText('Se previsualizaron 1 filas de Producto Perfumes.',{exact:true}).waitFor({timeout:5000});}catch{const errors=await page.getByText(/^(El archivo|El Excel|No se pudo procesar|La previsualización|Ya se está)/).allTextContents();throw Error('PREVIEW_FAILED: '+errors.join(' | '));}assert.ok(await page.getByText('Synthetic Upload Preview Ñ',{exact:true}).count()>0);
  });
  await t.test('oversize file gives a clear client validation error',async()=>{await page.goto(base+'/admin/productos/importar');await page.waitForLoadState('networkidle');await page.locator('input[name=file]').setInputFiles({name:'large.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.alloc(3*1024*1024+1)});assert.match(await page.locator('input[name=file]').evaluate(x=>x.validationMessage),/3 MiB/);});
  await t.test('corrupt Excel produces a safe visible server error',async()=>{await page.goto(base+'/admin/productos/importar');await page.waitForLoadState('networkidle');await page.locator('input[name=file]').setInputFiles({name:'bad.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('PK\x03\x04invalid')});await page.getByRole('button',{name:'Previsualizar',exact:true}).click();await page.getByText('El archivo está corrupto o su contenido no coincide con el formato.',{exact:true}).waitFor();});
  await t.test('previews never change product prices, costs, stock or timestamps',async()=>{assert.ok(await snapshot()===beforePreview,'PREVIEW_MUST_NOT_MODIFY_CATALOG');});
  const api=async(context,path,{method='POST',json,bytes,mime,key}={})=>{let p=context.pages()[0];if(!p){p=await context.newPage();await p.goto(base+'/checkout/fallo');}return p.evaluate(async({path,method,json,body,mime,key})=>{const headers={};if(json)headers['content-type']='application/json';if(mime)headers['content-type']=mime;if(key)headers['x-checkout-operation-key']=key;const b=body?Uint8Array.from(atob(body),c=>c.charCodeAt(0)):json?JSON.stringify(json):undefined;const r=await fetch(path,{method,headers,body:b});const text=r.headers.get('content-type')?.includes('application/json')?await r.text():'';return{status:r.status,json:text?JSON.parse(text):null};},{path,method,json,body:bytes?.toString('base64'),mime,key});};
  function syntheticPdf(target) {
   let padding=target-500;
   for(let attempt=0;attempt<4;attempt++) {
    let doc='%PDF-1.4\n',offsets=[0];
    const bodies=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 4 0 R >>','<< /Length '+padding+' >>\nstream\n'+' '.repeat(padding)+'\nendstream'];
    bodies.forEach((body,i)=>{offsets.push(Buffer.byteLength(doc));doc+=(i+1)+' 0 obj\n'+body+'\nendobj\n';});
    const xref=Buffer.byteLength(doc);doc+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
    const bytes=Buffer.from(doc);if(bytes.length===target)return bytes;padding+=target-bytes.length;
   }throw Error('SYNTHETIC_PDF_SIZE_FAILED');
  }
  const fullProof=syntheticPdf(3*1024*1024);
  let orderId;const proofKey=randomUUID(),product=randomUUID(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXc8AAAAASUVORK5CYII=','base64');
  await t.test('real anonymous Auth, checkout and unknown-buyer denial',async()=>{
   for(const context of [guest,other])assert.equal((await api(context,'/api/checkout/session',{json:{captchaToken:'synthetic-local-always-pass',hasPendingOperation:false}})).status,200);
   await db.query("insert into products(id,category_id,name,slug,short_description,price,transfer_price,stock,status) values($1,'11111111-1111-4111-8111-111111111111','Synthetic Upload Regression',$2,'Synthetic local only',100,75,4,'active')",[product,'synthetic-upload-'+product]);
   const r=await api(guest,'/api/checkout',{json:{operationKey:randomUUID(),paymentMethod:'transfer',customer:{fullName:'Synthetic Upload Buyer',phone:'synthetic-phone'},shipping:{method:'pickup'},items:[{productId:product,quantity:1}]}});assert.equal(r.status,200);assert.equal(r.json.total,75);orderId=r.json.id;
   assert.equal((await api(other,'/api/checkout/payment-report/'+orderId,{bytes:png,mime:'image/png',key:proofKey})).status,404);
  });
  await t.test('oversize proof rejected before Storage, with clear error',async()=>{const r=await api(guest,'/api/checkout/payment-report/'+orderId,{bytes:Buffer.alloc(3*1024*1024+1),mime:'image/png',key:proofKey});assert.equal(r.status,413);assert.match(r.json.error,/3 MiB/);});
  await t.test('exact 3 MiB PDF upload and retry are idempotent and remain private',async()=>{
   for(let i=0;i<2;i++)assert.equal((await api(guest,'/api/checkout/payment-report/'+orderId,{bytes:fullProof,mime:'application/pdf',key:proofKey})).status,200);
   const row=(await db.query('select object_path,status from checkout_payment_reports where order_id=$1',[orderId])).rows[0];assert.ok(row.status==='pending');assert.ok((await db.query("select public from storage.buckets where id='checkout-payment-proofs'")).rows[0].public===false);
   const publicDownload=await fetch(url+'/storage/v1/object/public/checkout-payment-proofs/'+row.object_path);assert.ok(!publicDownload.ok,'PUBLIC_PROOF_DOWNLOAD_MUST_FAIL');
   assert.equal((await api(other,'/api/checkout/payment-proof/'+orderId,{method:'GET'})).status,404);assert.equal((await api(guest,'/api/checkout/payment-proof/'+orderId,{method:'GET'})).status,200);
  });
 } finally {
  await browser?.close();server?.kill();
  if(userId){const removed=await admin.auth.admin.deleteUser(userId);assert.ok(!removed.error,'SYNTHETIC_ADMIN_CLEANUP_FAILED');}
  await db.end();
 }
});
