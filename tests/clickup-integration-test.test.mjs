import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runTest,synthetic,LIST,NAME,STABLE_ID,executionAllowed} from '../scripts/nightly/clickup-integration-test.mjs';
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
    if(path===`/api/v2/list/${LIST}/task`&&method==='GET')return Response.json({tasks:pageFull?Array.from({length:100},(_,i)=>({id:'foreign'+new URL(url).searchParams.get('page')+'_'+i,name:'Other task',description:'private foreign data'})):state.tasks.filter(t=>Boolean(t.archived)===(new URL(url).searchParams.get('archived')==='true')),last_page:!pageFull});
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

test('marker is exactly the reviewed constant; unrelated commercial task stays unchanged',async()=>{
  assert.equal(synthetic(runUrl).id,STABLE_ID);
  assert.equal(STABLE_ID,'SFNA-6c53c97054f83f69efc32cdb');
  const business={id:'business1',name:'Pedido comercial',description:'No tocar',list:{id:LIST}};
  const m=fixture({tasks:[business]});await runTest(options(m));
  assert.deepEqual(m.state.tasks[0],business);
  assert.ok(!m.calls.some(c=>c.path.includes('/task/business1')));
});

test('marker copied onto a commercial description or malformed marker stops before writes',async()=>{
  for(const description of ['SFSTORE-AUDIT-ID: '+STABLE_ID+'\nPedido comercial',STABLE_ID]) {
    const m=fixture({tasks:[{id:'business1',name:NAME,description,list:{id:LIST}}]});
    await assert.rejects(runTest(options(m)),/task_scope_mismatch/);
    assert.ok(m.calls.every(c=>c.method==='GET'));
  }
});

for(const status of [401,403,429,500]) {
  test(`HTTP ${status} on creation stops after exactly one POST, no retry or sensitive response`,async()=>{
    const m=fixture();let posts=0;
    const transport=async(url,opts)=>{
      if(opts.method==='POST') {posts++;return Response.json({error:token},{status});}
      return m.fetchImpl(url,opts);
    };
    await assert.rejects(runTest({...options(m),fetchImpl:transport}),new RegExp('http_'+status));
    assert.equal(posts,1);assert.equal(m.state.tasks.length,0);
  });
}

test('GET auth failure stops before writes and does not retry',async()=>{
  let calls=0;
  await assert.rejects(runTest({...options(fixture()),fetchImpl:async()=>{
    calls++;return Response.json({secret:token},{status:401});
  }}),/http_401/);assert.equal(calls,1);
});

test('invalid JSON after creation stops without a second creation',async()=>{
  const m=fixture();let posts=0;
  await assert.rejects(runTest({...options(m),fetchImpl:async(url,opts)=>{
    if(opts.method==='POST'){posts++;return new Response('not JSON');}
    return m.fetchImpl(url,opts);
  }}),/malformed_response/);assert.equal(posts,1);
});

test('malformed or repeated pagination fails before mutations',async()=>{
  for(const data of [{tasks:null},{tasks:[],last_page:false},{tasks:[],last_page:'true'},
    {tasks:[{id:'same',name:'Business'},{id:'same',name:'Business'}],last_page:true}]) {
    const m=fixture();
    await assert.rejects(runTest({...options(m),fetchImpl:async(url,opts)=>{
      if(new URL(url).pathname.endsWith('/task'))return Response.json(data);
      return m.fetchImpl(url,opts);
    }}),/pagination/);
    assert.ok(m.calls.every(c=>c.method==='GET'));
  }
});

test('explicit last_page=false requires next page even when first page is short',async()=>{
  const own={id:'abc123xyz',name:NAME,description:taskDescription(synthetic(runUrl),'active'),list:{id:LIST}};
  const m=fixture({tasks:[own]});let pages=0;
  const result=await runTest({...options(m),fetchImpl:async(url,opts)=>{
    if(opts.method==='GET'&&new URL(url).pathname===`/api/v2/list/${LIST}/task`) {
      if(new URL(url).searchParams.get('archived')==='true')return Response.json({tasks:[],last_page:true});
      pages++;return Response.json(new URL(url).searchParams.get('page')==='0'?
        {tasks:[{id:'business1',name:'Commercial'}],last_page:false}:{tasks:m.state.tasks,last_page:true});
    }
    return m.fetchImpl(url,opts);
  }});
  assert.equal(result.createdThisRun,0);assert.ok(pages>=6);
});

test('archived fixture is reused without another creation',async()=>{
  const own={id:'abc123xyz',name:NAME,description:taskDescription(synthetic(runUrl),'active').replaceAll('\n','\r\n'),list:{id:LIST},archived:true};
  const m=fixture({tasks:[own]});const result=await runTest(options(m));
  assert.equal(result.createdThisRun,0);assert.equal(m.state.tasks.length,1);
});

test('duplicate marker across active and archived/subtask pages stops before any write',async()=>{
  const description=taskDescription(synthetic(runUrl),'active');
  const m=fixture({tasks:[{id:'active1',name:NAME,description,list:{id:LIST}},
    {id:'archived1',name:NAME,description,list:{id:LIST},archived:true,parent:'parent1'}]});
  await assert.rejects(runTest(options(m)),/duplicate_marker/);
  assert.ok(m.calls.every(c=>c.method==='GET'));
});

test('runtime execution requires every manual gate including reviewed SHA',()=>{
  const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'Fedee17/sfstore',
    GITHUB_REF:'refs/heads/codex/nightly-audit-clickup',GITHUB_ACTOR:'Fedee17',CLICKUP_TEST_MODE:'live-test',
    CLICKUP_TEST_SHA:'c654892124e482a129cf3d38257df8d0d1dce18e',GITHUB_SHA:'c654892124e482a129cf3d38257df8d0d1dce18e',CLICKUP_TEST_CONFIRM:LIST};
  assert.equal(executionAllowed(env),true);
  for(const key of Object.keys(env))assert.equal(executionAllowed({...env,[key]:''}),false,key);
  assert.equal(executionAllowed({...env,GITHUB_EVENT_NAME:'push'}),false);
  assert.equal(executionAllowed({...env,GITHUB_REF:'refs/heads/main'}),false);
  assert.equal(executionAllowed({...env,CLICKUP_TEST_MODE:'probe'}),false);
  assert.equal(executionAllowed({...env,GITHUB_SHA:'a'.repeat(40)}),false);
});

test('ambiguous PUT and comment POST are never retried',async()=>{
  for(const method of ['PUT','POST']) {
    const m=fixture({tasks:[{id:'abc123xyz',name:NAME,description:taskDescription(synthetic(runUrl),'active'),list:{id:LIST}}]});
    let writes=0;
    await assert.rejects(runTest({...options(m),fetchImpl:async(url,opts)=>{
      if(opts.method===method){writes++;throw Error(token);}
      return m.fetchImpl(url,opts);
    }}),error=>!error.message.includes(token));
    assert.equal(writes,1);assert.equal(m.state.tasks.length,1);
  }
});

test('task edited into a commercial task between list read and PUT is rejected',async()=>{
  const m=fixture({tasks:[{id:'abc123xyz',name:NAME,description:taskDescription(synthetic(runUrl),'active'),list:{id:LIST}}]});
  let details=0;
  await assert.rejects(runTest({...options(m),fetchImpl:async(url,opts)=>{
    if(opts.method==='GET'&&new URL(url).pathname===`/api/v2/task/abc123xyz`&&++details>=2)
      return Response.json({...m.state.tasks[0],name:'Pedido comercial'});
    return m.fetchImpl(url,opts);
  }}),/task_scope_mismatch/);
  assert.ok(m.calls.every(c=>c.method==='GET'));
});

test('ClickUp rich text comment response is verified on the same comment ID',async()=>{
  const m=fixture();const result=await runTest({...options(m),fetchImpl:async(url,opts)=>{
    const response=await m.fetchImpl(url,opts);
    if(opts.method==='GET'&&new URL(url).pathname.endsWith('/comment')) {
      const data=await response.json();return Response.json({comments:data.comments.map(c=>({id:c.id,comment:[{text:c.comment_text}]}))});
    }
    return response;
  }});
  assert.equal(result.comment,'passed');
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
test('registered workflow probe remains gated and makes no ClickUp calls',()=>{
  const source=readFileSync(new URL('../.github/workflows/dependency-security-linux.yml',import.meta.url),'utf8');
  assert.match(source,/options: \[off, probe, live-test\]/);assert.match(source,/default: off/);
  assert.match(source,/inputs.integration_mode == 'off'/);
  const probe=source.slice(source.indexOf('  integration-probe:'),source.indexOf('  integration-live-test:'));
  assert.ok(probe.includes("github.ref == 'refs/heads/codex/nightly-audit-clickup'"));
  assert.ok(probe.includes('inputs.expected_sha == github.sha'));
  assert.match(probe,/name: nightly-audit-clickup\s+deployment: false/);
  for(const forbidden of ['fetch(', 'curl', 'wget', 'runTest(', 'node scripts/nightly/clickup-integration-test.mjs'])assert.ok(!probe.includes(forbidden));
  for(const match of probe.matchAll(/uses: (\S+)/g))assert.match(match[1],/@[a-f0-9]{40}$/);
  assert.equal([...probe.matchAll(/CLICKUP_API_TOKEN: /g)].length,1);
});

test('live workflow has explicit manual branch/SHA/list/actor gates, no automatic trigger',()=>{
  const source=readFileSync(new URL('../.github/workflows/dependency-security-linux.yml',import.meta.url),'utf8');
  const live=source.slice(source.indexOf('  integration-live-test:'));
  for(const gate of ["github.event_name == 'workflow_dispatch'","github.actor == 'Fedee17'",
    "github.repository == 'Fedee17/sfstore'","github.ref == 'refs/heads/codex/nightly-audit-clickup'",
    "inputs.integration_mode == 'live-test'","inputs.confirm_list == '901717762349'",'inputs.expected_sha == github.sha'])assert.ok(live.includes(gate));
  assert.match(live,/name: nightly-audit-clickup\s+deployment: false/);
  assert.doesNotMatch(source,/^\s+(schedule|push):/m);
  assert.equal([...live.matchAll(/CLICKUP_API_TOKEN: /g)].length,1);
  assert.ok(live.indexOf('Offline integration regressions')<live.indexOf('CLICKUP_API_TOKEN:'));
  assert.match(live,/CLICKUP_TEST_MODE: \$\{\{ inputs.integration_mode \}\}/);
  assert.match(live,/CLICKUP_TEST_SHA: \$\{\{ inputs.expected_sha \}\}/);
});
