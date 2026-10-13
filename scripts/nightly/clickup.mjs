import {redact} from './core.mjs';
import {readFileSync} from 'node:fs';
const origin='https://api.clickup.com/api/v2';
export function taskDescription(f,state){
 const description=['SFSTORE-AUDIT-ID: '+f.id,'Estado de auditoría: '+state,'Categoría: '+f.category,'Severidad: '+f.severity,'Componente: '+f.file,
 'Modo: '+f.mode,'Detectado: '+f.detectedAt,'Ejecución: '+f.runUrl,'','Evidencia: '+f.evidence,'Impacto: '+f.impact,'Solución sugerida: '+f.suggestion].join('\n');
 return description+(f.verifiable!==undefined?'\nÁmbito: '+f.scope+'\nExposición: '+(f.exposure||'synthetic/static')+
  (state==='resolved'?'\nResolución verificada: '+JSON.stringify(f.resolutionEvidence):''):'');
}
export function eligible(f){
 return /^SFNA-[a-f0-9]{24}$/.test(f.id)&&['critical','high','medium'].includes(f.severity)&&!!f.evidence&&!!f.runUrl
 &&['static','synthetic','real'].includes(f.mode)&&/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(f.runUrl);
}
export function plan(report,tasks,{listId,strict=false,publishDevelopment=false}={}){
 const index=new Map();
 for(const task of tasks){const id=(task.description||'').match(/^SFSTORE-AUDIT-ID: (SFNA-[a-f0-9]{24})$/m)?.[1];
  if(!id)continue;if(index.has(id))throw Error('Duplicate ClickUp audit IDs; human reconciliation required');index.set(id,task);
 }
 const changes=[];
 for(const [state,findings]of [['active',[...report.groups.new,...report.groups.persistent]],['resolved',report.groups.resolved]]){
  for(const f of findings.filter(eligible)){
   if(f.accepted||(f.exposure==='development-only'&&!publishDevelopment))continue;
   if(strict&&(!/^https:\/\/github\.com\/Fedee17\/sfstore\/actions\/runs\/\d+$/.test(f.runUrl)||(state==='active'&&f.verifiable!==true)||(state==='resolved'&&!f.resolutionEvidence)))continue;
   const matches=[f.id,...(f.legacyIds||[])].map(id=>index.get(id)).filter(Boolean);
   const unique=[...new Map(matches.map(t=>[t.id,t])).values()];
   if(unique.length>1)throw Error('Duplicate ClickUp audit IDs; human reconciliation required');
   const existing=unique[0],description=taskDescription(f,state);
   if(existing&&strict&&(!/^[a-zA-Z0-9_-]{1,64}$/.test(existing.id)||String(existing.list?.id)!==listId||
    !existing.description.split(/\r?\n/).includes('Ámbito: '+f.scope)||
    !existing.description.split(/\r?\n/).includes('Categoría: '+f.category)||
    !existing.description.split(/\r?\n/).includes('Componente: '+f.file)||
    !/^Estado de auditoría: (active|resolved)$/m.test(existing.description)||
    (existing.description.match(/^SFSTORE-AUDIT-ID: /gm)||[]).length!==1||
    !/^\[(critical|high|medium|low)\] /.test(existing.name)))throw Error('Task ownership mismatch; no writes');
   if(!existing&&state==='resolved')continue;
   const payload={name:'['+f.severity+'] '+f.title,description};
   if(!existing)changes.push({method:'POST',id:f.id,legacyIds:f.legacyIds||[],payload});
   else if(existing.description!==description||existing.name!==payload.name)changes.push({method:'PUT',id:f.id,taskId:existing.id,
    previousId:existing.description.match(/^SFSTORE-AUDIT-ID: (SFNA-[a-f0-9]{24})$/m)?.[1],payload});
  }
 }
 return changes;
}
export function client({token,listId,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!token||listId!=='901717762349')throw Error('ClickUp configuration missing');
 let writeCount=0;
 async function request(path,{method='GET',body}={}){
  for(let attempt=0;attempt<3;attempt++){
   let response;try{response=await fetchImpl(origin+path,{method,headers:{Authorization:token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});}
   catch{throw Error(method==='POST'?'Ambiguous task creation. Do not retry POST blindly; reread list next run.':'ClickUp request unavailable');}
   if(method==='GET'&&(response.status===429||response.status>=500)){
    if(attempt===2)throw Error('ClickUp retries exhausted');
    const reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
    await sleep(Math.min(60000,Math.max(1000,Number.isFinite(reset)?reset-Date.now():1000*2**attempt)));continue;
   }
   if(!response.ok)throw Error('ClickUp HTTP '+response.status+'; response content omitted');
   let data;try{data=await response.json();}catch{throw Error('Malformed ClickUp response; reconcile before another write');}
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Malformed ClickUp response');return data;
  }
 }
 function owned(task,change,marker=change.id){
  if(!task||!/^[a-zA-Z0-9_-]{1,64}$/.test(task.id)||String(task.list?.id)!==listId||
   !(task.description||'').split(/\r?\n/).includes('SFSTORE-AUDIT-ID: '+marker)||
   !/^\[(critical|high|medium|low)\] /.test(task.name))throw Error('Task ownership mismatch');
  const scope=change.payload.description.match(/^Ámbito: (.+)$/m)?.[1];
  if(!scope||!task.description.split(/\r?\n/).includes('Ámbito: '+scope))throw Error('Task ownership mismatch');
  for(const label of ['Categoría','Componente']){
   const value=change.payload.description.match(new RegExp('^'+label+': (.+)$','m'))?.[1];
   if(!value||!task.description.split(/\r?\n/).includes(label+': '+value))throw Error('Task ownership mismatch');
  }
  if((task.description.match(/^SFSTORE-AUDIT-ID: /gm)||[]).length!==1||!/^Estado de auditoría: (active|resolved)$/m.test(task.description))throw Error('Task ownership mismatch');
 }
 return {async list(){const data=await request('/list/'+listId);if(String(data.id)!==listId)throw Error('List mismatch');return true;},async tasks(){
  const tasks=[],seen=new Set();
  for(const archived of [false,true]){
   let complete=false;
   for(let page=0;page<20;page++){
    const data=await request('/list/'+listId+'/task?include_closed=true&subtasks=true&archived='+archived+'&page='+page);
    if(!Array.isArray(data.tasks)||data.tasks.length>100||(data.last_page!==undefined&&typeof data.last_page!=='boolean'))throw Error('Malformed ClickUp list response');
    for(const t of data.tasks){if(!t||typeof t.id!=='string'||seen.has(t.id))throw Error('Repeated or malformed pagination');seen.add(t.id);tasks.push(t);}
    if(data.last_page===true||(data.last_page!==false&&data.tasks.length<100)){complete=true;break;}
    if(!data.tasks.length)throw Error('Contradictory pagination');
   }if(!complete)throw Error('Pagination cap; refusing incomplete deduplication');
  }return tasks;
 },async apply(changes){
  if(!Array.isArray(changes)||changes.length>5-writeCount)throw Error('Write budget exceeded');
  const ids=new Set();
  for(const change of changes){if(ids.has(change.id))throw Error('Repeated change ID');ids.add(change.id);
   if(!['POST','PUT'].includes(change.method)||Object.keys(change.payload).sort().join(',')!=='description,name'||
    !/^SFNA-[a-f0-9]{24}$/.test(change.id)||!change.payload.description.split(/\r?\n/).includes('SFSTORE-AUDIT-ID: '+change.id))throw Error('Invalid write payload');
  }
  for(const change of changes){
   if(change.method==='POST'){
    // Reconcile immediately before creation. Never retry a POST, even HTTP 429/5xx.
    const tasks=await this.tasks();
    if(tasks.some(t=>[change.id,...(change.legacyIds||[])].some(id=>(t.description||'').includes(id))))throw Error('Creation reconciliation required');
   }else{
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(change.taskId))throw Error('Invalid task ID');
    const before=await request('/task/'+change.taskId);owned(before,change,change.previousId||change.id);
    if(before.id!==change.taskId)throw Error('Task identity mismatch');
   }
   if(++writeCount>5)throw Error('Write budget exceeded');
   const data=await request(change.method==='POST'?'/list/'+listId+'/task':'/task/'+change.taskId,{method:change.method,body:change.payload});
   owned(data,change);
   if((change.method==='PUT'&&data.id!==change.taskId)||data.description!==change.payload.description)throw Error('Ambiguous write response; reconcile before another run');
   const verified=await request('/task/'+data.id);owned(verified,change);
   if(verified.id!==data.id||verified.description!==change.payload.description)throw Error('Write verification failed');
   await sleep(650);
  }
 }};
}
export async function sync(report,{apply=false,token,listId,fetchImpl,sleep,maxChanges=5,enabled=false,approved=false,tasks=[]}={}){
 const config=JSON.parse(readFileSync(new URL('../../audit/nightly/config.json',import.meta.url)));
 const policy={listId:config.clickup.listId,strict:true,publishDevelopment:config.clickup.publishDevelopment};
 if(!apply)return {mode:'dry-run',changes:plan(report,tasks,policy)}; // No network or credential requirement.
 if(!config.clickup.enabled||!enabled||!approved||process.env.GITHUB_ACTIONS!=='true')throw Error('Live synchronization disabled');
 if(process.env.GITHUB_REPOSITORY!=='Fedee17/sfstore'||!['workflow_dispatch','schedule'].includes(process.env.GITHUB_EVENT_NAME)||process.env.GITHUB_REF!=='refs/heads/'+config.controllerRef||listId!==config.clickup.listId)throw Error('Synchronization scope mismatch');
 if(report.missing.length||!report.coherent||report.scope!==config.approvedRef)throw Error('Incomplete audit cannot synchronize ClickUp');
 const api=client({token,listId,fetchImpl,sleep});await api.list();const changes=plan(report,await api.tasks(),policy);
 const limit=Math.min(maxChanges,config.clickup.maxChanges);if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid change budget');
 if(changes.length>limit)throw Error('Change budget exceeded; human review required');
 await api.apply(changes);return {mode:'live',created:changes.filter(c=>c.method==='POST').length,updated:changes.filter(c=>c.method==='PUT').length};
}
export function safeIntegrationError(){return redact('ClickUp synchronization stopped; reconcile owned markers before retrying. Response content omitted.');}
