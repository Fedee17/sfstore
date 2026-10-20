/** Offline renderer only. No connections, credentials, or guessed product IDs. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
try{
 const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i]?.startsWith('--')||!process.argv[i+1])throw Error('ARGUMENTS_INVALID');args[process.argv[i].slice(2)]=process.argv[i+1];}
 if(!['hold','configure','release-hold'].includes(args.mode))throw Error('MODE_INVALID');
 const m=JSON.parse(await readFile(args.manifest,'utf8'));
 if(m.project!=='xspvoicelbxlmtqoiolc'||!['purchase_id','source','head','presentation','legacy','other'].every(k=>uuid.test(m[k]??''))||m.products?.length!==7||m.held_ids?.length!==5||m.lines?.length!==2||!Array.isArray(m.movements)||!Number.isFinite(Date.parse(m.baseline_at)))throw Error('MANIFEST_INVALID');
 if(new Set(m.products.map(p=>p.id)).size!==7||new Set(m.held_ids).size!==5||m.held_ids.some(id=>!m.products.some(p=>p.id===id)))throw Error('MANIFEST_MAPPING_INVALID');
 const output=resolve(args.output??''),runtime=resolve('staging/runtime'),rel=relative(runtime,output);
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('OUTPUT_MUST_BE_PRIVATE_RUNTIME');
 const template=await readFile(`reports/charger-release-${args.mode}-review.sql`,'utf8');
 if(template.split('-- __PRIVATE_MANIFEST__').length!==2)throw Error('TEMPLATE_INVALID');
 const bound=`select set_config('sfstore.charger_manifest','${JSON.stringify(m).replaceAll("'","''")}',true);`;
 const sql=template.replace('-- __PRIVATE_MANIFEST__',bound);
 await writeFile(output,sql,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:'REVIEW_ONLY_PREPARED',mode:args.mode,output,sha256:createHash('sha256').update(sql).digest('hex'),remoteConnections:false,sqlExecuted:false,operatorRequired:args.mode==='configure'}));
}catch(e){console.error(JSON.stringify({status:'STOPPED',code:/^[A-Z_]+$/.test(e.message)?e.message:'PREPARATION_FAILED_DETAILS_WITHHELD'}));process.exitCode=1;}
