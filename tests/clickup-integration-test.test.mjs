import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runTest,synthetic,LIST,NAME} from '../scripts/nightly/clickup-integration-test.mjs';
import {taskDescription} from '../scripts/nightly/clickup.mjs';
const runUrl='https://github.com/Fedee17/sfstore/actions/runs/123';
const token='synthetic-private-token-only';
function fixture({tasks=[],ambiguous=false,denyComment=false,pageFull=false}={}) {
  const calls=[],comments=[];
  const state={tasks:structuredClone(tasks)};
  const fetchImpl=async (url,opts)=>{
    const path=new URL(url).pathname,method=opts.method||'GET';
    assert.equal(new URL(url).origin,'https://api.clickup.com');
    assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,token);
    calls.push({path,method});
    if(path===`/api/v2/list/${LIST}`)return Response.json({id:LIST});
    if(path===`/api/v2/list/${LIST}/task`&&method==='GET')return Response.json({tasks:pageFull?Array.from({length:100},(_,i)=>({id:'foreign'+i,name:'Other task',description:'private foreign data'})):state.tasks,last_page:!pageFull});
    if(path===`/api/v2/list/${LIST}/task`&&method==='POST'){
      if(ambiguous)throw Error(token+' private response');
      state.tasks.push({id:'abc123xyz',list:{id:LIST},...JSON.parse(opts.body)});
      return Response.json(state.tasks.at(-1));
    }
    const t=state.tasks.find(t=>path===`/api/v2/task/${t.id}`||path===`/api/v2/task/${t.id}/comment`);
    assert.ok(t,'Never access an unrelated task');
    if(path.endsWith('/comment')) {
      if(method==='POST'){
        if(denyComment)return Response.json({error:token},{status:403});
        const c={id:'comment1',...JSON.parse(opts.body)};comments.push(c);return Response.json(c);
      }
      return Response.json({comments});
    }
    if(method==='PUT')Object.assign(t,JSON.parse(opts.body));
    return Response.json(t);
  };
  return {fetchImpl,calls,state};
}
const options=m=>({token,listId:LIST,runUrl,fetchImpl:m.fetchImpl,sleep:async()=>{}});
test('create one fixture, sync again without duplicate, verify PUT and comment; reuse fixture on later run',async()=>{
  const m=fixture(),result=await runTest(options(m));
  assert.equal(result.createdThisRun,1);assert.equal(result.secondSyncChanges,0);
  assert.equal(result.finalMatchingTasks,1);assert.equal(result.update,'passed');assert.equal(result.comment,'passed');
  assert.equal(m.state.tasks.length,1);assert.equal(m.state.tasks[0].name,NAME);
  assert.equal(m.calls.filter(c=>c.method==='POST'&&!c.path.endsWith('/comment')).length,1);
  assert.equal(m.calls.filter(c=>c.method==='PUT').length,1);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(token));
  const again=await runTest({...options(m),runUrl:runUrl.replace('123','456')});
  assert.equal(again.createdThisRun,0);assert.equal(again.creation,'not_retested_existing_fixture');
  assert.equal(again.stableId,result.stableId);assert.equal(again.taskId,result.taskId);assert.equal(m.state.tasks.length,1);
});
test('wrong list or absent token stops before network',async()=>{
  const m=fixture();await assert.rejects(runTest({...options(m),listId:'999'}));
  await assert.rejects(runTest({...options(m),token:''}));assert.equal(m.calls.length,0);
});
test('unmarked name collision stops without creating or modifying',async()=>{
  const m=fixture({tasks:[{id:'foreign',name:NAME,description:'Private unrelated task'}]});
  await assert.rejects(runTest(options(m)),/unmarked_name_collision/);
  assert.ok(m.calls.every(c=>c.method==='GET'));
});
test('duplicate stable markers stop without writes',async()=>{
  const description=taskDescription(synthetic(runUrl),'active');
  const m=fixture({tasks:['one','two'].map(id=>({id,name:NAME,description,list:{id:LIST}}))});
  await assert.rejects(runTest(options(m)),/duplicate_marker/);assert.ok(m.calls.every(c=>c.method==='GET'));
});
test('task from another home list stops before task endpoints',async()=>{
  const m=fixture({tasks:[{id:'foreign',name:NAME,description:taskDescription(synthetic(runUrl),'active'),list:{id:'999'}}]});
  await assert.rejects(runTest(options(m)),/task_scope_mismatch/);assert.ok(m.calls.every(c=>c.path.includes('/list/')));
});
test('ambiguous creation never retries POST or logs server error',async()=>{
  const m=fixture({ambiguous:true});await assert.rejects(runTest(options(m)),error=>!error.message.includes(token));
  assert.equal(m.calls.filter(c=>c.method==='POST').length,1);
});
test('incomplete pagination stops before any mutation',async()=>{
  const m=fixture({pageFull:true});await assert.rejects(runTest(options(m)),/Pagination cap/);
  assert.ok(m.calls.every(c=>c.method==='GET'));assert.equal(m.calls.length,21);
});
test('comment permission denial fails validation; does not create an extra task or expose body',async()=>{
  const m=fixture({denyComment:true});await assert.rejects(runTest(options(m)),/http_403/);
  assert.equal(m.state.tasks.length,1);assert.equal(m.calls.filter(c=>c.path.endsWith('/comment')&&c.method==='POST').length,1);
});
test('registered workflow probe is gated, has no live mode and makes no ClickUp calls',()=>{
  const source=readFileSync(new URL('../.github/workflows/dependency-security-linux.yml',import.meta.url),'utf8');
  assert.match(source,/options: \[off, probe\]/);assert.match(source,/default: off/);
  assert.match(source,/inputs.integration_mode == 'off'/);
  const probe=source.slice(source.indexOf('  integration-probe:'));
  assert.ok(probe.includes("github.ref == 'refs/heads/codex/nightly-audit-clickup'"));
  assert.ok(probe.includes('inputs.expected_sha == github.sha'));
  assert.match(probe,/name: nightly-audit-clickup\s+deployment: false/);
  for(const forbidden of ['fetch(', 'curl', 'wget', 'runTest(', 'node scripts/nightly/clickup-integration-test.mjs'])assert.ok(!probe.includes(forbidden));
  for(const match of probe.matchAll(/uses: (\S+)/g))assert.match(match[1],/@[a-f0-9]{40}$/);
  assert.equal([...probe.matchAll(/CLICKUP_API_TOKEN: /g)].length,1);
});
