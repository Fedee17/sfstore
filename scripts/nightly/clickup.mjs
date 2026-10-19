import {redact} from './core.mjs';
import {readFileSync} from 'node:fs';
const origin='https://api.clickup.com/api/v2';
export function taskDescription(f,state){
 return ['SFSTORE-AUDIT-ID: '+f.id,'Estado de auditoría: '+state,'Categoría: '+f.category,'Severidad: '+f.severity,'Componente: '+f.file,
 'Modo: '+f.mode,'Detectado: '+f.detectedAt,'Ejecución: '+f.runUrl,'','Evidencia: '+f.evidence,'Impacto: '+f.impact,'Solución sugerida: '+f.suggestion].join('\n');
}
export function eligible(f){
 return /^SFNA-[a-f0-9]{24}$/.test(f.id)&&['critical','high','medium'].includes(f.severity)&&!!f.evidence&&!!f.runUrl
 &&['static','synthetic','real'].includes(f.mode)&&/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(f.runUrl);
}
export function plan(report,tasks){
 const index=new Map();
 for(const task of tasks){const id=(task.description||'').match(/^SFSTORE-AUDIT-ID: (SFNA-[a-f0-9]{24})$/m)?.[1];
  if(!id)continue;if(index.has(id))throw Error('Duplicate ClickUp audit IDs; human reconciliation required');index.set(id,task);
 }
 const changes=[];
 for(const [state,findings]of [['active',[...report.groups.new,...report.groups.persistent]],['resolved',report.groups.resolved]]){
  for(const f of findings.filter(eligible)){
   const existing=index.get(f.id),description=taskDescription(f,state);
   if(!existing&&state==='resolved')continue;
   const payload={name:'['+f.severity+'] '+f.title,description};
   if(!existing)changes.push({method:'POST',id:f.id,payload});
   else if(existing.description!==description||existing.name!==payload.name)changes.push({method:'PUT',id:f.id,taskId:existing.id,payload});
  }
 }
 return changes;
}
export function client({token,listId,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!token||!/^\d+$/.test(listId))throw Error('ClickUp configuration missing');
 async function request(path,{method='GET',body}={}){
  for(let attempt=0;attempt<3;attempt++){
   let response;try{response=await fetchImpl(origin+path,{method,headers:{Authorization:token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});}
   catch{throw Error(method==='POST'?'Ambiguous task creation. Do not retry POST blindly; reread list next run.':'ClickUp request unavailable');}
   if(response.status===429||(method!=='POST'&&response.status>=500)){
    if(attempt===2)throw Error('ClickUp retries exhausted');
    const reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
    await sleep(Math.min(60000,Math.max(1000,Number.isFinite(reset)?reset-Date.now():1000*2**attempt)));continue;
   }
   if(!response.ok)throw Error('ClickUp HTTP '+response.status+'; response content omitted');
   return response.json();
  }
 }
 return {async tasks(){
  const tasks=[];for(let page=0;page<20;page++){
   const data=await request('/list/'+listId+'/task?include_closed=true&subtasks=false&page='+page);
   if(!Array.isArray(data.tasks))throw Error('Malformed ClickUp list response');
   tasks.push(...data.tasks);if(data.last_page===true||data.tasks.length<100)return tasks;
  }throw Error('Pagination cap; refusing incomplete deduplication');
 },async apply(changes){for(const change of changes){await request(change.method==='POST'?'/list/'+listId+'/task':'/task/'+encodeURIComponent(change.taskId),{method:change.method,body:change.payload});await sleep(650);}}};
}
export async function sync(report,{apply=false,token,listId,fetchImpl,sleep,maxChanges=30,enabled=false,approved=false}={}){
 if(!apply)return {mode:'dry-run',changes:plan(report,[])}; // No network or credential requirement.
 const config=JSON.parse(readFileSync(new URL('../../audit/nightly/config.json',import.meta.url)));
 if(!config.clickup.enabled||!enabled||!approved||process.env.GITHUB_ACTIONS!=='true')throw Error('Live synchronization disabled');
 if(report.missing.length||!report.coherent)throw Error('Incomplete audit cannot synchronize ClickUp');
 const api=client({token,listId,fetchImpl,sleep});const changes=plan(report,await api.tasks());
 const limit=Math.min(maxChanges,config.clickup.maxChanges);if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid change budget');
 if(changes.length>limit)throw Error('Change budget exceeded; human review required');
 await api.apply(changes);return {mode:'live',created:changes.filter(c=>c.method==='POST').length,updated:changes.filter(c=>c.method==='PUT').length};
}
export function safeIntegrationError(error){return redact(error.message);}
