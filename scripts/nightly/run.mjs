import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditDay,finding} from './core.mjs';
export function cleanEnvironment(source=process.env){
 const allowed=['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','HOME','USERPROFILE','TMP','TEMP','TMPDIR'];
 const env=Object.fromEntries(allowed.filter(k=>source[k]).map(k=>[k,source[k]]));
 return {...env,CI:'true',NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'production'};
}
export async function command(bin,args,{cwd,timeout=180000,env=cleanEnvironment()}){
 return new Promise(resolveResult=>{
  let stdout='',stderr='',timedOut=false;const child=spawn(bin,args,{cwd,env,shell:false,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  const append=(old,value)=>(old+value.toString()).slice(-2000000);
  child.stdout.on('data',v=>stdout=append(stdout,v));child.stderr.on('data',v=>stderr=append(stderr,v));
  const timer=setTimeout(()=>{timedOut=true;if(process.platform!=='win32'){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}else child.kill();},timeout);
  child.on('error',()=>{clearTimeout(timer);resolveResult({code:null,stdout:'',stderr:'Tool unavailable',timedOut:false});});
  child.on('close',code=>{clearTimeout(timer);resolveResult({code,stdout,stderr,timedOut});});
 });
}
export function normalizeAudit(data,base){
 const out=[];for(const [name,v]of Object.entries(data.vulnerabilities||{})){
  for(const via of (v.via||[]).filter(x=>typeof x==='object')){
   out.push(finding({...base,check:'dependencies',rule:String(via.source||via.url),file:'package-lock.json:'+name,title:via.title,category:'dependencies',severity:via.severity,
   evidence:'npm audit --json: '+name+' '+(via.range||v.range)+'; '+via.url,impact:'Dependencia vulnerable; revisar alcance y exposición de la ruta afectada.',suggestion:'Revisar el advisory y una actualización compatible; no ejecutar npm audit fix automáticamente.'}));
  }
 }
 return out;
}
export function normalizeEslint(data,base){
 return data.flatMap(file=>file.messages.filter(m=>m.severity===2).map(m=>finding({...base,check:'eslint',rule:m.ruleId||'parser',file:file.filePath.replaceAll('\\','/').replace(base.root.replaceAll('\\','/')+'/',''),title:'ESLint: '+(m.ruleId||'error de parseo'),evidence:'Línea '+m.line+': '+m.message,category:m.ruleId?.startsWith('jsx-a11y/')?'accessibility':'quality'})));
}
export function testCoverage(stdout){
 const counts=Object.fromEntries(['tests','pass','fail','skipped'].map(key=>[key,Number(stdout.match(new RegExp('^# '+key+' (\\d+)','m'))?.[1]||0)]));
 return {counts,complete:counts.tests>0&&counts.skipped===0};
}
export async function run({root,phase,scope,sha,runUrl='',day=auditDay(),output,tools={}}){
 if(!['security','quality','checkout','all'].includes(phase))throw Error('Invalid phase');
 if(!/^[a-f0-9]{40}$/.test(sha)||!scope||/[\r\n]/.test(scope))throw Error('Invalid target');
 root=resolve(root);output=resolve(output);if(existsSync(join(root,'.env.local'))||existsSync(join(root,'.env.production')))throw Error('Use a clean checkout without local credentials');
 const config=JSON.parse(readFileSync(new URL('../../audit/nightly/config.json',import.meta.url)));
 const base={scope,root,runUrl},checks=[],findings=[];
 const add=async(id,bin,args,mode,parse,successCodes=[0])=>{
  const r=await command(bin,args,{cwd:root,timeout:id==='build'?600000:180000});
  const available=r.code!==null&&!r.timedOut;
  const beforeCount=findings.length;let parsed=true;try{if(parse&&available)findings.push(...parse(r));}catch{parsed=false;}
  const failed=available&&!successCodes.includes(r.code);
  if(failed&&!parse)findings.push(finding({...base,check:id,rule:'command-failed',file:'repository',title:id+' falló',category:id==='checkout'?'checkout':'quality',mode,evidence:'Comando: '+bin+' '+args.join(' ')+'; exit '+r.code+'. Salida privada omitida; reproducir en un checkout limpio del SHA registrado.'}));
  const testResult=(id==='tests'||id==='checkout')?testCoverage(r.stdout):null;const complete=available&&parsed&&(!testResult||testResult.complete);
  checks.push({id,command:bin+' '+args.join(' '),mode,status:!complete?'unavailable':failed||findings.length>beforeCount?'failed':'passed',complete,
   ...(id==='tests'||id==='checkout'?{counts:testResult.counts,note:'Suites con DB/servicios reales excluidas. Se registran skips; no prueban Production. '+(r.stdout.match(/# skipped \d+/)?.[0]||'')}:{})});
 };
 const npm=tools.npm||'npm',node=tools.node||process.execPath;
 const moduleBin=name=>join(root,'node_modules',...name.split('/'));
 if(phase==='security'||phase==='all'){
  await add('dependencies',npm,[...(tools.npmArgs||[]),'audit','--json','--ignore-scripts'],'static',r=>{const d=JSON.parse(r.stdout);if(d.error||!d.vulnerabilities)throw Error('audit unavailable');return normalizeAudit(d,base);},[0,1]);
  // Only normalized location/rule survive; raw secret matches never leave the runner.
  const secretReport=join(output,'gitleaks-private.json');mkdirSync(output,{recursive:true});
  if(!existsSync(join(root,'.git')))checks.push({id:'secrets',complete:false,status:'unavailable',mode:'static',command:'gitleaks git',note:'Target has no Git metadata; do not scan a parent repository.'});
  else await add('secrets',tools.gitleaks||'gitleaks',['git',root,'--log-opts=HEAD','--redact=100','--no-banner','--report-format=json','--report-path='+secretReport],'static',r=>{
   if(![0,1].includes(r.code))throw Error('scanner unavailable');const data=existsSync(secretReport)?JSON.parse(readFileSync(secretReport)):[];return data.map(x=>finding({...base,check:'secrets',rule:x.RuleID,file:x.File,title:'Posible secreto versionado',category:'security',severity:'high',evidence:'Gitleaks '+x.RuleID+'; línea '+x.StartLine+'. Contenido omitido.',suggestion:'Revisar de forma privada, revocar si corresponde y eliminar la exposición mediante un cambio revisado.'}));
  },[0,1]);
  await add('semgrep',tools.semgrep||'semgrep',['scan','--config',fileURLToPath(new URL('../../audit/nightly/semgrep.yml',import.meta.url)),'--json','--metrics=off','--disable-version-check','.'],'static',r=>{
   const d=JSON.parse(r.stdout);if(r.code!==0||(d.errors||[]).length)throw Error('semgrep incomplete');return(d.results||[]).map(x=>finding({...base,check:'semgrep',rule:x.check_id,file:x.path,title:x.extra.message,category:'security',severity:'high',evidence:'Semgrep '+x.check_id+'; línea '+x.start.line+'. Patrón estático; revisar contexto antes de corregir.'}));
  });
 }
 if(phase==='quality'||phase==='all'){
  await add('build',node,[moduleBin('next/dist/bin/next'),'build'],'synthetic');
  await add('typescript',node,[moduleBin('typescript/bin/tsc'),'--noEmit'],'static');
  await add('eslint',node,[moduleBin('eslint/bin/eslint.js'),'.','--format','json'],'static',r=>{if(![0,1].includes(r.code))throw Error('eslint unavailable');return normalizeEslint(JSON.parse(r.stdout),base);},[0,1]);
  const names=readdirSync(join(root,'tests')).filter(n=>n.endsWith('.test.mjs')&&!config.generalTestsExclude.some(x=>n.includes(x))).sort();
  if(names.length)await add('tests',node,['--test','--test-reporter=tap',...names.map(n=>join('tests',n))],'synthetic');
  else checks.push({id:'tests',complete:false,status:'unavailable',mode:'synthetic',command:'node --test',note:'No tests found'});
 }
 if(phase==='checkout'||phase==='all'){
  const present=config.checkoutTests.filter(n=>existsSync(join(root,'tests',n)));
  if(present.length===config.checkoutTests.length)await add('checkout',node,['--test','--test-reporter=tap',...present.map(n=>join('tests',n))],'synthetic');
  else checks.push({id:'checkout',complete:false,status:'unavailable',mode:'synthetic',command:'node --test checkout allowlist',note:'Faltan tests aprobados: '+config.checkoutTests.filter(n=>!present.includes(n)).join(', ')});
 }
 const result={schemaVersion:1,scope,sha,phase,day,runUrl,finishedAt:new Date().toISOString(),checks,findings};
 mkdirSync(output,{recursive:true});writeFileSync(join(output,'results.json'),JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,phase,scope,sha,output]=process.argv.slice(2);
 run({root,phase,scope,sha,output,runUrl:process.env.AUDIT_RUN_URL}).then(r=>console.log('Audit: '+r.checks.length+' controles; '+r.findings.length+' hallazgos; '+r.checks.filter(c=>!c.complete).length+' incompletos.')).catch(()=>{console.error('Audit unavailable; no raw diagnostics published');process.exitCode=1;});
}
