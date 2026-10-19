import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {consolidate,markdown} from './core.mjs';
import {sync,safeIntegrationError} from './clickup.mjs';
export function generate(parts,previous,output){
 const config=JSON.parse(readFileSync(new URL('../../audit/nightly/config.json',import.meta.url)));
 const report=consolidate(parts,previous,config);mkdirSync(output,{recursive:true});
 writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
 writeFileSync(join(output,'report.md'),markdown(report));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output,mode]=process.argv.slice(2);const envelope=JSON.parse(readFileSync(input));const report=generate(envelope.parts,envelope.previous,output);
 sync(report,{apply:mode==='apply',enabled:process.env.CLICKUP_SYNC_ENABLED==='true',approved:process.env.CLICKUP_ACTIVATION_APPROVED==='true',
 token:process.env.CLICKUP_API_TOKEN,listId:process.env.CLICKUP_LIST_ID}).then(result=>{
  // Task descriptions are kept in the report; only counters enter the workflow log.
  console.log('ClickUp '+result.mode+': '+(result.changes?.length??((result.created||0)+(result.updated||0)))+' cambios.');
 }).catch(error=>{console.error(safeIntegrationError(error));process.exitCode=1;});
}
