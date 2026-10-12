import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
function load(file,modules={},globals={}){
 const exports={};const source=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',...Object.keys(globals),source)(name=>{assert.ok(Object.hasOwn(modules,name),`Unexpected dependency ${name}`);return modules[name];},exports,...Object.values(globals));return exports;
}
const contract=load('lib/checkout/contract.ts'),http=load('lib/checkout/http.ts',{'./contract':contract}),argentina=load('lib/checkout/argentina.ts',{'./contract':contract});
const buyer=randomUUID(),other=randomUUID(),id=randomUUID();
function guest({present=false,existing=false,legacy=false,signupError=false,verified=true,writeError=false,env={},outage=false}={}){
 let cookie=present,calls=[];
 const missing={name:'AuthSessionMissingError'};
 const auth={getUser:async()=>{calls.push('getUser');if(outage)return{data:{user:null},error:Error('synthetic credential')};return{data:{user:cookie&&verified?{id:buyer,is_anonymous:true}:null},error:cookie&&verified?null:missing};},signInAnonymously:async args=>{calls.push(['signup',args]);if(writeError)throw Error('synthetic cookie write failed');if(signupError)return{data:{user:null},error:Error('synthetic Auth secret')};cookie=true;return{data:{user:{id:buyer,is_anonymous:true}},error:null};}};
 if(existing)cookie=true;
 const loaded=load('services/checkout-guest-session.ts',{'server-only':{},'@/lib/checkout/contract':contract,'@/lib/supabase/auth-server':{hasCheckoutSessionCookie:async()=>cookie,getSupabaseAuthServerClient:async options=>options.checkout?{auth}:{auth:{getUser:async()=>({data:{user:legacy?{id:other}:null},error:legacy?null:missing})}}}},{process:{env:{CHECKOUT_GUEST_ENABLED:'true',NODE_ENV:'test',...env}}});
 return{loaded,calls};
}
test('guest session creates anonymously once, verifies getUser, and returns no tokens, buyer identity or PII',async()=>{
 const f=guest();assert.deepEqual(await f.loaded.ensureCheckoutGuestSession({hasPendingOperation:false}),{ready:true});assert.deepEqual(await f.loaded.ensureCheckoutGuestSession({hasPendingOperation:true}),{ready:true});
 assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='signup').length,1);assert.equal(f.calls.filter(c=>c==='getUser').length,3);
});
test('existing guest or legacy buyer is reused without registration or replacing its identity',async()=>{
 for(const options of [{existing:true},{legacy:true}]){const f=guest(options);assert.deepEqual(await f.loaded.ensureCheckoutGuestSession({hasPendingOperation:true}),{ready:true});assert.equal(f.calls.filter(Array.isArray).length,0);}
});
test('session loss, Auth outage, disabled configuration and missing production CAPTCHA fail closed',async()=>{
 for(const [options,input,code] of [[{present:true,verified:false},{hasPendingOperation:false},'CHECKOUT_SESSION_LOST'],[{}, {hasPendingOperation:true},'CHECKOUT_SESSION_LOST'],[{outage:true},{hasPendingOperation:false},'CHECKOUT_SESSION_UNAVAILABLE'],[{env:{CHECKOUT_GUEST_ENABLED:'false'}},{hasPendingOperation:false},'CHECKOUT_GUEST_NOT_CONFIGURED'],[{env:{NODE_ENV:'production'}},{hasPendingOperation:false},'CHECKOUT_CAPTCHA_REQUIRED']]){
  const f=guest(options);await assert.rejects(f.loaded.ensureCheckoutGuestSession(input),e=>e.code===code);assert.equal(f.calls.filter(Array.isArray).length,0);
 }
});
test('signup errors, failed cookie persistence and unverified anonymous identity cannot authorize checkout',async()=>{
 for(const options of [{signupError:true},{verified:false},{writeError:true}]){const f=guest(options);await assert.rejects(f.loaded.ensureCheckoutGuestSession({hasPendingOperation:false}));}
 const f=guest({env:{NODE_ENV:'production'}});await f.loaded.ensureCheckoutGuestSession({hasPendingOperation:false,captchaToken:'synthetic-token'});
 assert.equal(f.calls.find(Array.isArray)[1].options.captchaToken,'synthetic-token');
});
test('checkout Auth cookie factory uses separate HttpOnly Secure cookies and propagates writable failures',async()=>{
 const writes=[],store={getAll:()=>[],set:(...args)=>writes.push(args)};let options;
 const loaded=load('lib/supabase/auth-server.ts',{'@supabase/ssr':{createServerClient:(url,key,input)=>{options=input;return{};}},'next/headers':{cookies:async()=>store}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-public',NODE_ENV:'production'}}});
 await loaded.getSupabaseAuthServerClient({checkout:true,writable:true});assert.equal(options.cookieOptions.name,'sfstore-checkout-auth');
 options.cookies.setAll([{name:'sfstore-checkout-auth',value:'synthetic-secret',options:{httpOnly:false,secure:false}}]);
 assert.equal(writes[0][2].httpOnly,true);assert.equal(writes[0][2].secure,true);assert.equal(writes[0][2].sameSite,'lax');
 store.set=()=>{throw Error('synthetic write error');};assert.throws(()=>options.cookies.setAll([{name:'sfstore-checkout-auth',value:'synthetic',options:{}}]));
 await loaded.getSupabaseAuthServerClient();assert.equal(options.cookieOptions,undefined);
});
function request(body,path='session',headers={}){return new Request('http://localhost/api/checkout/'+path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)});}
test('session HTTP endpoint blocks CSRF, identity injection and oversized CAPTCHA, and redacts errors',async()=>{
 let calls=0;const route=load('app/api/checkout/session/route.ts',{'@/lib/checkout/contract':contract,'@/lib/checkout/http':http,'@/services/checkout-guest-session':{ensureCheckoutGuestSession:async()=>{calls++;throw Error('synthetic token buyer PII');}}});
 for(const [body,headers,status] of [[{hasPendingOperation:false},{origin:'https://attacker.invalid'},403],[{hasPendingOperation:false,buyerId:buyer},{},400],[{hasPendingOperation:false,captchaToken:'x'.repeat(2049)},{},400],[{hasPendingOperation:false},{'content-type':'text/plain'},415]]){assert.equal((await route.POST(request(body,'session',headers))).status,status);}
 assert.equal(calls,0);const response=await route.POST(request({hasPendingOperation:false}));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/synthetic token|PII/);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('anonymous Auth identity is never an administrator even with an allowlisted email',async()=>{
 const loaded=load('lib/admin-session.ts',{'next/navigation':{redirect:()=>{throw Error('redirect');}},'@/lib/admin-authorization':{isAllowedAdminEmail:()=>true,parseAllowedAdminEmails:()=>[]},'@/lib/supabase/auth-server':{getSupabaseAuthServerClient:async()=>({auth:{getUser:async()=>({data:{user:{id:buyer,is_anonymous:true,email:'admin@example.invalid'}},error:null})}})}},{process:{env:{ADMIN_ALLOWED_EMAILS:'admin@example.invalid'}}});
 assert.equal(await loaded.getAdminUser(),null);await assert.rejects(loaded.requireAdminActionSession(),/Acceso denegado/);
});
test('browser session creation serializes concurrent calls, sends no PII and preserves pending operation evidence',async()=>{
 let calls=0;const loaded=load('lib/checkout/guest-client.ts',{}, {navigator:{locks:{request:async(name,fn)=>{assert.equal(name,'sfstore-checkout-session');await fn();}}},sessionStorage:{getItem:key=>key==='sfstore-checkout-operation'?'synthetic-operation':null},fetch:async(url,options)=>{calls++;assert.equal(url,'/api/checkout/session');assert.deepEqual(JSON.parse(options.body),{hasPendingOperation:true});await new Promise(r=>setTimeout(r,5));return{ok:true,json:async()=>({ready:true})};}});
 await Promise.all([loaded.ensureGuestCheckoutSession(),loaded.ensureGuestCheckoutSession()]);assert.equal(calls,1);
});
test('shipping HTTP boundary authenticates before service, rejects outside Argentina and client prices',async()=>{
 const shipping=load('lib/checkout/shipping-http.ts',{'./contract':contract,'./argentina':argentina,'./http':http});let calls=0;
 const deps={authorize:async()=>buyer,perform:async(who,dest)=>{calls++;assert.equal(who,buyer);assert.equal(dest.province,'Córdoba');return{status:'quotation_required',rates:[],country:'AR'};}};
 assert.equal((await shipping.handleShippingAction(request({province:'Córdoba',city:'Synthetic',postalCode:'5000'},'shipping'),deps,'rates')).status,200);
 for(const body of [{province:'Outside Argentina',city:'Synthetic',postalCode:'5000'},{province:'Córdoba',city:'Synthetic',postalCode:'5000',fee:0}])assert.equal((await shipping.handleShippingAction(request(body,'shipping'),deps,'rates')).status,400);
 assert.equal((await shipping.handleShippingAction(request({province:'Córdoba',city:'Synthetic',postalCode:'5000'},'shipping'),{...deps,authorize:async()=>null},'rates')).status,401);assert.equal(calls,1);assert.equal(argentina.ARGENTINA_PROVINCES.length,24);
});
test('quotation lookup is session-owned, hides customer PII, and does not create a privileged client without a buyer',async()=>{
 let who=buyer,privileged=0;const calls=[];
 const client={from(table){calls.push(table);return{select(columns){calls.push(columns);const builder={eq(column,value){calls.push([column,value]);return builder;},async maybeSingle(){return{data:who===buyer?{id,status:'requested'}:null,error:null};}};return builder;}};}};
 const loaded=load('services/checkout-shipping.ts',{'server-only':{},'@/lib/checkout/contract':contract,'@/services/checkout-server':{authorizeCheckoutBuyer:async()=>who},'@/lib/supabase/server':{getSupabaseAdminClient:()=>{privileged++;return client;}}});

 assert.deepEqual(await loaded.getBuyerShippingQuotation(id),{id,status:'requested'});assert.ok(calls.some(v=>Array.isArray(v)&&v[0]==='buyer_id'&&v[1]===buyer));assert.ok(calls.includes('id,status,created_at,shipping_fee,quoted_carrier,quoted_total,quote_key,valid_until,accepted_order_id'));
 who=other;assert.equal(await loaded.getBuyerShippingQuotation(id),null);who=null;const before=privileged;assert.equal(await loaded.getBuyerShippingQuotation(id),null);assert.equal(privileged,before);
});

test('checkout proxy persists refreshed guest cookies before receipt rendering and never creates an identity',async()=>{
 let options,calls=0;const cookieValues=[{name:'sfstore-checkout-auth',value:'expired-synthetic'}],responseWrites=[];
 const request={cookies:{getAll:()=>cookieValues,set:(name,value)=>{cookieValues[0]={name,value};}}};
 const loaded=load('proxy.ts',{'@supabase/ssr':{createServerClient:(url,key,input)=>{options=input;return{auth:{getUser:async()=>{calls++;options.cookies.setAll([{name:'sfstore-checkout-auth',value:'refreshed-synthetic',options:{httpOnly:false}}]);}}};}},'next/server':{NextResponse:{next:()=>({cookies:{getAll:()=>[],set:(...args)=>responseWrites.push(args)},headers:new Headers()})}}},{process:{env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-public'}}});
 const response=await loaded.proxy(request);assert.equal(calls,1);assert.equal(cookieValues[0].value,'refreshed-synthetic');assert.equal(responseWrites[0][2].httpOnly,true);assert.equal(responseWrites[0][2].secure,true);assert.match(response.headers.get('cache-control'),/no-store/);
 cookieValues.length=0;await loaded.proxy(request);assert.equal(calls,1);
});

test('verified anonymous buyer uses its checkout cookie identity; invalid guest session cannot fall back to another session',async()=>{
 let valid=true,legacyCalls=0;
 const loaded=load('services/checkout-server.ts',{'server-only':{},'@/lib/checkout/contract':contract,'@/lib/supabase/server':{},'@/lib/supabase/auth-server':{hasCheckoutSessionCookie:async()=>true,getSupabaseAuthServerClient:async options=>{if(!options?.checkout)legacyCalls++;return{auth:{getUser:async()=>({data:{user:valid?{id:buyer,is_anonymous:true}:null},error:valid?null:Error('synthetic invalid cookie')})}};}}});
 assert.equal(await loaded.authorizeCheckoutBuyer(),buyer);valid=false;assert.equal(await loaded.authorizeCheckoutBuyer(),null);assert.equal(legacyCalls,0);
});


test('normalized Next loopback URL uses exact Host origin for session, checkout and shipping without accepting aliases or forwarded hosts',async()=>{
 const url='http://localhost:3107/api/checkout/session';
 const req=(origin,host='127.0.0.1:3107',extra={})=>new Request(url,{method:'POST',headers:{host,origin,'content-type':'application/json',...extra},body:JSON.stringify({hasPendingOperation:false})});
 let calls=0;
 const route=load('app/api/checkout/session/route.ts',{'@/lib/checkout/contract':contract,'@/lib/checkout/http':http,'@/services/checkout-guest-session':{ensureCheckoutGuestSession:async()=>{calls++;return{ready:true};}}});
 assert.equal((await route.POST(req('http://127.0.0.1:3107'))).status,200);
 assert.equal(calls,1);
 const shipping=load('lib/checkout/shipping-http.ts',{'./contract':contract,'./argentina':argentina,'./http':http});
 for(const r of [req('http://localhost:3107'),req('https://attacker.invalid'),req('http://127.0.0.1:3108'),req('https://127.0.0.1:3107'),req('null'),req('http://127.0.0.1:3107','attacker.invalid',{'x-forwarded-host':'127.0.0.1:3107'}),req('http://127.0.0.1:3107','127.0.0.1:3107/path'),req('http://127.0.0.1:3107','user@127.0.0.1:3107')]){
  assert.equal((await route.POST(r.clone())).status,403);
  const deps={authorize:async()=>{throw Error('Must reject before Auth');},create:async()=>{},perform:async()=>{}};
  assert.equal((await http.handleCheckout(r.clone(),deps)).status,403);
  assert.equal((await shipping.handleShippingAction(r.clone(),deps,'rates')).status,403);
 }
 assert.equal(calls,1);
});
