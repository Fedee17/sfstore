import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Explicit opt-in: writes only synthetic fixtures to an already running local stack.
// No reset, migrations, cleanup, mocks, screenshots, cookies or tokens in output.
test('real local Supabase guest checkout and authorized manual payment', {
  skip: process.env.SFSTORE_REAL_LOCAL_CHECKOUT !== 'true', timeout: 180000,
}, async t => {
  const base = 'http://127.0.0.1:3107';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.ok(['http://127.0.0.1:54331','http://localhost:54331'].includes(url));
  assert.equal(process.env.NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY,'1x00000000000000000000AA');
  const email = 'admin@staging.invalid';
  assert.ok(process.env.ADMIN_ALLOWED_EMAILS.split(',').map(x=>x.trim()).includes(email));
  const db = new Client({host:'127.0.0.1',port:54332,user:'postgres',password:process.env.SFSTORE_TEST_PG_PASSWORD,database:'postgres'});
  await db.connect();
  const product = randomUUID();
  const stock = async () => (await db.query('select stock from products where id=$1',[product])).rows[0].stock;
  const {chromium} = createRequire(import.meta.url)(process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE);
  let browser;
  try {
    assert.equal((await db.query('select id from sfstore_staging.identity')).rows[0].id,'SFSTORE_SYNTHETIC_STAGING');
    assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,28);
    await db.query("insert into products(id,category_id,name,slug,short_description,price,transfer_price,stock,status) values($1,'11111111-1111-4111-8111-111111111111','Synthetic Checkout Regression',$2,'Synthetic local only',100,75,30,'active')",[product,'synthetic-checkout-'+product]);
    assert.equal(Number((await db.query('select price from products where id=$1',[product])).rows[0].price),100);
    const startStock = await stock(); assert.ok(startStock>=2);
    browser = await chromium.launch({headless:true,channel:process.env.SFSTORE_TEST_BROWSER_CHANNEL || 'msedge'});
    const a = await browser.newContext(), b = await browser.newContext();
    const api = async (context,path,body,origin=base) => {
      if(origin!==base)return context.request.post(base+path,{headers:{origin},data:body});
      let p=context.pages()[0];if(!p){p=await context.newPage();await p.goto(base+'/checkout/fallo');}
      const r=await p.evaluate(async ({path,body})=>{const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:r.status,text:await r.text()};},{path,body});
      return{status:()=>r.status,json:async()=>JSON.parse(r.text),text:async()=>r.text};
    };
    await t.test('missing CAPTCHA, cross-origin, missing session and pending lost session fail closed',async()=>{
      let r=await api(b,'/api/checkout/session',{hasPendingOperation:false}); assert.equal(r.status(),400);assert.equal((await r.json()).code,'CHECKOUT_CAPTCHA_REQUIRED');
      r=await api(b,'/api/checkout/session',{hasPendingOperation:false},'https://attacker.invalid');assert.equal(r.status(),403);
      r=await api(b,'/api/checkout/session',{hasPendingOperation:true});assert.equal(r.status(),409);
      r=await api(b,'/api/checkout',{operationKey:randomUUID()});assert.equal(r.status(),401);
      assert.equal(await stock(),startStock);
    });
    const page = await a.newPage();
    await page.addInitScript(p=>localStorage.setItem('sfstore-cart',JSON.stringify({state:{items:[{productId:p,name:'STAGING Synthetic Product',slug:'staging-synthetic-product',category:'perfumes',price:100,transferPrice:75,quantity:2,stock:30}],totalItems:2,subtotal:200},version:0})),product);
    let body,order;
    await t.test('real widget, guest signup, checkout UI, receipt and secure cookie persistence',async()=>{
      await page.goto(base+'/checkout');
      await page.getByLabel('Nombre completo').fill('Synthetic Checkout Buyer');
      await page.getByLabel('Teléfono').fill('synthetic-phone');
      await page.waitForFunction(()=>!!document.querySelector('input[name="cf-turnstile-response"]')?.value,{},{timeout:45000});
      const reply=page.waitForResponse(r=>r.url()===base+'/api/checkout'&&r.request().method()==='POST');
      await page.getByRole('button',{name:'Preparar pedido por transferencia',exact:true}).click();
      const r=await reply;body=r.request().postDataJSON();assert.equal(r.status(),200);order=await r.json();
      await page.waitForURL('**/checkout/exito?order=*');
      await page.getByRole('heading',{name:'Esperando transferencia',exact:true}).waitFor();
      assert.equal(order.subtotal,200);assert.equal(order.discount,50);assert.equal(order.total,150);
      assert.equal(order.shippingCost,0);assert.equal(order.state,'pending');
      assert.equal(body.paymentMethod,'transfer');assert.equal(body.shipping.method,'pickup');
      const cookies=(await a.cookies()).filter(c=>c.name==='sfstore-checkout-auth'||c.name.startsWith('sfstore-checkout-auth.'));
      assert.ok(cookies.length>0);assert.ok(cookies.every(c=>c.httpOnly&&c.secure&&c.sameSite==='Lax'&&c.path==='/'));
      await page.reload();await page.getByRole('heading',{name:'Esperando transferencia',exact:true}).waitFor();
    });
    assert.ok(order,'UI checkout must succeed before dependent checks');
    const op=async()=> (await db.query('select buyer_id,state,extract(epoch from (expires_at-created_at)) seconds from checkout_operations where order_id=$1',[order.id])).rows[0];
    const buyer=(await op()).buyer_id;
    await t.test('verified anonymous identity, one 25 percent discount and 24 hour stock reservation',async()=>{
      assert.equal((await db.query('select is_anonymous from auth.users where id=$1',[buyer])).rows[0].is_anonymous,true);
      assert.equal(await stock(),startStock-2);assert.ok(Math.abs(Number((await op()).seconds)-86400)<2);
      assert.equal((await db.query("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='reservation'",[order.id])).rows[0].n,1);
    });
    await t.test('concurrent retries reuse order and reserve stock once; changed payload conflicts',async()=>{
      const replies=await Promise.all([api(a,'/api/checkout',body),api(a,'/api/checkout',body)]);
      for(const r of replies){assert.equal(r.status(),200);assert.equal((await r.json()).id,order.id);}
      assert.equal(await stock(),startStock-2);
      const r=await api(a,'/api/checkout',{...body,items:[{productId:product,quantity:1}]});assert.equal(r.status(),409);assert.equal((await r.json()).code,'CHECKOUT_IDEMPOTENCY_CONFLICT');
    });
    await t.test('guest receipts stay private, idempotency is scoped per buyer and admin access is denied',async()=>{
      const r=await api(b,'/api/checkout/session',{hasPendingOperation:false,captchaToken:'XXXX.DUMMY.TOKEN.XXXX'});assert.equal(r.status(),200);
      const other=await b.newPage();await other.goto(base+'/checkout/exito?order='+order.id);
      await other.getByRole('heading',{name:'Revisá el estado de tu pedido'}).waitFor();assert.equal(await other.getByText(order.orderNumber,{exact:true}).count(),0);
      await other.goto(base+'/admin/checkout');await other.waitForURL('**/admin/login');
      const retry=await api(b,'/api/checkout',body);assert.equal(retry.status(),200);
      const separate=await retry.json();assert.notEqual(separate.id,order.id);
      const otherBuyer=(await db.query('select buyer_id from checkout_operations where order_id=$1',[separate.id])).rows[0].buyer_id;assert.notEqual(otherBuyer,buyer);
      await other.goto(base+'/checkout/exito?order='+order.id);await other.getByRole('heading',{name:'Revisá el estado de tu pedido'}).waitFor();
      assert.equal(await stock(),startStock-4);
    });
    await t.test('real authenticated guest cannot read private tables or execute payment RPC',async()=>{
      const jar=await a.cookies();const auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookieOptions:{name:'sfstore-checkout-auth'},cookies:{getAll:()=>jar,setAll:()=>{throw Error('Unexpected refresh');}}});
      const verified=await auth.auth.getUser();assert.equal(verified.error,null);assert.equal(verified.data.user.id,buyer);
      const {data:{session}}=await auth.auth.getSession();
      const publicClient=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{headers:{Authorization:'Bearer '+session.access_token}},auth:{persistSession:false}});
      for(const table of ['orders','checkout_operations','checkout_manual_payments']){const r=await publicClient.from(table).select('*').limit(1);assert.ok(r.error||r.data.length===0);}
      const r=await publicClient.rpc('confirm_checkout_manual_payment',{p_order_id:order.id,p_operation_key:randomUUID(),p_admin_id:buyer,p_amount:150,p_reference:'synthetic-unauthorized'});assert.ok(r.error);
      assert.equal((await db.query('select payment_status from orders where id=$1',[order.id])).rows[0].payment_status,'pending');
    });
    await t.test('authorized real admin action credits payment once and buyer receipt shows paid',async()=>{
      const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
      const existing=(await db.query('select id from auth.users where email=$1',[email])).rows;
      assert.ok(existing.length<=1);
      const password=randomUUID()+randomUUID();
      if(!existing.length){const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);}
      const cookieJar=[];
      const auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>cookieJar,setAll:values=>{for(const v of values){const i=cookieJar.findIndex(x=>x.name===v.name);if(i>=0)cookieJar.splice(i,1);cookieJar.push(v);}}}});
      const link=await admin.auth.admin.generateLink({type:'magiclink',email});assert.equal(link.error,null);
      const signed=await auth.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});assert.equal(signed.error,null);
      assert.equal((await auth.auth.getUser()).data.user.is_anonymous,false);
      const ctx=await browser.newContext();await ctx.addCookies(cookieJar.map(c=>({name:c.name,value:c.value,url:base,httpOnly:true,sameSite:'Lax'})));
      const adminPage=await ctx.newPage();await adminPage.goto(base+'/admin/checkout');
      const article=adminPage.locator('article').filter({has:adminPage.getByRole('heading',{name:order.orderNumber,exact:true})});
      await article.getByLabel('Importe recibido completo').fill('150');await article.getByLabel('Referencia del cobro').fill('synthetic-local-credit-'+randomUUID());
      await article.getByRole('checkbox').check();
      const action=adminPage.waitForRequest(r=>r.method()==='POST'&&r.url()===base+'/admin/checkout'&&!!r.headers()['next-action']);
      await article.getByRole('button',{name:'Acreditar pago manual',exact:true}).click();
      const request=await action;const actionRequest={headers:await request.allHeaders(),body:request.postDataBuffer()};
      // revalidatePath removes the paid order's form (including its success message).

      const retry=await ctx.request.post(base+'/admin/checkout',{headers:actionRequest.headers,data:actionRequest.body});assert.equal(retry.status(),200);
      const unauthorized=await a.request.post(base+'/admin/checkout',{headers:{'next-action':actionRequest.headers['next-action'],'content-type':actionRequest.headers['content-type'],origin:base},data:actionRequest.body});
      assert.ok((await unauthorized.text()).includes('No se acreditó el pago.'));
      const saved=(await db.query('select status,payment_status from orders where id=$1',[order.id])).rows[0];assert.equal(saved.payment_status,'paid');assert.equal(saved.status,'confirmed');
      assert.equal((await db.query('select count(*)::int n from checkout_manual_payments where order_id=$1',[order.id])).rows[0].n,1);assert.equal(await stock(),startStock-4);
      await page.reload();await page.getByRole('heading',{name:'Pago confirmado',exact:true}).waitFor();
      await ctx.close();
    });
    await t.test('Mercado Pago endpoints remain disabled for GET and POST',async()=>{
      for(const path of ['/api/mercadopago/create-preference','/api/mercadopago/webhook'])for(const method of ['GET','POST']){
        const r=await a.request.fetch(base+path,{method});assert.equal(r.status(),410);assert.equal((await r.json()).code,'AUTOMATIC_PAYMENTS_DISABLED');
      }
    });
  } finally { if(browser)await browser.close();await db.end(); }
});
