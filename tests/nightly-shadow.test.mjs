import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {executeShadow,validatePrevious,scope,targetSha} from '../scripts/nightly/shadow.mjs';
const runUrl='https://github.com/Fedee17/sfstore/actions/runs/123';
const checks={security:['dependencies','secrets','semgrep'],quality:['build','typescript','eslint','tests'],checkout:['checkout']};
const options=()=>({root:'unused',sha:targetSha,controllerSha:'b'.repeat(40),day:'2026-10-14',runUrl,output:mkdtempSync(join(tmpdir(),'sfstore-shadow-offline-'))});
const detector=async o=>({schemaVersion:1,scope:o.scope,sha:o.sha,day:o.day,phase:o.phase,runUrl:o.runUrl,finishedAt:'2026-10-14T04:00:00Z',findings:[],checks:checks[o.phase].map(id=>({id,complete:true,status:'passed'}))});
test('shadow fixes one SHA/day across all phases and produces full report without network',async()=>{
 const args=options(),calls=[];
 const result=await executeShadow({...args,runImpl:async o=>{calls.push(o);return detector(o);}});
 assert.equal(result.complete,true);assert.equal(result.checks.length,8);assert.equal(result.clickupRequests,0);
 assert.deepEqual(calls.map(o=>o.phase),['security','quality','checkout']);assert.ok(calls.every(o=>o.sha===targetSha&&o.day===args.day&&o.scope===scope));
 assert.match(readFileSync(join(args.output,'report.md'),'utf8'),/Primera línea base/);
});
test('shadow incomplete phase produces diagnostic report and fails coverage',async()=>{
 const args=options();const result=await executeShadow({...args,runImpl:async o=>{const p=await detector(o);if(o.phase==='quality')p.checks[0].complete=false;return p;}});
 assert.equal(result.complete,false);assert.ok(JSON.parse(readFileSync(join(args.output,'report.json'))).missing.includes('build'));
});
test('shadow rejects unreviewed target before executing a detector',async()=>{
 await assert.rejects(executeShadow({...options(),sha:'a'.repeat(40),runImpl:()=>{throw Error('Should not run');}}),/scope mismatch/);
});
test('shadow exceptions do not pretend to produce a complete report',async()=>{
 await assert.rejects(executeShadow({...options(),runImpl:()=>{throw Error('Synthetic cancellation');}}),/Synthetic cancellation/);
});
test('historical comparison accepts only prior complete shadow evidence with exact provenance',()=>{
 const report={scope,day:'2026-10-13',coherent:true,missing:[],runUrls:[runUrl],shas:[targetSha],shadow:{controllerSha:'b'.repeat(40),targetSha}};
 assert.equal(validatePrevious(report,{day:'2026-10-14',runUrl}),report);
 for(const patch of [{day:'2026-10-14'},{coherent:false},{scope:'main'},{missing:['checkout']},{runUrls:['https://example.invalid']},{shas:['a'.repeat(40)]},{shadow:{controllerSha:'invalid',targetSha}}])
  assert.throws(()=>validatePrevious({...report,...patch},{day:'2026-10-14',runUrl}));
});
