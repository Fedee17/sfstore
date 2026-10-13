import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {finding,canonicalFindings,consolidate} from '../scripts/nightly/core.mjs';
import {classifyDependencies,dependencyInventory} from '../scripts/nightly/dependencies.mjs';
import {run,normalizeEslint} from '../scripts/nightly/run.mjs';
import {plan,sync,client,taskDescription,safeIntegrationError} from '../scripts/nightly/clickup.mjs';
import {gather,resolveAuditTarget} from '../scripts/nightly/github.mjs';
import {dependencyResolved} from '../scripts/nightly/versions.mjs';
const LIST='901717762349',runUrl='https://github.com/Fedee17/sfstore/actions/runs/123';
const config={requiredChecks:['dependencies'],resolutionConfirmations:2,acceptedRisks:[]};
const item=(patch={})=>({...finding({scope:'main',check:'dependencies',rule:'1',file:'package-lock.json:pkg',title:'Public advisory',category:'dependencies',severity:'moderate',mode:'static',runUrl,evidence:'pkg <2 https://github.com/advisories/GHSA-abcd-efgh-ijkl',...patch}),affectedRanges:['<2']});
const lock={packages:{'node_modules/pkg':{version:'1.0.0',dev:true}}};
const part=(findings=[],patch={})=>({schemaVersion:1,scope:'main',day:'2026-10-13',sha:'a'.repeat(40),phase:'security',finishedAt:'2026-10-13T04:20:00Z',runUrl,findings,checks:[{id:'dependencies',complete:true,status:findings.length?'failed':'passed'}],dependencyInventory:dependencyInventory(lock),...patch});
const owned=f=>({id:'task1',list:{id:LIST},name:'['+f.severity+'] '+f.title,description:taskDescription(f,'active')});
const report=f=>({groups:{new:[f],persistent:[],resolved:[]}});
test('canonical advisory ID ignores npm source IDs and affected ranges',()=>{
 const a=item(),b=item({rule:'99',evidence:'pkg >=4 <5 https://github.com/advisories/GHSA-abcd-efgh-ijkl'});
 assert.equal(a.id,b.id);assert.equal(a.severity,'medium');
 const joined=canonicalFindings([{...a,id:'SFNA-'+ '1'.repeat(24)},{...b,id:'SFNA-'+ '2'.repeat(24)}]);
 assert.equal(joined.length,1);assert.equal(joined[0].legacyIds.length,2);assert.equal(joined[0].occurrences,2);
 assert.match(joined[0].evidence,/>=4/);
});
test('installed dependency classification separates tooling, runtime and unknown',()=>{
 assert.equal(classifyDependencies([item()],lock)[0].exposure,'development-only');
 assert.equal(classifyDependencies([item()],{packages:{'node_modules/pkg':{version:'1',dev:false}}})[0].exposure,'runtime-dependency');
 assert.equal(classifyDependencies([item()],null)[0].exposure,'unknown');
 assert.equal(classifyDependencies([item()],lock)[0].installedMatchProven,true);
 assert.equal(classifyDependencies([item()],{packages:{'node_modules/pkg':{version:'2.0.0'}}})[0].installedMatchProven,false);
});
test('accepted risk needs scope, approval, team, reason and unexpired date',()=>{
 const f=item(),policy={...config,acceptedRisks:[{id:f.id,scope:'main',approvalUrl:'https://github.com/Fedee17/sfstore/issues/1',ownerTeam:'security',reason:'Explicit decision fixture',expires:'2026-10-14'}]};
 assert.equal(consolidate([part([f])],null,policy).findings[0].accepted,true);
 assert.equal(consolidate([part([f],{day:'2026-10-15'})],null,policy).findings[0].accepted,false);
 assert.equal(consolidate([part([f])],null,{...policy,acceptedRisks:[{...policy.acceptedRisks[0],approvalUrl:''}]}).findings[0].accepted,false);
});
test('runtime problems rank before toolchain problems; development tasks require explicit policy',()=>{
 const dev=classifyDependencies([item({severity:'critical'})],lock)[0];
 const runtime=classifyDependencies([item({file:'package-lock.json:runtime',severity:'high',rule:'GHSA-mnop-qrst-uvwx',evidence:'https://github.com/advisories/GHSA-mnop-qrst-uvwx'})],{packages:{'node_modules/runtime':{version:'1'}}})[0];
 const r=consolidate([part([dev,runtime])],null,config);
 assert.equal(r.priorities[0].id,runtime.id);
 assert.equal(plan(report({...dev,verifiable:true}),[],{strict:true,listId:LIST}).length,0);
 assert.equal(plan(report({...dev,verifiable:true}),[],{strict:true,listId:LIST,publishDevelopment:true}).length,1);
});
test('resolution requires changed versions and two complete different audit days',()=>{
 const f=classifyDependencies([item()],lock)[0];const first=consolidate([part([f])],null,config);
 const fixed={packages:{'node_modules/pkg':{version:'2.0.0',dev:true}}};
 const day2=consolidate([part([],{day:'2026-10-14',dependencyInventory:dependencyInventory(fixed)})],first,config);
 assert.equal(day2.groups.resolved.length,0);assert.equal(day2.groups.resolutionPending.length,1);
 const day3=consolidate([part([],{day:'2026-10-15',dependencyInventory:dependencyInventory(fixed)})],day2,config);
 assert.equal(day3.groups.resolved.length,1);assert.ok(day3.groups.resolved[0].resolutionEvidence);
 const changes=plan(day3,[owned(first.findings[0])],{strict:true,listId:LIST,publishDevelopment:true});
 assert.equal(changes[0].method,'PUT');assert.equal(changes[0].payload.status,undefined);assert.match(changes[0].payload.description,/Resolución verificada/);
 const day4=consolidate([part([],{day:'2026-10-16',dependencyInventory:dependencyInventory(fixed)})],day3,config);
 assert.equal(day4.groups.resolved.length,1);assert.deepEqual(day4.groups.resolved[0].resolutionEvidence,day3.groups.resolved[0].resolutionEvidence);
});
test('registry disappearance with unchanged installed versions cannot resolve a dependency',()=>{
 const old=consolidate([part(classifyDependencies([item()],lock))],null,config);
 const next=consolidate([part([],{day:'2026-10-14'})],old,config);
 assert.equal(next.groups.resolved.length,0);assert.equal(next.groups.resolutionPending[0].resolutionConfirmations,0);
});
test('a version change still inside affected range cannot count as a fix',()=>{
 const f=classifyDependencies([item()],lock)[0];
 assert.equal(dependencyResolved(f,dependencyInventory({packages:{'node_modules/pkg':{version:'1.0.1',dev:true}}})),false);
 assert.equal(dependencyResolved(f,dependencyInventory({packages:{'node_modules/pkg':{version:'2.0.0',dev:true}}})),true);
 assert.equal(dependencyResolved({...f,affectedRanges:['not-a-range']},{}),false);
});
test('nightly phases freeze security snapshot despite a moving branch; missing scheduled snapshot stops',async()=>{
 const headSha='b'.repeat(40),snapshot=part([],{sha:'a'.repeat(40)});
 assert.equal(await resolveAuditTarget({phase:'quality',scheduled:true,headSha,parts:[snapshot]}),snapshot.sha);
 assert.equal(await resolveAuditTarget({phase:'checkout',scheduled:true,headSha,parts:[snapshot]}),snapshot.sha);
 await assert.rejects(resolveAuditTarget({phase:'checkout',scheduled:true,headSha}),/Missing security snapshot/);
 assert.equal(await resolveAuditTarget({phase:'all',pinnedSha:snapshot.sha,headSha,checkAncestor:async()=>true}),snapshot.sha);
 await assert.rejects(resolveAuditTarget({phase:'all',pinnedSha:snapshot.sha,headSha,checkAncestor:async()=>false}),/ancestor/);
});
test('missing coverage and mixed SHA never resolve or publish unverified problems',()=>{
 const old=consolidate([part([item()])],null,config);
 const next=consolidate([part([],{day:'2026-10-14',checks:[{id:'dependencies',complete:false}]})],old,config);
 assert.equal(next.groups.resolved.length,0);assert.equal(next.groups.unverified.length,1);
 assert.equal(plan(report({...item(),verifiable:false}),[],{strict:true,listId:LIST}).length,0);
 const mixed=consolidate([part([]),part([],{phase:'quality',sha:'b'.repeat(40)})],old,config);assert.equal(mixed.coherent,false);
});
test('legacy marker is reused or blocks on ambiguity; cannot create duplicate by ID migration',()=>{
 const f={...item(),verifiable:true,legacyIds:['SFNA-'+ '2'.repeat(24)]};
 const legacy=owned({...f,id:f.legacyIds[0]});
 assert.equal(plan(report(f),[legacy],{strict:true,listId:LIST})[0].method,'PUT');
 assert.throws(()=>plan(report(f),[legacy,{...owned(f),id:'task2'}],{strict:true,listId:LIST}),/Duplicate/);
 const old={scope:'main',findings:[{...item(),id:f.legacyIds[0]}]};
 const reconciled=consolidate([part([item()])],old,config);
 assert.ok(reconciled.groups.persistent[0].legacyIds.includes(f.legacyIds[0]));
});
test('commercial task with copied marker or a different home list is not changed',()=>{
 const f={...item(),verifiable:true};
 for(const t of [{...owned(f),name:'Commercial order'},{...owned(f),list:{id:'999'}},{...owned(f),description:'SFSTORE-AUDIT-ID: '+f.id}])
  assert.throws(()=>plan(report(f),[t],{strict:true,listId:LIST}),/ownership/);
});
function mockClient({writeStatus=200,ambiguous=false,malformed=false}={}){
 const calls=[],tasks=[];
 const transport=async(url,opts)=>{
  const u=new URL(url),method=opts.method||'GET';calls.push({path:u.pathname,method});
  assert.equal(u.origin,'https://api.clickup.com');assert.equal(opts.redirect,'error');
  if(u.pathname===`/api/v2/list/${LIST}/task`&&method==='GET')return Response.json({tasks:u.searchParams.get('archived')==='true'?[]:tasks,last_page:true});
  if(method!=='GET'){
   if(ambiguous)throw Error('private-response-token');
   if(writeStatus!==200)return Response.json({error:'private-response-token'},{status:writeStatus});
   if(method==='POST')tasks.push({id:'task1',list:{id:LIST},...JSON.parse(opts.body)});
   else Object.assign(tasks[0],JSON.parse(opts.body));
   return malformed?new Response('not JSON'):Response.json(tasks[0]);
  }
  return Response.json(tasks[0]);
 };
 return {api:client({token:'fake-token',listId:LIST,fetchImpl:transport,sleep:async()=>{}}),calls,tasks};
}
test('simulated full synchronization creates once, is idempotent, updates same task and marks resolution without closing',async()=>{
 const f={...item(),verifiable:true},m=mockClient();
 await m.api.apply(plan(report(f),[],{strict:true,listId:LIST}));
 const tasks=await m.api.tasks();assert.equal(tasks.length,1);assert.equal(plan(report(f),tasks,{strict:true,listId:LIST}).length,0);
 const persistent={...f,evidence:f.evidence+' Verified repeat'};
 await m.api.apply(plan({groups:{new:[],persistent:[persistent],resolved:[]}},tasks,{strict:true,listId:LIST}));
 const resolved={...persistent,resolutionEvidence:{day:'2026-10-15',sha:'b'.repeat(40),runUrls:[runUrl]}};
 await m.api.apply(plan({groups:{new:[],persistent:[],resolved:[resolved]}},await m.api.tasks(),{strict:true,listId:LIST}));
 assert.equal(m.calls.filter(c=>c.method==='POST').length,1);assert.equal(m.calls.filter(c=>c.method==='PUT').length,2);
 assert.equal(m.tasks[0].status,undefined);assert.match(m.tasks[0].description,/Estado de auditoría: resolved/);
});
for(const status of [401,403,429,500])test(`mutating HTTP ${status} is never retried`,async()=>{
 const m=mockClient({writeStatus:status}),f={...item(),verifiable:true};
 await assert.rejects(m.api.apply(plan(report(f),[],{strict:true,listId:LIST})),new RegExp('HTTP '+status));
 assert.equal(m.calls.filter(c=>c.method==='POST').length,1);
});
test('ambiguous or malformed creation stops after one write and sanitizes diagnostics',async()=>{
 for(const options of [{ambiguous:true},{malformed:true}]){
  const m=mockClient(options),f={...item(),verifiable:true};
  await assert.rejects(m.api.apply(plan(report(f),[],{strict:true,listId:LIST})),e=>!e.message.includes('private-response-token'));
  assert.equal(m.calls.filter(c=>c.method==='POST').length,1);
 }
 assert.doesNotMatch(safeIntegrationError(Error('token=private-response-token customer@example.com')),/private-response-token|customer/);
});
test('GET retry exhaustion is bounded and permission errors are not retried',async()=>{
 for(const status of [500,401]){
  let calls=0;const api=client({token:'fake',listId:LIST,sleep:async()=>{},fetchImpl:async()=>{calls++;return Response.json({error:'private-response'}, {status});}});
  await assert.rejects(api.tasks());assert.equal(calls,status===500?3:1);
 }
});
test('all payloads and budget are checked before the first mutation',async()=>{
 const m=mockClient(),f={...item(),verifiable:true},change=plan(report(f),[],{strict:true,listId:LIST})[0];
 await assert.rejects(m.api.apply([change,{...change,id:'SFNA-'+ '3'.repeat(24),payload:{name:'invalid'}}]));
 assert.equal(m.calls.length,0);
 await assert.rejects(m.api.apply(Array.from({length:6},()=>change)),/budget/);assert.equal(m.calls.length,0);
});
test('repeated pagination stops before any creation',async()=>{
 let calls=0;const api=client({token:'fake',listId:LIST,sleep:async()=>{},fetchImpl:async()=>{
  calls++;return Response.json({tasks:[{id:'same'}],last_page:false});
 }});
 await assert.rejects(api.tasks(),/pagination/);assert.equal(calls,2);
});
test('dry-run snapshot deduplicates offline and all activation gates stay disabled',async()=>{
 const f={...item(),verifiable:true};const result=await sync(report(f),{tasks:[owned(f)],fetchImpl:()=>{throw Error('No network allowed');}});
 assert.equal(result.mode,'dry-run');assert.equal(result.changes.length,0);
 await assert.rejects(sync(report(f),{apply:true,enabled:true,approved:true,fetchImpl:()=>{throw Error('No network allowed');}}),/disabled/);
});
test('ESLint private message snippets and contact details are not publishable evidence',()=>{
 const items=normalizeEslint([{filePath:'/repo/app.ts',messages:[{severity:2,ruleId:'rule',line:2,message:'Customer customer@example.com password=private-token'}]}],{scope:'main',root:'/repo',runUrl});
 assert.doesNotMatch(JSON.stringify(items),/customer@|private-token/);
 assert.doesNotMatch(JSON.stringify(item({impact:'contact person@example.com',suggestion:'token=private-token'})),/person@|private-token/);
});
test('Argentine day collector includes local evening and refuses truncated completed evidence',async()=>{
 let firstPath;
 const request=async path=>{firstPath||=path;return path.includes('nightly-audit.yml')?{total_count:13,workflow_runs:Array.from({length:13},(_,id)=>({id,status:'completed'}))}:{workflow_runs:[]};};
 await assert.rejects(gather({request,scope:'main',day:'2026-10-13',repository:'Fedee17/sfstore',download:()=>{throw Error('Should not download');}}),/cap/);
 assert.ok(decodeURIComponent(firstPath).includes('2026-10-14T02:59:59.000Z'));
});
test('end-to-end simulated detector produces eight coherent checks with no real processes or service credentials',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sfstore-nightly-simulation-'));mkdirSync(join(root,'.git'));mkdirSync(join(root,'tests'));
 const cfg=JSON.parse(readFileSync(new URL('../audit/nightly/config.json',import.meta.url)));
 for(const name of cfg.checkoutTests)writeFileSync(join(root,'tests',name),'// synthetic fixture');
 writeFileSync(join(root,'tests','offline.test.mjs'),'// synthetic fixture');writeFileSync(join(root,'package-lock.json'),JSON.stringify(lock));
 const execute=async(bin,args,{env})=>{
  assert.equal(env.CLICKUP_API_TOKEN,undefined);assert.equal(env.GH_TOKEN,undefined);assert.equal(env.SUPABASE_SERVICE_ROLE_KEY,undefined);
  let stdout='';
  if(args.includes('audit'))stdout=JSON.stringify({vulnerabilities:{pkg:{via:[{source:1,title:'Fixture advisory',severity:'moderate',url:'https://github.com/advisories/GHSA-abcd-efgh-ijkl',range:'<2'},{source:2,title:'Fixture advisory',severity:'moderate',url:'https://github.com/advisories/GHSA-abcd-efgh-ijkl',range:'>=4 <5'}]}}});
  else if(bin==='gitleaks')writeFileSync(args.find(a=>a.startsWith('--report-path=')).split('=').slice(1).join('='),'[]');
  else if(bin==='semgrep')stdout='{"results":[],"errors":[]}';
  else if(args.includes('--format'))stdout='[]';
  else if(args.includes('--test'))stdout='# tests 2\n# pass 2\n# fail 0\n# skipped 0';
  return {code:0,stdout,stderr:'',timedOut:false};
 };
 const p=await run({root,phase:'all',scope:'main',sha:'a'.repeat(40),runUrl,output:join(root,'results'),tools:{execute}});
 assert.equal(p.checks.length,8);assert.ok(p.checks.every(c=>c.complete));assert.equal(p.findings.length,1);
 const r=consolidate([p],null,cfg);assert.equal(r.missing.length,0);assert.equal(r.coherent,true);assert.equal(r.findings[0].severity,'medium');
 assert.equal((await sync(r)).changes.length,0); // Toolchain finding retained in report, not queued for real tasks.
});
