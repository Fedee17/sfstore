import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
function load(modules){const exports={};const code=ts.transpileModule(readFileSync(new URL('../services/checkout-manual-admin.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>{assert.ok(Object.hasOwn(modules,name));return modules[name];},exports);return exports;}
const base={'server-only':{},'@/lib/checkout/contract':{isUuid:v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)}};
test('shipping approval authenticates administrator before privileged client',async()=>{
 let privileged=0;const service=load({...base,'@/lib/admin-session':{requireAdminActionSession:async()=>{throw Error('Denied');}},'@/lib/supabase/server':{getSupabaseAdminClient:()=>{privileged++;throw Error('Forbidden');}}});await assert.rejects(service.approveShippingQuotation(randomUUID(),10));assert.equal(privileged,0);
});
test('shipping approval uses verified actor, validates amounts and discloses no database diagnostics',async()=>{
 const id=randomUUID(),actor=randomUUID(),calls=[];let failure=false;
 const service=load({...base,'@/lib/admin-session':{requireAdminActionSession:async()=>({id:actor})},'@/lib/supabase/server':{getSupabaseAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return failure?{data:null,error:{message:'synthetic-private'}}:{data:{total:162.5,shippingFee:12.5},error:null};}})}});
 for(const fee of [-1,NaN,Infinity,0.001,10000000])await assert.rejects(service.approveShippingQuotation(id,fee));assert.equal(calls.length,0);
 assert.equal((await service.approveShippingQuotation(id,12.5)).total,162.5);assert.deepEqual(calls,[{name:'approve_checkout_shipping_quote',args:{p_quote_id:id,p_admin_id:actor,p_fee:12.5}}]);failure=true;await assert.rejects(service.approveShippingQuotation(id,12.5),e=>e.message==='No se pudo registrar la cotización.');
});
