import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditDay} from './core.mjs';
import {run} from './run.mjs';
import {generate} from './report.mjs';
export const scope='codex/nightly-audit-clickup';
export const targetSha='944e4fc060d0b2c6c0b062bd6ef7ad7217d417e2';
export function validatePrevious(report,{day,runUrl}){
 const runUrls=Array.isArray(report.runUrls)?[...new Set(report.runUrls)]:[];
 if(report.scope!==scope||!report.coherent||report.missing?.length!==0||report.day>=day||
  runUrls.length!==1||runUrls[0]!==runUrl||report.shadow?.targetSha!==targetSha||
  !/^[a-f0-9]{40}$/.test(report.shadow.controllerSha)||report.shas?.length!==1||report.shas[0]!==targetSha)
  throw Error('Shadow history provenance mismatch');
 return report.runUrls.length===runUrls.length?report:{...report,runUrls};
}
export async function executeShadow({root,sha,controllerSha,runUrl,output,previous=null,runImpl=run,generateImpl=generate,day=auditDay()}){
 if(sha!==targetSha||!/^[a-f0-9]{40}$/.test(controllerSha)||!/^https:\/\/github\.com\/Fedee17\/sfstore\/actions\/runs\/\d+$/.test(runUrl))throw Error('Shadow scope mismatch');
 const config=JSON.parse(readFileSync(new URL('../../audit/nightly/config.json',import.meta.url)));
 if(config.clickup.enabled)throw Error('Shadow requires disabled integration');
 if(previous)validatePrevious(previous,{day,runUrl:previous.runUrls?.[0]});
 const parts=[];mkdirSync(output,{recursive:true});
 for(const phase of ['security','quality','checkout']){
  parts.push(await runImpl({root,phase,scope,sha,runUrl,day,output:join(output,phase)}));
 }
 const report=generateImpl(parts,previous,output);
 report.shadow={controllerSha,targetSha,history:previous?'previous-complete-day':'initial-baseline',clickupRequests:0};
 if(!previous)report.groups.new.forEach(f=>{f.baselineObservation=true;});
 writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
 if(!previous)writeFileSync(join(output,'report.md'),'Primera línea base shadow: “nuevos” significa primera observación, no vulnerabilidades recién introducidas.\n\n'+readFileSync(join(output,'report.md'),'utf8'));
 return {complete:report.coherent&&report.missing.length===0&&config.requiredChecks.every(id=>report.coverage.includes(id)),checks:report.checks.map(c=>({id:c.id,status:c.status,complete:c.complete})),findings:report.findings.length,history:report.shadow.history,clickupRequests:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 executeShadow({root:'target',sha:process.env.TARGET_SHA,controllerSha:process.env.CONTROLLER_SHA,runUrl:process.env.AUDIT_RUN_URL,output:'shadow-output',
 previous:JSON.parse(readFileSync('shadow-history.json')).previous}).then(result=>{console.log(JSON.stringify(result));if(!result.complete)process.exitCode=1;})
 .catch(()=>{console.error('Shadow audit unavailable; no raw diagnostics published.');process.exitCode=1;});
}
