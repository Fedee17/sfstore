import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(modules){const exports={};const code=ts.transpileModule(readFileSync(new URL('../services/checkout-manual-admin.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>{assert.ok(Object.hasOwn(modules,name));return modules[name];},exports);return exports;}
const base={'server-only':{},'@/lib/checkout/contract':{isUuid:()=>true}};
test('expiration monitoring verifies administrator before creating privileged client',async()=>{
 let privileged=0;const service=load({...base,'@/lib/admin-session':{requireAdminActionSession:async()=>{throw Error('Denied');}},'@/lib/supabase/server':{getSupabaseAdminClient:()=>{privileged++;throw Error('Forbidden');}}});
 await assert.rejects(service.getCheckoutExpirationHealth());assert.equal(privileged,0);
});
test('authorized monitor invokes only read-only health RPC, not expiration or scheduler',async()=>{
 const calls=[];const health={monitoringEnabled:false,due:0,protectedReports:1,recentRuns:[],backlogOverdue:null};const service=load({...base,'@/lib/admin-session':{requireAdminActionSession:async()=>({id:'synthetic-admin'})},'@/lib/supabase/server':{getSupabaseAdminClient:()=>({rpc:async(name,...args)=>{calls.push([name,...args]);return{data:health,error:null};}})}});
 assert.deepEqual(await service.getCheckoutExpirationHealth(),{...health,backlogOverdue:false});assert.deepEqual(calls,[['get_checkout_expiration_health']]);
});
test('monitor failure discloses no database diagnostic or secret and never pretends health passed',async()=>{
 const service=load({...base,'@/lib/admin-session':{requireAdminActionSession:async()=>({id:'synthetic-admin'})},'@/lib/supabase/server':{getSupabaseAdminClient:()=>({rpc:async()=>({error:{message:'synthetic-private-diagnostic'},data:null})})}});
 await assert.rejects(service.getCheckoutExpirationHealth(),error=>error.message==='No se pudo consultar la supervisión de reservas.');
});
