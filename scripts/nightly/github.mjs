import {writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditDay} from './core.mjs';
export function allowedRef(ref,config){
 if(ref!==config.approvedRef&&!config.developmentRefs.includes(ref))throw Error('Target ref not approved');
 if(!/^[A-Za-z0-9._/-]+$/.test(ref)||ref.includes('..'))throw Error('Invalid ref');return ref;
}
export function api({repository,token,fetchImpl=fetch}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!token)throw Error('GitHub configuration missing');
 return async(path)=>{
  if(!path.startsWith('/'))throw Error('Invalid API path');
  const r=await fetchImpl('https://api.github.com/repos/'+repository+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!r.ok)throw Error('GitHub HTTP '+r.status);return r.json();
 };
}
export async function gather({request,repository,scope,day=auditDay(),directory,download}){
 const start=day+'T03:00:00Z',end=day+'T23:59:59Z';
 const runs=await request('/actions/workflows/nightly-audit.yml/runs?per_page=30&created='+encodeURIComponent(start+'..'+end));
 if(runs.total_count>30)throw Error('Daily run budget exceeded; refusing truncated evidence');
 const parts=[];for(const run of runs.workflow_runs.filter(r=>r.status==='completed').slice(0,12)){
  const data=await request('/actions/runs/'+run.id+'/artifacts?per_page=30');if(data.total_count>30)throw Error('Artifact cap exceeded');
  for(const artifact of data.artifacts.filter(a=>a.name.startsWith('sfstore-nightly-part-')&&!a.expired)){
   const p=await download(artifact,'results.json',directory);
   if(p.scope!==scope||p.day!==day)continue;
   if(p.runUrl!=='https://github.com/'+repository+'/actions/runs/'+run.id)throw Error('Evidence provenance mismatch');
   parts.push(p);
  }
 }
 // Previous reports are obtained only from the dedicated report workflow.
 const history=await request('/actions/workflows/nightly-report.yml/runs?status=success&per_page=20&created='+encodeURIComponent('<'+start));
 let previous=null;for(const run of history.workflow_runs.slice(0,10)){
  const data=await request('/actions/runs/'+run.id+'/artifacts?per_page=20');
  const artifact=data.artifacts.find(a=>a.name.startsWith('sfstore-nightly-report-')&&!a.expired);
  if(!artifact)continue;const report=await download(artifact,'report.json',directory);
  if(report.scope===scope){previous=report;break;}
 }
 return {parts,previous};
}
export function validateArtifactSource(artifact){
 const source=new URL(artifact.archive_download_url);
 if(source.protocol!=='https:'||source.hostname!=='api.github.com'||source.port||source.username||source.password||source.search||source.hash||!Number.isSafeInteger(artifact.id)||!new RegExp('^/repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/actions/artifacts/'+artifact.id+'/zip$').test(source.pathname))throw Error('Unexpected artifact API source');
 return source.href;
}
export async function downloadArtifact(artifact,member,directory,token){
 const archiveUrl=validateArtifactSource(artifact);
 if(artifact.size_in_bytes>5000000)throw Error('Artifact exceeds budget');
 mkdirSync(directory,{recursive:true});
 // Auth header is sent only to api.github.com; signed download redirect gets no token.
 const first=await fetch(archiveUrl,{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(first.status!==302)throw Error('Artifact unavailable');const signed=new URL(first.headers.get('location'));
 if(signed.protocol!=='https:'||!signed.hostname.endsWith('.blob.core.windows.net'))throw Error('Unexpected artifact host');
 const response=await fetch(signed,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Artifact download failed');
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>5000000)throw Error('Artifact exceeds budget');
 const path=join(directory,String(artifact.id)+'.zip');writeFileSync(path,bytes);
 // Reads one fixed member to stdout. Never extracts paths or executes artifact code.
 const parsed=spawnSync('unzip',['-p',path,member],{encoding:'utf8',timeout:10000,maxBuffer:5000000});
 if(parsed.status!==0)throw Error('Artifact format invalid');return JSON.parse(parsed.stdout);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [scope,day,output]=process.argv.slice(2);
 const token=process.env.GH_TOKEN,repository=process.env.GITHUB_REPOSITORY,request=api({repository,token});
 gather({request,repository,scope,day,directory:join(output,'private-downloads'),download:(a,m,d)=>downloadArtifact(a,m,d,token)})
 .then(data=>{mkdirSync(output,{recursive:true});writeFileSync(join(output,'input.json'),JSON.stringify(data));console.log('Collected '+data.parts.length+' phase results.');})
 .catch(()=>{console.error('Evidence collection unavailable; no report claims published');process.exitCode=1;});
}
