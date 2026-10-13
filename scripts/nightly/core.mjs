import {createHash} from 'node:crypto';
import {dependencyResolved} from './versions.mjs';
export const phases=['security','quality','checkout'];
export function auditDay(date=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function redact(text,values=[]){
 let result=String(text).replace(/\u001b\[[0-9;]*m/g,'');
 for(const value of values.filter(v=>typeof v==='string'&&v.length>=8))result=result.split(value).join('[REDACTED]');
 return result.replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|pk_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g,'[REDACTED]')
 .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL OMITIDO]')
 .replace(/((?:password|secret|token|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]').slice(0,3000);
}
export function finding({scope,check,rule,file='repository',title,category='technical',severity='medium',evidence,impact,suggestion,mode='static',detectedAt=new Date().toISOString(),runUrl=''}){
 if(severity==='moderate')severity='medium';
 if(check==='dependencies')rule=String(evidence||'').match(/GHSA-[a-z0-9-]+/i)?.[0].toUpperCase()||rule;
 const key=[scope,check,rule,file.replaceAll('\\','/')].join('|');
 return {id:'SFNA-'+createHash('sha256').update(key).digest('hex').slice(0,24),scope,check,rule,file:redact(file),title:redact(title),category,severity,evidence:redact(evidence),impact:redact(impact||'La verificación detectó un riesgo que requiere revisión.'),suggestion:redact(suggestion||'Reproducir con el comando registrado y corregir en una rama revisada.'),mode,detectedAt,runUrl};
}
export function canonicalFindings(items){
 const index=new Map();
 for(const raw of items){
  const f=raw.check==='dependencies'?{...raw,...finding(raw)}:{...raw};
  f.legacyIds=[...new Set([...(raw.legacyIds||[]),...(raw.id!==f.id?[raw.id]:[])])];
  const prior=index.get(f.id);
  if(prior){f.legacyIds=[...new Set([...prior.legacyIds,...f.legacyIds])];f.affectedRanges=[...new Set([...(prior.affectedRanges||[]),...(f.affectedRanges||[])])];f.evidence=[...new Set([prior.evidence,f.evidence])].join('\n');f.occurrences=(prior.occurrences||1)+(f.occurrences||1);}
  index.set(f.id,f);
 }
 return [...index.values()];
}
export function reconcile(current,previous=[],coverage=[]){
 const byId=new Map(current.map(f=>[f.id,f])),old=new Map(previous.map(f=>[f.id,f]));
 return {new:current.filter(f=>!old.has(f.id)),persistent:current.filter(f=>old.has(f.id)),
 resolved:previous.filter(f=>!byId.has(f.id)&&coverage.includes(f.check)),
 unverified:previous.filter(f=>!byId.has(f.id)&&!coverage.includes(f.check))};
}
export function consolidate(parts,previous,config){
 if(!parts.length)throw Error('No audit evidence; report unavailable');
 const scope=parts[0].scope,day=parts[0].day;
 if(parts.some(p=>p.scope!==scope||p.day!==day||p.schemaVersion!==1))throw Error('Mixed scope/day/schema');
 const latest=new Map();for(const p of parts){const prior=latest.get(p.phase);if(!prior||p.finishedAt>prior.finishedAt)latest.set(p.phase,p);}
 const selected=[...latest.values()],shas=[...new Set(selected.map(p=>p.sha))];
 const coherent=shas.length===1;
 const checks=selected.flatMap(p=>p.checks),coverage=coherent?checks.filter(c=>c.complete).map(c=>c.id):[];
 const current=canonicalFindings(selected.flatMap(p=>p.findings));
 const old=canonicalFindings(previous?.scope===scope?[...(previous.findings||[]),...(previous.groups?.resolved||[])]:[]);
 for(const f of current){const prior=old.find(o=>o.id===f.id);if(prior)f.legacyIds=[...new Set([...f.legacyIds,...prior.legacyIds])];}
 const accepted=(f)=> (config.acceptedRisks||[]).some(r=>r.id===f.id&&r.scope===scope&&r.reason&&r.approvalUrl&&r.ownerTeam&&r.expires>day);
 for(const f of current){f.accepted=accepted(f);f.verifiable=coverage.includes(f.check)&&(f.check!=='dependencies'||f.installedMatchProven===true);}
 const groups=reconcile(current,old,coverage);
 const required=config.resolutionConfirmations||1,inventory=selected.find(p=>p.phase==='security'||p.phase==='all')?.dependencyInventory;
 groups.resolutionPending=[];
 groups.resolved=groups.resolved.filter(f=>{
  const now=inventory?.[f.packageName];
  const changed=config.requiredChecks.every(id=>coverage.includes(id))&&(f.check!=='dependencies'||(inventory&&f.installedInstances&&JSON.stringify(now||[])!==JSON.stringify(f.installedInstances)&&dependencyResolved(f,inventory)));
  const confirmations=changed&&(!previous?.day||previous.day<day)?(f.resolutionConfirmations||0)+1:0;
  if(f.check==='dependencies'&&!changed){groups.resolutionPending.push({...f,resolutionConfirmations:0,verifiable:false});return false;}
  if(confirmations<required){groups.resolutionPending.push({...f,resolutionConfirmations:confirmations,verifiable:false});return false;}
  f.resolutionConfirmations=confirmations;f.resolutionEvidence||={day,sha:shas[0],runUrls:selected.map(p=>p.runUrl)};return true;
 });
 groups.unverified.push(...groups.resolutionPending);
 const rank={critical:0,high:1,medium:2,low:3};
 const candidates=current.filter(f=>!f.accepted).sort((a,b)=>(a.exposure==='development-only'?1:0)-(b.exposure==='development-only'?1:0)||(rank[a.severity]??9)-(rank[b.severity]??9)||(['checkout','security'].includes(a.category)?0:1)-(['checkout','security'].includes(b.category)?0:1));
 const priorities=[],components=new Set();for(const f of candidates){const key=f.category+'|'+f.file;if(!components.has(key)){priorities.push(f);components.add(key);}if(priorities.length===3)break;}
 return {schemaVersion:1,scope,day,shas,coherent,checks,coverage,missing:config.requiredChecks.filter(id=>!coverage.includes(id)),groups,priorities,
 findings:[...current,...groups.unverified],realServices:'No consultados. No se ejecutan pruebas contra servicios reales.',runUrls:selected.map(p=>p.runUrl)};
}
export function markdown(report){
 const lines=['# SFSTORE — auditoría nocturna '+report.day,'','Rama: '+report.scope+' · SHA: '+report.shas.join(', '),'',report.realServices,'',
 'Cobertura: '+(report.missing.length?'INCOMPLETA: '+report.missing.join(', '):'completa para los controles configurados')+'.',''];
 if(!report.coherent)lines.push('Los bloques auditaron commits diferentes. No se infieren resoluciones.','');
 for(const [key,label]of [['new','Nuevos'],['persistent','Persistentes'],['resolved','Resueltos'],['unverified','Sin nueva verificación']]){
 lines.push('## '+label+' ('+report.groups[key].length+')','');
 for(const f of report.groups[key])lines.push('- **'+f.severity+' · '+f.title+'** ['+f.id+'] — '+f.file+'; '+f.mode+'. Evidencia: '+f.evidence+' [Ejecución]('+f.runUrl+').');
 lines.push('');
 }
 lines.push('## Vulnerabilidades y tests','', '- Vulnerabilidades: '+report.findings.filter(f=>f.category==='dependencies').length,
 '- Tests fallidos: '+report.checks.filter(c=>['tests','checkout'].includes(c.id)).reduce((n,c)=>n+(c.counts?.fail||0),0),'','## Riesgos de ventas y seguridad','');
 for(const f of report.findings.filter(f=>['security','checkout','dependencies'].includes(f.category)))lines.push('- '+f.title+': '+f.impact);
 lines.push('','## Tres prioridades recomendadas','');
 report.priorities.forEach((f,i)=>lines.push((i+1)+'. '+f.title+' ('+f.severity+'): '+f.suggestion));
 if(!report.priorities.length)lines.push('Sin hallazgos nuevos verificables. Revisar cobertura faltante antes de interpretar ausencia de fallos.');
 lines.push('','## Ejecuciones y cobertura','');
 for(const c of report.checks)lines.push('- '+c.id+': '+c.status+'; '+c.mode+'; '+c.command+'.'+(c.note?' '+c.note:''));
 return lines.join('\n')+'\n';
}
