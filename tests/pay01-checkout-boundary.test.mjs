import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
function load(file,modules={},globals={}){
 const exports={};const source=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',...Object.keys(globals),source)(name=>{assert.ok(Object.hasOwn(modules,name),`Unexpected dependency ${name}`);return modules[name];},exports,...Object.values(globals));return exports;
}
const contract=load('lib/checkout/contract.ts');
const {handleCheckout}=load('lib/checkout/http.ts',{'./contract':contract});
const buyer=randomUUID(),product=randomUUID(),operationKey=randomUUID();
const payload={operationKey,customer:{fullName:'Synthetic',phone:'fixture',email:'buyer@example.invalid'},shipping:{method:'pickup'},paymentMethod:'transfer',items:[{productId:product,quantity:1}]};
const result={id:randomUUID(),orderNumber:'FIXTURE',total:100,subtotal:100,discount:0,shippingCost:0,state:'pending',expiresAt:new Date(Date.now()+600000).toISOString()};
function request(body=payload,headers={}){return new Request('http://localhost/api/checkout',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});}
function fixture({actor=buyer,error=null,createError=null}={}){const calls=[];return {calls,deps:{authorize:async()=>{calls.push('authorize');if(error)throw error;return actor;},create:async(id,input)=>{calls.push(['create',id,input]);if(createError)throw createError;return result;}}};}
test('real HTTP boundary authorizes first and forwards only parsed product IDs/quantities to server',async()=>{const f=fixture(),r=await handleCheckout(request(),f.deps);assert.equal(r.status,200);assert.deepEqual(await r.json(),result);assert.deepEqual(f.calls,['authorize',['create',buyer,payload]]);assert.equal(r.headers.get('cache-control'),'no-store');});
test('anonymous, forged cross-origin and failed auth never invoke privileged order creation',async()=>{
 for(const options of [{actor:null},{actor:'fake-buyer'},{error:Error('synthetic auth outage')}]){const f=fixture(options),r=await handleCheckout(request(),f.deps);assert.ok([401,503].includes(r.status));assert.deepEqual(f.calls,['authorize']);}
 const f=fixture(),r=await handleCheckout(request(payload,{origin:'https://attacker.invalid'}),f.deps);assert.equal(r.status,403);assert.deepEqual(f.calls,[]);
});
test('HTTP rejects amount tampering, identity, duplicate products, fractional stock and malformed customer',async()=>{
 for(const body of [{...payload,total:0},{...payload,buyerId:buyer},{...payload,items:[{...payload.items[0],price:0}]},{...payload,items:[...payload.items,...payload.items]},{...payload,items:[{...payload.items[0],quantity:1.5}]},{...payload,customer:{...payload.customer,email:'invalid'}},{...payload,paymentMethod:'mercadopago'},'{']){
  const f=fixture(),r=await handleCheckout(request(body),f.deps);assert.equal(r.status,400);assert.deepEqual(f.calls,['authorize']);
 }
});
test('body limits apply to streaming payload regardless of declared content-length',async()=>{const f=fixture(),r=await handleCheckout(request('x'.repeat(32769),{'content-length':'1'}),f.deps);assert.equal(r.status,413);assert.deepEqual(f.calls,['authorize']);});
test('unsupported content type is rejected before any session or database call',async()=>{const f=fixture(),r=await handleCheckout(request(payload,{'content-type':'text/plain'}),f.deps);assert.equal(r.status,415);assert.deepEqual(f.calls,[]);});
test('transaction error mapping discloses no database or personal data',async()=>{
 for(const e of [new contract.CheckoutError('CHECKOUT_STOCK_INSUFFICIENT',409),Error('synthetic service-role credential and customer PII')]){const f=fixture({createError:e}),r=await handleCheckout(request(),f.deps);assert.ok([409,503].includes(r.status));assert.doesNotMatch(await r.text(),/credential|PII/);}
});
test('actual server adapter uses verified getUser and sends idempotency key and trusted actor separately',async()=>{
 const calls=[];const service=load('services/checkout-server.ts',{'server-only':{},'@/lib/checkout/contract':contract,
 '@/lib/supabase/auth-server':{getSupabaseAuthServerClient:async()=>({auth:{getUser:async()=>{calls.push('getUser');return{data:{user:{id:buyer}},error:null};}}})},
 '@/lib/supabase/server':{getSupabaseAdminClient:()=>({rpc:async(name,args)=>{calls.push([name,args]);return{data:result,error:null};}})}});
 assert.equal(await service.authorizeCheckoutBuyer(),buyer);assert.deepEqual(await service.createCheckoutOrder(buyer,payload),result);
 const {operationKey:key,...body}=payload;assert.deepEqual(calls,['getUser',['create_checkout_atomic',{p_buyer_id:buyer,p_operation_key:key,p_request:body}]]);
});
test('actual server adapter maps only recognized SQL errors and suppresses database diagnostics',async()=>{
 for(const [message,status,code] of [['CHECKOUT_NOT_CONFIGURED',503,'CHECKOUT_NOT_CONFIGURED'],['CHECKOUT_POLICY_NOT_CONFIGURED',503,'CHECKOUT_POLICY_NOT_CONFIGURED'],['CHECKOUT_IDEMPOTENCY_CONFLICT',409,'CHECKOUT_IDEMPOTENCY_CONFLICT'],['CHECKOUT_UNSUPPORTED_TOTAL',409,'CHECKOUT_UNSUPPORTED_TOTAL'],['synthetic credential',503,'CHECKOUT_UNAVAILABLE']]){
  const service=load('services/checkout-server.ts',{'server-only':{},'@/lib/checkout/contract':contract,'@/lib/supabase/auth-server':{},'@/lib/supabase/server':{getSupabaseAdminClient:()=>({rpc:async()=>({data:null,error:{message}})})}});
  await assert.rejects(service.createCheckoutOrder(buyer,payload),e=>e.status===status&&e.code===code);
 }
});
test('browser request strips untrusted prices and persists the same operation across lost response and reload',async()=>{
 const calls=[],values=new Map();let fail=true;const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const globals={sessionStorage:storage,crypto:{randomUUID,subtle:globalThis.crypto.subtle},fetch:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);if(fail)throw Error('synthetic lost response');return{ok:true,json:async()=>result};}};
 const data={...payload,items:[{productId:product,quantity:1,price:0,transferPrice:0,stock:999,name:'Fake'}],total:0,subtotal:0};
 await assert.rejects(load('services/orders.ts',{},globals).createOrderFromCheckout(data),/lost response/);fail=false;
 assert.deepEqual(await load('services/orders.ts',{},globals).createOrderFromCheckout(data),result);assert.deepEqual(calls[0],calls[1]);
 assert.deepEqual(calls[0][1].items,[{productId:product,quantity:1}]);assert.equal(calls[0][0],'/api/checkout');assert.equal(Object.hasOwn(calls[0][1],'total'),false);assert.doesNotMatch(values.get('sfstore-checkout-operation'),/fullName|email|Synthetic/);
});
test('buyer receipt lookup scopes a private read to the verified actor and never trusts URL totals',async()=>{
 const calls=[];const query={select:()=>query,order:()=>query,then:(resolve)=>resolve({data:[],error:null}),eq:(k,v)=>{calls.push([k,v]);return query;},maybeSingle:async()=>({data:{result,state:'pending',expires_at:result.expiresAt},error:null})};
 const read=load('services/checkout-buyer-receipt.ts',{'server-only':{},'@/lib/checkout/contract':contract,'@/services/checkout-server':{authorizeCheckoutBuyer:async()=>buyer},'@/lib/supabase/server':{getSupabaseAdminClient:()=>({from:()=>query})}});
 assert.equal((await read.getBuyerCheckoutReceipt(result.id)).total,100);assert.deepEqual(calls,[['order_id',result.id],['buyer_id',buyer],['id',result.id],['order_id',result.id],['buyer_id',buyer],['order_id',result.id]]);
});
test('unauthorized buyer never constructs service client or reads receipt; storage error discloses no data',async()=>{
 for(const actor of [null,buyer]){let privileged=0;const read=load('services/checkout-buyer-receipt.ts',{'server-only':{},'@/lib/checkout/contract':contract,'@/services/checkout-server':{authorizeCheckoutBuyer:async()=>actor},'@/lib/supabase/server':{getSupabaseAdminClient:()=>{privileged++;throw Error('synthetic database outage');}}});assert.equal(await read.getBuyerCheckoutReceipt(result.id),null);assert.equal(privileged,actor?1:0);}
});
test('actual Next route delegates to verified authorization and atomic server adapter',async()=>{
 const calls=[];const route=load('app/api/checkout/route.ts',{'@/lib/checkout/http':{handleCheckout},'@/services/checkout-server':{authorizeCheckoutBuyer:async()=>{calls.push('authorize');return buyer;},createCheckoutOrder:async(who,input)=>{calls.push([who,input]);return result;}}});
 const response=await route.POST(request());assert.equal(response.status,200);assert.deepEqual(calls,['authorize',[buyer,payload]]);
});
test('PAY-01 orders cannot enter the legacy Mercado Pago preference or mutate through its webhook',async()=>{
 let preferences=0,ledger=0,inventory=0;
 const order={id:result.id,order_number:'FIXTURE',payment_method:'transfer',channel:'web',status:'pending',payment_status:'pending',total:100,metadata:{checkout_version:1}};
 const query={select:()=>query,order:()=>query,then:(resolve)=>resolve({data:[],error:null}),eq:()=>query,maybeSingle:async()=>({data:order,error:null})};
 const modules={'mercadopago':{MercadoPagoConfig:class{},Preference:class{create(){preferences++;throw Error('Forbidden real payment');}},Payment:class{async get(){return{external_reference:result.id,status:'approved',transaction_amount:100,id:'synthetic-payment'};}}},'next/server':{NextResponse:{json:Response.json.bind(Response)}},'@/lib/supabase/server':{getSupabaseAdminClient:()=>({from:()=>query})},'@/services/inventory':{decreaseStockForOrder:()=>{inventory++;}},'@/services/order-payments':{addOrderPayment:()=>{ledger++;}}};
 const globals={process:{env:{MERCADO_PAGO_ACCESS_TOKEN:'synthetic-placeholder-not-a-credential'}}};
 const preference=load('app/api/mercadopago/create-preference/route.ts',modules,globals);
 assert.equal((await preference.POST(request({orderId:result.id}))).status,410);assert.equal(preferences,0);
 const webhook=load('app/api/mercadopago/webhook/route.ts',modules,globals);
 assert.equal((await webhook.POST(request({type:'payment',data:{id:'synthetic-payment'}}))).status,410);assert.equal(ledger,0);assert.equal(inventory,0);
});

test('actual admin getUser plus allowlist prevents manual accreditation and expiry before service access',async()=>{
  const authz=load('lib/admin-authorization.ts');
  for(const [user,authError,allowlist,allowed] of [[null,null,'owner@example.invalid',false],[{id:buyer,email:'other@example.invalid'},null,'owner@example.invalid',false],[{id:buyer,email:'owner@example.invalid'},null,'',false],[{id:buyer,email:'owner@example.invalid'},{message:'Synthetic outage'},'owner@example.invalid',false],[{id:buyer,email:'owner@example.invalid'},null,'owner@example.invalid',true]]){
    let clients=0;const calls=[];
    const session=load('lib/admin-session.ts',{'next/navigation':{redirect:()=>{throw Error('redirect');}},'@/lib/admin-authorization':authz,'@/lib/supabase/auth-server':{getSupabaseAuthServerClient:async()=>({auth:{getUser:async()=>({data:{user},error:authError})}})}},{process:{env:{ADMIN_ALLOWED_EMAILS:allowlist}}});
    const admin=load('services/checkout-manual-admin.ts',{'server-only':{},'@/lib/admin-session':session,'@/lib/checkout/contract':contract,'@/lib/supabase/server':{getSupabaseAdminClient:()=>{clients++;return{rpc:async(name,args)=>{calls.push([name,args]);return{data:{released:0,failures:[],payment_status:'paid'},error:null};}};}}});
    const input={orderId:result.id,operationKey,amount:100,reference:'synthetic-transfer',received:true,adminId:'forged'};
    if(allowed){await admin.confirmManualCheckoutPayment(input);assert.equal(calls[0][1].p_admin_id,buyer);await admin.releaseExpiredCheckoutReservations();assert.equal(calls[1][0],'expire_checkout_reservations');assert.equal(calls[1][1].p_limit,100);}else{await assert.rejects(admin.confirmManualCheckoutPayment(input));await assert.rejects(admin.releaseExpiredCheckoutReservations());await assert.rejects(admin.rejectReportedCheckoutPayment(result.id,'Synthetic rejection'));await assert.rejects(admin.authorizeBuyerException(new FormData()));assert.equal(clients,0);assert.deepEqual(calls,[]);}
  }
});
test('administrator must explicitly acknowledge receipt; invalid amount and RPC errors never masquerade as credited',async()=>{
  let calls=0;const admin=load('services/checkout-manual-admin.ts',{'server-only':{},'@/lib/admin-session':{requireAdminActionSession:async()=>({id:buyer})},'@/lib/checkout/contract':contract,'@/lib/supabase/server':{getSupabaseAdminClient:()=>({rpc:async()=>{calls++;return{data:null,error:{message:'synthetic private diagnosis'}};}})}});
  const input={orderId:result.id,operationKey,amount:100,reference:'synthetic',received:true};
  for(const patch of [{received:false},{amount:1.001},{amount:NaN},{orderId:'bad-id'}])await assert.rejects(admin.confirmManualCheckoutPayment({...input,...patch}));assert.equal(calls,0);
  await assert.rejects(admin.confirmManualCheckoutPayment(input),/No se pudo acreditar/);assert.equal(calls,1);
});
test('cash is denied including pickup; payment status fields and automatic methods are not client capabilities',()=>{
  assert.throws(()=>contract.parseCheckoutRequest({...payload,paymentMethod:'cash'}));
  for(const input of [{...payload,paymentMethod:'cash',shipping:{method:'shipping',carrier:'Andreani',province:'Synthetic',city:'Synthetic',address:'Synthetic',postalCode:'FIXTURE'}},{...payload,paid:true},{...payload,paymentStatus:'paid'},{...payload,paymentMethod:'card'}])assert.throws(()=>contract.parseCheckoutRequest(input));
});
test('automatic payment endpoints return 410 for every legacy/new/forged order without importing SDK or clients',async()=>{
  for(const file of ['app/api/mercadopago/create-preference/route.ts','app/api/mercadopago/webhook/route.ts']){
    const route=load(file,{});for(const body of [{},{orderId:'legacy-order'},{orderId:result.id},'{malformed']){assert.equal((await route.POST(request(body))).status,410);assert.equal((await route.GET(request(body))).status,410);}
    assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/import|fetch\(|getSupabase|MercadoPagoConfig|request\.json/);
  }
});
test('actual public cart and checkout render transfer only; forged legacy payment URL cannot start checkout',()=>{
  const pricing=load('lib/pricing.ts');const item={productId:product,name:'Synthetic',slug:'synthetic',category:'perfumes',quantity:1,stock:3,price:100,transferPrice:80};
  const store={useCartStore:()=>({items:[item],totalItems:1,subtotal:100,clearCart:()=>{},removeItem:()=>{},increaseQuantity:()=>{},decreaseQuantity:()=>{}})};
  const modules={'react':React,'react/jsx-runtime':jsxRuntime,'@/lib/pricing':pricing,'@/lib/web-transfer-pricing':load('lib/web-transfer-pricing.ts'),'@/store/cart-store':store,'@/lib/payment':{transferPayment:{alias:'synthetic',holder:'Synthetic',provider:'Synthetic',taxId:'synthetic'}},'@/lib/checkout/guest-client':{ensureGuestCheckoutSession:async()=>{}},'@/lib/checkout/argentina':load('lib/checkout/argentina.ts',{'./contract':contract}),'@/components/transfer-alias':{TransferAlias:()=>React.createElement('div',null,'Naranja X fedearmando.21')},'@/components/checkout-captcha':{CheckoutCaptcha:()=>null},'@/components/site-header':{SiteHeader:()=>null},'@/lib/whatsapp':{buildWhatsAppUrl:()=>'/synthetic'},'@/services/orders':{createOrderFromCheckout:()=>{throw Error('Unexpected checkout');}},'next/navigation':{useRouter:()=>({push:()=>{throw Error('Unexpected navigation');}}),useSearchParams:()=>new URLSearchParams('payment=cash')}};
  const cart=load('app/carrito/page.tsx',modules);const html=renderToStaticMarkup(React.createElement(cart.default));assert.match(html,/Transferencia bancaria/);assert.doesNotMatch(html,/Efectivo al retirar/);assert.doesNotMatch(html,/Mercado Pago|mercadopago/);
  const checkout=load('app/checkout/page.tsx',modules);const cash=renderToStaticMarkup(React.createElement(checkout.default));assert.doesNotMatch(cash,/Efectivo al retirar/);assert.match(cash,/método solicitado no está habilitado/);assert.doesNotMatch(cash,/Mercado Pago|mercadopago/);
  modules['next/navigation'].useSearchParams=()=>new URLSearchParams('payment=mercadopago');const denied=renderToStaticMarkup(React.createElement(checkout.default));assert.match(denied,/método solicitado no está habilitado/);assert.match(denied,/<button[^>]+type="submit"[^>]+disabled/);assert.doesNotMatch(denied,/Mercado Pago/);
});
test('legacy cash receipt never offers new web payment instructions',async()=>{
  const modules={'react/jsx-runtime':jsxRuntime,'next/link':{default:props=>React.createElement('a',props)},'@/components/transfer-alias':{TransferAlias:()=>React.createElement('div',null,'Naranja X fedearmando.21')},'@/components/checkout-payment-report-form':{CheckoutPaymentReportForm:()=>null},'@/lib/brand':{brand:{hours:'Synthetic',address:'Synthetic'}},'@/lib/payment':{transferPayment:{}},'@/lib/whatsapp':{getWhatsAppLink:()=>'/synthetic'},'@/services/checkout-buyer-receipt':{getBuyerCheckoutReceipt:async()=>({id:result.id,order_number:'FIXTURE',total:100,payment_method:'cash',state:'pending',expired:false})},'@/services/checkout-order-read':{getCheckoutSuccessOrder:()=>{throw Error('Unexpected admin read');}}};
  const page=load('app/checkout/exito/page.tsx',modules);const html=renderToStaticMarkup(await page.default({searchParams:Promise.resolve({order:result.id,total:'1'})}));assert.match(html,/Revisá el estado de tu pedido/);assert.doesNotMatch(html,/Datos para transferencia|Mercado Pago/);
});

test('receipt transfer instructions preserve exact server total including cents and require online report',async()=>{
  const messages=[];
  const modules={'react/jsx-runtime':jsxRuntime,'next/link':{default:props=>React.createElement('a',props)},'@/components/transfer-alias':{TransferAlias:()=>React.createElement('div',null,'Naranja X fedearmando.21')},'@/components/checkout-payment-report-form':{CheckoutPaymentReportForm:()=>null},'@/lib/brand':{brand:{}},'@/lib/payment':{transferPayment:{}},'@/lib/whatsapp':{getWhatsAppLink:message=>{messages.push(message);return '/synthetic';}},'@/services/checkout-buyer-receipt':{getBuyerCheckoutReceipt:async()=>({id:result.id,order_number:'FIXTURE',total:157.25,payment_method:'transfer',state:'pending',expired:false,payment_status:'pending'})},'@/services/checkout-order-read':{getCheckoutSuccessOrder:()=>{throw Error('Unexpected admin read');}}};
  const page=load('app/checkout/exito/page.tsx',modules);
  const html=renderToStaticMarkup(await page.default({searchParams:Promise.resolve({order:result.id,total:'1'})}));
  assert.match(html,/157,25/);assert.match(html,/100%/);assert.match(html,/24 horas/);assert.match(html,/no reemplaza el aviso/);
});

test('a different verified buyer cannot read a receipt or even query its payment status',async()=>{
  const other=randomUUID();let paymentReads=0;let actor=other;
  const read=load('services/checkout-buyer-receipt.ts',{'server-only':{},'@/lib/checkout/contract':contract,'@/services/checkout-server':{authorizeCheckoutBuyer:async()=>actor},'@/lib/supabase/server':{getSupabaseAdminClient:()=>({from(table){
    const filters={};const query={select:()=>query,order:()=>query,then:(resolve)=>resolve({data:[],error:null}),eq:(key,value)=>{filters[key]=value;return query;},maybeSingle:async()=>{
      if(table==='orders'){paymentReads++;return{data:{payment_status:'pending'},error:null};}
      return{data:filters.order_id===result.id&&filters.buyer_id===buyer?{result,state:'pending',expires_at:result.expiresAt}:null,error:null};
    }};return query;
  }})}});
  assert.equal(await read.getBuyerCheckoutReceipt(result.id),null);assert.equal(paymentReads,0);
  actor=buyer;assert.equal((await read.getBuyerCheckoutReceipt(result.id)).total,100);assert.equal(paymentReads,1);
});

test('buyer receipt distinguishes verified payment status from confirmed reservation and ignores forged URL paid flag',async()=>{
  const modules={'react/jsx-runtime':jsxRuntime,'next/link':{default:props=>React.createElement('a',props)},'@/components/transfer-alias':{TransferAlias:()=>React.createElement('div',null,'Naranja X fedearmando.21')},'@/components/checkout-payment-report-form':{CheckoutPaymentReportForm:()=>null},'@/lib/brand':{brand:{}},'@/lib/payment':{transferPayment:{}},'@/lib/whatsapp':{getWhatsAppLink:()=>'/synthetic'},'@/services/checkout-buyer-receipt':{},'@/services/checkout-order-read':{getCheckoutSuccessOrder:()=>null}};
  for(const payment_status of ['pending','paid']){
    modules['@/services/checkout-buyer-receipt'].getBuyerCheckoutReceipt=async()=>({id:result.id,order_number:'FIXTURE',total:100,payment_method:'transfer',state:'confirmed',expired:false,payment_status});
    const page=load('app/checkout/exito/page.tsx',modules);const html=renderToStaticMarkup(await page.default({searchParams:Promise.resolve({order:result.id,paid:'true'})}));
    if(payment_status==='paid')assert.match(html,/Pago confirmado/);else{assert.doesNotMatch(html,/Pago confirmado/);}assert.doesNotMatch(html,/Datos para transferencia|Mercado Pago/);
  }
});

test('shipping has no carrier selected by default and still requires a supported configured carrier',()=>{
  assert.equal(contract.parseCheckoutRequest({...payload,shipping:{method:'shipping',carrier:'Andreani',province:'S',city:'S',postalCode:'S',address:'Synthetic'}}).shipping.carrier,'Andreani');
  assert.throws(()=>contract.parseCheckoutRequest({...payload,shipping:{method:'shipping',carrier:'',province:'S',city:'S',postalCode:'S',address:'Synthetic'}}));
  const source=readFileSync(new URL('../app/checkout/page.tsx',import.meta.url),'utf8');
  assert.match(source,/carrier: ""/);assert.doesNotMatch(source,/<option>Correo Argentino|<option>Andreani|<option>Via Cargo/);assert.match(source,/no contrata transporte/);
  assert.doesNotMatch(source,/calculatePricing|getUnitPriceForPayment/);assert.match(source,/25% de descuento/);
});

test('upgrading a legacy browser operation signature preserves its key and removes plaintext buyer data',async()=>{
 const request={customer:payload.customer,shipping:payload.shipping,paymentMethod:payload.paymentMethod,items:payload.items};let stored=JSON.stringify({signature:JSON.stringify(request),key:operationKey});
 const service=load('services/orders.ts',{}, {sessionStorage:{getItem:()=>stored,setItem:(key,value)=>{stored=value;}},crypto:{subtle:globalThis.crypto.subtle,randomUUID:()=>{throw Error('Unexpected replacement key');}}});
 assert.equal(await service.getCheckoutOperationKey(request),operationKey);assert.match(JSON.parse(stored).signature,/^[a-f0-9]{64}$/);assert.doesNotMatch(stored,/fullName|phone|email|Synthetic/);
});
