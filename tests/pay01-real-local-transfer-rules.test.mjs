import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
// Opt-in, loopback only; new synthetic fixtures retained as evidence. No reset/cleanup.
test('transfer-only checkout, protected reports and reservation abuse controls with real local Supabase',{skip:process.env.SFSTORE_REAL_LOCAL_TRANSFER!=='true',timeout:240000},async t=>{
 const base='http://127.0.0.1:3107',url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 assert.equal(url,'http://127.0.0.1:54331');assert.equal(process.env.NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY,'1x00000000000000000000AA');
 const db=new Client({host:'127.0.0.1',port:54332,user:'postgres',password:process.env.SFSTORE_TEST_PG_PASSWORD,database:'postgres'});await db.connect();
 const svc=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const evidence={environment:'SFSTORE_SYNTHETIC_STAGING',results:[],products:[],orders:[]};let browser;
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const rpc=async(name,args)=>{const r=await svc.rpc(name,args);assert.equal(r.error,null,r.error?.message);return r.data;};
 const rejectRpc=async(name,args,code)=>{const r=await svc.rpc(name,args);assert.equal(r.error?.message,code);};
 let failed=false;const check=async(name,fn)=>{if(failed)throw Error('A prerequisite failed; dependent scenarios stopped');await t.test(name,async()=>{try{await fn();evidence.results.push({name,status:'passed'});}catch(e){failed=true;evidence.results.push({name,status:'failed',error:String(e.message).slice(0,500)});throw e;}});};
 const product=async(stock=20)=>{const id=randomUUID();await db.query("insert into products(id,category_id,name,slug,short_description,price,transfer_price,stock,status) values($1,'11111111-1111-4111-8111-111111111111','SYNTHETIC TRANSFER TEST',$2,'Synthetic local fixture',100,75,$3,'active')",[id,'synthetic-transfer-'+id,stock]);evidence.products.push(id);return id;};
 const stock=async(id)=>Number((await q('select stock from products where id=$1',[id]))[0].stock);
 const body=(p,quantity=1)=>({operationKey:randomUUID(),customer:{fullName:'Synthetic Transfer Buyer',phone:'synthetic-only'},shipping:{method:'pickup'},paymentMethod:'transfer',items:[{productId:p,quantity}]});
 const api=async(page,path,body)=>page.evaluate(async({path,body})=>{const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};},{path,body});
 const guest=async()=>{const context=await browser.newContext(),page=await context.newPage();await page.goto(base+'/checkout/fallo');const r=await api(page,'/api/checkout/session',{captchaToken:'XXXX.DUMMY.TOKEN.XXXX',hasPendingOperation:false});assert.equal(r.status,200);const jar=await context.cookies();const auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookieOptions:{name:'sfstore-checkout-auth'},cookies:{getAll:()=>jar,setAll:()=>{throw Error('Unexpected refresh');}}});const u=await auth.auth.getUser();assert.equal(u.error,null);return{context,page,buyer:u.data.user.id};};
 const create=async(g,p,n=1)=>{const input=body(p,n),r=await api(g.page,'/api/checkout',input);assert.equal(r.status,200,JSON.stringify(r.body));evidence.orders.push(r.body.id);return{...r.body,input};};
 const proof=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
 const upload=async(g,order,key=randomUUID())=>g.page.evaluate(async({order,key,bytes})=>{const r=await fetch('/api/checkout/payment-report/'+order,{method:'POST',headers:{'content-type':'image/png','x-checkout-operation-key':key},body:new Uint8Array(bytes)});return{status:r.status,body:await r.json()};},{order,key,bytes:[...proof]});
 const late=async(order)=>{await db.query("update checkout_operations set expires_at=(select reported_at+interval '1 millisecond' from checkout_payment_reports where order_id=$1) where order_id=$1",[order]);};
 const releaseCount=async(order)=>Number((await q("select count(*) n from inventory_movements where order_id=$1 and movement_type='release'",[order]))[0].n);
 try{
  assert.equal((await q('select id from sfstore_staging.identity'))[0].id,'SFSTORE_SYNTHETIC_STAGING');assert.equal((await q("select count(*)::int n from supabase_migrations.schema_migrations"))[0].n,28);
  const {chromium}=createRequire(import.meta.url)(process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,channel:'msedge'});
  const g=await guest(),other=await guest();const p=await product();let first;let reportKey=randomUUID();
  await check('guest browser checkout with real Turnstile, 25 percent discount and 24 hour reservation',async()=>{
   const ui=await browser.newContext(),page=await ui.newPage();await page.addInitScript(p=>localStorage.setItem('sfstore-cart',JSON.stringify({state:{items:[{productId:p,name:'Synthetic Transfer Test',slug:'synthetic',category:'perfumes',price:100,transferPrice:75,quantity:2,stock:20}],totalItems:2,subtotal:200},version:0})),p);await page.goto(base+'/checkout');
   await page.getByLabel('Nombre completo').fill('Synthetic UI Buyer');await page.getByLabel('Teléfono').fill('synthetic-phone');await page.waitForFunction(()=>!!document.querySelector('input[name="cf-turnstile-response"]')?.value,{},{timeout:45000});
   const reply=page.waitForResponse(r=>r.url()===base+'/api/checkout'&&r.request().method()==='POST');await page.getByRole('button',{name:'Preparar pedido por transferencia',exact:true}).click();const response=await reply;assert.equal(response.status(),200);first=await response.json();evidence.orders.push(first.id);await page.waitForURL('**/checkout/exito?order=*');await page.getByRole('heading',{name:'Esperando transferencia',exact:true}).waitFor();assert.equal(first.subtotal,200);assert.equal(first.discount,50);assert.equal(first.total,150);assert.equal(await stock(p),18);
   const op=(await q('select buyer_id,extract(epoch from(expires_at-created_at)) seconds from checkout_operations where order_id=$1',[first.id]))[0];assert.ok(Math.abs(Number(op.seconds)-86400)<2);g.context=ui;g.page=page;g.buyer=op.buyer_id;
   assert.equal(await page.getByText('Efectivo al retirar',{exact:false}).count(),0);assert.ok((await ui.cookies()).some(c=>c.httpOnly&&c.name.startsWith('sfstore-checkout-auth')));
  });
  await check('cash, partial-paid input, foreign origins and unauthenticated uploads fail closed',async()=>{
   assert.equal((await api(g.page,'/api/checkout',{...body(p),paymentMethod:'cash'})).status,400);assert.equal((await api(g.page,'/api/checkout',{...body(p),paymentStatus:'paid'})).status,400);
   const r=await other.context.request.post(base+'/api/checkout/payment-report/'+first.id,{headers:{origin:'https://attacker.invalid','content-type':'image/png','x-checkout-operation-key':reportKey},data:proof});assert.equal(r.status(),403);
   const empty=await browser.newContext();assert.equal((await empty.request.post(base+'/api/checkout/payment-report/'+first.id,{headers:{origin:base,'content-type':'image/png','x-checkout-operation-key':reportKey},data:proof})).status(),401);await empty.close();
  });
  await check('timely report with private proof, concurrent retry and persistent pending-payment status',async()=>{
   await g.page.getByLabel('Comprobante de transferencia').setInputFiles({name:'synthetic-proof.png',mimeType:'image/png',buffer:proof});await g.page.getByRole('checkbox',{name:/Realicé la transferencia/}).check();const response=g.page.waitForResponse(r=>r.url()===base+'/api/checkout/payment-report/'+first.id&&r.request().method()==='POST');await g.page.getByRole('button',{name:'Informar pago y adjuntar comprobante',exact:true}).click();const posted=await response;assert.equal(posted.status(),200);reportKey=posted.request().headers()['x-checkout-operation-key'];
   const results=await Promise.all([upload(g,first.id,reportKey),upload(g,first.id,reportKey)]);for(const r of results){assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'pending');}
   await g.page.reload();await g.page.getByRole('heading',{name:'Pago informado, pendiente de verificación',exact:true}).waitFor();
   assert.equal((await q('select payment_status from orders where id=$1',[first.id]))[0].payment_status,'pending');assert.equal((await q("select count(*)::int n from checkout_audit where order_id=$1 and event='payment_reported'",[first.id]))[0].n,1);assert.equal(await stock(p),18);
   assert.equal((await upload(g,first.id,randomUUID())).status,409);
  });
  await check('buyer isolation, private Storage and protected proof download',async()=>{
   assert.equal((await upload(other,first.id)).status,404);
   const otherDownload=await other.page.evaluate(async id=>(await fetch('/api/checkout/payment-proof/'+id)).status,first.id);assert.equal(otherDownload,404);
   const downloaded=await g.page.evaluate(async id=>{const r=await fetch('/api/checkout/payment-proof/'+id);return{status:r.status,size:(await r.arrayBuffer()).byteLength,cache:r.headers.get('cache-control'),disposition:r.headers.get('content-disposition')};},first.id);assert.equal(downloaded.status,200);assert.equal(downloaded.size,proof.length);assert.match(downloaded.cache,/no-store/);assert.match(downloaded.disposition,/attachment/);
   const row=(await q('select object_path from checkout_payment_reports where order_id=$1',[first.id]))[0];const anon=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});assert.ok((await anon.storage.from('checkout-payment-proofs').download(row.object_path)).error);const pub=await fetch(url+'/storage/v1/object/public/checkout-payment-proofs/'+row.object_path);assert.notEqual(pub.status,200);
   assert.equal((await q("select public from storage.buckets where id='checkout-payment-proofs'"))[0].public,false);
   const jar=await g.context.cookies(),auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookieOptions:{name:'sfstore-checkout-auth'},cookies:{getAll:()=>jar,setAll:()=>{throw Error('Unexpected refresh');}}});const session=(await auth.auth.getSession()).data.session;const buyer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false},global:{headers:{Authorization:'Bearer '+session.access_token}}});
   for(const table of ['checkout_payment_reports','checkout_audit','checkout_buyer_exceptions','checkout_reservation_policy']){const r=await buyer.from(table).select('*');assert.ok(r.error||!r.data.length);}
   assert.ok((await buyer.rpc('reject_checkout_payment_report',{p_order_id:first.id,p_admin_id:g.buyer,p_reason:'Synthetic forged admin'})).error);
  });
  await check('reported reservation survives expiration and direct cancellation; no early release',async()=>{
   await rejectRpc('transition_checkout_atomic',{p_order_id:first.id,p_target:'expired'},'CHECKOUT_PAYMENT_REPORT_PROTECTED');await late(first.id);
   const r=await rpc('expire_checkout_reservations',{p_limit:100});assert.equal(r.failures.length,0);assert.equal(await stock(p),18);assert.equal(await releaseCount(first.id),0);assert.equal((await q('select state from checkout_operations where order_id=$1',[first.id]))[0].state,'pending');await rejectRpc('transition_checkout_atomic',{p_order_id:first.id,p_target:'cancelled'},'CHECKOUT_PAYMENT_REPORT_PROTECTED');
  });
  let adminPage,adminContext,adminId;
  await check('real admin sees overdue alert, private proof and credits only the full amount after expiry',async()=>{
   // Only timestamps on this synthetic order/report simulate a 49-hour review delay.
   await db.query("update checkout_payment_reports set reported_at=reported_at-interval '49 hours' where order_id=$1",[first.id]);await db.query("update checkout_operations set expires_at=expires_at-interval '49 hours' where order_id=$1",[first.id]);
   const jar=[];const auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>jar,setAll:values=>{for(const v of values){const i=jar.findIndex(x=>x.name===v.name);if(i>=0)jar.splice(i,1);jar.push(v);}}}});const link=await svc.auth.admin.generateLink({type:'magiclink',email:'admin@staging.invalid'});assert.equal(link.error,null);assert.equal((await auth.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token})).error,null);adminId=(await auth.auth.getUser()).data.user.id;adminContext=await browser.newContext();await adminContext.addCookies(jar.map(c=>({name:c.name,value:c.value,url:base,httpOnly:true,sameSite:'Lax'})));adminPage=await adminContext.newPage();await adminPage.goto(base+'/admin/checkout');
   const article=adminPage.locator('article').filter({has:adminPage.getByRole('heading',{name:first.orderNumber,exact:true})});await article.getByRole('alert').waitFor();assert.match(await article.textContent(),/Revisión atrasada/);assert.equal((await adminContext.request.get(base+'/api/checkout/payment-proof/'+first.id)).status(),200);
   const paymentKey=randomUUID();const args={p_order_id:first.id,p_operation_key:paymentKey,p_admin_id:adminId,p_amount:149,p_reference:'synthetic-'+randomUUID()};await rejectRpc('confirm_checkout_manual_payment',args,'CHECKOUT_MANUAL_AMOUNT_MISMATCH');assert.equal((await q('select count(*)::int n from checkout_manual_payments where order_id=$1',[first.id]))[0].n,0);
   await article.getByLabel('Importe recibido completo').fill('150');await article.getByLabel('Referencia del cobro').fill('synthetic-'+randomUUID());await article.getByRole('checkbox',{name:/Verifiqué/}).check();await adminPage.waitForLoadState('networkidle');const action=adminPage.waitForRequest(r=>r.method()==='POST'&&r.url()===base+'/admin/checkout'&&!!r.headers()['next-action']);await article.getByRole('button',{name:'Acreditar pago manual',exact:true}).click();const request=await action;const replay=await adminContext.request.post(base+'/admin/checkout',{headers:await request.allHeaders(),data:request.postDataBuffer()});assert.equal(replay.status(),200);
   assert.equal((await q('select payment_status from orders where id=$1',[first.id]))[0].payment_status,'paid');assert.equal((await q('select status from checkout_payment_reports where order_id=$1',[first.id]))[0].status,'accepted');assert.equal(await stock(p),18);await g.page.reload();await g.page.getByRole('heading',{name:'Pago confirmado',exact:true}).waitFor();
   await rpc('expire_checkout_reservations',{p_limit:100});assert.equal(await releaseCount(first.id),0);
  });
  await check('rejection with reason releases once; simultaneous retries and later reports cannot duplicate stock',async()=>{
   const owner=await guest(),prod=await product(),order=await create(owner,prod,2);assert.equal((await upload(owner,order.id)).status,200);await adminPage.reload();const article=adminPage.locator('article').filter({has:adminPage.getByRole('heading',{name:order.orderNumber,exact:true})});await article.getByLabel('Motivo del rechazo').fill('Synthetic proof rejected after review');await adminPage.waitForLoadState('networkidle');const action=adminPage.waitForRequest(r=>r.method()==='POST'&&r.url()===base+'/admin/checkout'&&!!r.headers()['next-action']);await article.getByRole('button',{name:'Rechazar aviso y liberar reserva',exact:true}).click();const request=await action;assert.equal((await adminContext.request.post(base+'/admin/checkout',{headers:await request.allHeaders(),data:request.postDataBuffer()})).status(),200);
   const args={p_order_id:order.id,p_admin_id:adminId,p_reason:'Synthetic proof rejected after review'};await Promise.all([rpc('reject_checkout_payment_report',args),rpc('reject_checkout_payment_report',args)]);assert.equal(await stock(prod),20);assert.equal(await releaseCount(order.id),1);assert.equal((await upload(owner,order.id)).status,409);await rejectRpc('confirm_checkout_manual_payment',{p_order_id:order.id,p_operation_key:randomUUID(),p_admin_id:adminId,p_amount:150,p_reference:'synthetic-'+randomUUID()},'CHECKOUT_INVALID_TRANSITION');
   const blocked=await api(owner.page,'/api/checkout',body(prod));assert.equal(blocked.body.code,'CHECKOUT_REVIEW_REQUIRED');
  });
  await check('unreported expiry, concurrent workers, idempotence and rollback restore exactly once',async()=>{
   const owner=await guest(),prod=await product(),order=await create(owner,prod,2);await rejectRpc('transition_checkout_atomic',{p_order_id:order.id,p_target:'expired'},'CHECKOUT_NOT_EXPIRED');assert.equal(await stock(prod),18);await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[order.id]);
   // A transaction that fails after release must roll back both ledger and inventory.
   await db.query('begin');await db.query('set local role service_role');await db.query("select transition_checkout_atomic($1,'expired')",[order.id]);await db.query('rollback');assert.equal(await stock(prod),18);assert.equal(await releaseCount(order.id),0);
   const workers=await Promise.all([rpc('expire_checkout_reservations',{p_limit:100}),rpc('expire_checkout_reservations',{p_limit:100})]);assert.ok(workers.every(r=>r.failures.length===0));assert.equal(await stock(prod),20);assert.equal(await releaseCount(order.id),1);await rpc('expire_checkout_reservations',{p_limit:100});assert.equal(await stock(prod),20);assert.equal((await upload(owner,order.id)).status,409);
  });
  await check('upload preparation never extends deadline; submit versus expiry cannot resurrect an order',async()=>{
   const owner=await guest(),prod=await product(),order=await create(owner,prod),key=randomUUID();
   const prepared=await rpc('prepare_checkout_payment_report',{p_buyer_id:owner.buyer,p_order_id:order.id,p_operation_key:key,p_sha256:createHash('sha256').update(proof).digest('hex'),p_mime:'image/png',p_bytes:proof.length});
   assert.equal((await svc.storage.from('checkout-payment-proofs').upload(prepared.path,proof,{contentType:'image/png',upsert:false})).error,null);
   await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[order.id]);
   const [worker,reported]=await Promise.all([rpc('expire_checkout_reservations',{p_limit:100}),svc.rpc('submit_checkout_payment_report',{p_buyer_id:owner.buyer,p_order_id:order.id,p_operation_key:key})]);
   assert.equal(worker.failures.length,0);assert.equal(reported.error?.message,'CHECKOUT_EXPIRED');const releases=await releaseCount(order.id);assert.ok(releases===0||releases===1);assert.equal(await stock(prod),releases===0?19:20);evidence.uploadExpiryDeferred=releases===0;await rpc('expire_checkout_reservations',{p_limit:100});assert.equal(await stock(prod),20);assert.equal(await releaseCount(order.id),1);assert.equal((await q('select status from checkout_payment_reports where order_id=$1',[order.id]))[0].status,'uploading');
  });
  await check('buyer quota serializes concurrent new orders; same-key retries bypass quota safely',async()=>{
   const owner=await guest(),products=[await product(),await product(),await product()];const inputs=products.map(p=>body(p));const replies=await Promise.all(inputs.map(b=>api(owner.page,'/api/checkout',b)));assert.equal(replies.filter(r=>r.status===200).length,2);assert.equal(replies.filter(r=>r.body.code==='CHECKOUT_PENDING_LIMIT').length,1);for(const r of replies.filter(r=>r.status===200))evidence.orders.push(r.body.id);
   const index=replies.findIndex(r=>r.status===200);for(const r of await Promise.all([api(owner.page,'/api/checkout',inputs[index]),api(owner.page,'/api/checkout',inputs[index])]))assert.equal(r.body.id,replies[index].body.id);
   const accepted=replies.filter(r=>r.status===200);assert.equal((await upload(owner,accepted[0].body.id)).status,200);const second=await upload(owner,accepted[1].body.id);assert.equal(second.body.code,'CHECKOUT_REPORT_LIMIT');
  });
  await check('buyer product quota remains; separate buyers may reserve both units of stock 2',async()=>{
   const owner=await guest(),prod=await product();assert.equal((await api(owner.page,'/api/checkout',body(prod,3))).body.code,'CHECKOUT_PRODUCT_LIMIT');assert.equal(await stock(prod),20);
   const scarce=await product(2),a=await guest(),b=await guest();const results=await Promise.all([api(a.page,'/api/checkout',body(scarce)),api(b.page,'/api/checkout',body(scarce))]);assert.equal(results.filter(r=>r.status===200).length,2);assert.equal(await stock(scarce),0);for(const r of results.filter(r=>r.status===200))evidence.orders.push(r.body.id);
  });
  await check('stock 1 and 2 can be bought completely; concurrent scarce orders cannot oversell or duplicate releases',async()=>{
   const one=await product(1),owner=await guest(),order=await create(owner,one);assert.equal(await stock(one),0);assert.equal(order.total,75);
   const repeat=await api(owner.page,'/api/checkout',order.input);assert.equal(repeat.status,200);assert.equal(repeat.body.id,order.id);assert.equal(await stock(one),0);
   const two=await product(2),other=await guest(),both=await create(other,two,2);assert.equal(await stock(two),0);assert.equal(both.total,150);
   const scarce=await product(1),a=await guest(),b=await guest();const replies=await Promise.all([api(a.page,'/api/checkout',body(scarce)),api(b.page,'/api/checkout',body(scarce))]);assert.equal(replies.filter(r=>r.status===200).length,1);assert.equal(replies.filter(r=>r.body.code==='CHECKOUT_STOCK_INSUFFICIENT').length,1);assert.equal(await stock(scarce),0);
   const winner=replies.find(r=>r.status===200).body;evidence.orders.push(winner.id);
   for(const id of [order.id,both.id,winner.id])await db.query("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1",[id]);
   await Promise.all([rpc('expire_checkout_reservations',{p_limit:100}),rpc('expire_checkout_reservations',{p_limit:100})]);
   assert.equal(await stock(one),1);assert.equal(await stock(two),2);assert.equal(await stock(scarce),1);
   for(const id of [order.id,both.id,winner.id])assert.equal(await releaseCount(id),1);
   await rpc('expire_checkout_reservations',{p_limit:100});assert.equal(await stock(one),1);assert.equal(await stock(two),2);assert.equal(await stock(scarce),1);
  });
  await check('two rejected reports in seven days require review; rate and total-unit limits remain enforced',async()=>{
   const owner=await guest();const products=[await product(),await product(),await product()];
   for(const prod of products.slice(0,2)){const order=await create(owner,prod);assert.equal((await upload(owner,order.id)).status,200);await rpc('reject_checkout_payment_report',{p_order_id:order.id,p_admin_id:adminId,p_reason:'Synthetic invalid repeated payment report'});}
   assert.equal((await api(owner.page,'/api/checkout',body(products[2]))).body.code,'CHECKOUT_FREQUENCY_LIMIT');
   await db.query("update checkout_operations set created_at=created_at-interval '2 minutes' where buyer_id=$1",[owner.buyer]);
   assert.equal((await api(owner.page,'/api/checkout',body(products[2]))).body.code,'CHECKOUT_REVIEW_REQUIRED');
   const limited=await guest();const input=body(products[2]);input.items=[{productId:products[0],quantity:2},{productId:products[1],quantity:2},{productId:products[2],quantity:3}];assert.equal((await api(limited.page,'/api/checkout',input)).body.code,'CHECKOUT_UNITS_LIMIT');
  });
  await check('authorized exceptions are temporary, audited and preserve actual stock checks',async()=>{
   const owner=await guest();await rpc('set_checkout_buyer_exception',{p_buyer_id:owner.buyer,p_admin_id:adminId,p_hours:2,p_pending:3,p_units:8,p_product_units:4,p_reports:2,p_reason:'Synthetic legitimate quantity exception'});const prod=await product();const order=await create(owner,prod,3);assert.equal(order.total,225);assert.equal(await stock(prod),17);assert.equal((await q("select count(*)::int n from checkout_audit where event='buyer_exception' and details->>'buyerId'=$1",[owner.buyer]))[0].n,1);
  });
  await check('Mercado Pago remains disabled for both methods and endpoints',async()=>{for(const path of ['/api/mercadopago/create-preference','/api/mercadopago/webhook'])for(const method of ['GET','POST']){const r=await fetch(base+path,{method});assert.equal(r.status,410);assert.equal((await r.json()).code,'AUTOMATIC_PAYMENTS_DISABLED');}});
 } finally{
  evidence.inventory=await q("select order_id,movement_type,count(*)::int rows,sum(quantity)::int units from inventory_movements where order_id=any($1::uuid[]) group by order_id,movement_type order by order_id,movement_type",[evidence.orders]);
  evidence.finishedAt=new Date().toISOString();writeFileSync('reports/transfer-rules-real-local-evidence-20261012.json',JSON.stringify(evidence,null,2)+'\n');if(browser)await browser.close();await db.end();
 }
});
