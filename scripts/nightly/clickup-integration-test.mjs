import {client, plan} from './clickup.mjs';
import {finding} from './core.mjs';
import {mkdirSync, writeFileSync, appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const LIST = '901717762349';
export const NAME = '[TEST] SFSTORE — Integración de auditorías';
const ORIGIN = 'https://api.clickup.com';
const PREFIX = '/api/v2';
const BASE = `${PREFIX}/list/${LIST}`;
export function synthetic(runUrl) {
  return finding({scope:'sfstore-clickup-integration-test-v1',check:'integration',
    rule:'single-task-dedup-v1',file:'synthetic-fixture',title:NAME,category:'technical',
    severity:'medium',mode:'synthetic',detectedAt:'2026-10-13T00:00:00.000Z',runUrl,
    evidence:'Fixture sintético de integración. No representa una vulnerabilidad.',
    impact:'Verificar exclusivamente lectura, creación, edición y comentario en la lista de prueba.',
    suggestion:'Conservar esta única tarea para futuras pruebas de deduplicación.'});
}
function requireSafe(condition, code) { if (!condition) throw Error(code); }
function candidates(tasks, f) {
  const marker = 'SFSTORE-AUDIT-ID: '+f.id;
  const own = tasks.filter(t => (t.description||'').split(/\r?\n/).includes(marker));
  requireSafe(own.length <= 1, 'duplicate_marker');
  requireSafe(!tasks.some(t=>t.name===NAME&&!own.includes(t)), 'unmarked_name_collision');
  for(const t of own) requireSafe(t.name===NAME && String(t.list?.id)===LIST && /^[a-zA-Z0-9_-]+$/.test(t.id), 'task_scope_mismatch');
  return own;
}
// Use the PR's actual planner and transport; only adapt the fixture's display name.
function testPlan(f, tasks) {
  const own=candidates(tasks,f);
  return plan({groups:{new:[f],persistent:[],resolved:[]}},
    own.map(t=>({...t,name:'[medium] '+NAME})))
    .map(c=>({...c,payload:{...c.payload,name:NAME}}));
}
export async function runTest({token,listId,runUrl,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}) {
  requireSafe(token && listId===LIST, 'configuration_missing_or_wrong_list');
  requireSafe(/^https:\/\/github\.com\/Fedee17\/sfstore\/actions\/runs\/\d+$/.test(runUrl), 'invalid_run_url');
  const f=synthetic(runUrl), marker='SFSTORE-AUDIT-ID: '+f.id;
  let taskId=null, creates=0, updates=0, comments=0, requests=0;
  const commentText=`[TEST] SFSTORE — comentario de integración\n${marker}\nEjecución: ${runUrl}\nNo se sincronizaron hallazgos reales.`;
  async function guardedFetch(raw, opts={}) {
    const url=new URL(raw), method=opts.method||'GET';
    requireSafe(url.origin===ORIGIN&&!url.username&&!url.password&&!url.hash, 'forbidden_origin');
    const path=url.pathname;
    const pageRead=method==='GET'&&path===BASE+'/task'&&
      /^\?include_closed=true&subtasks=false&page=\d+$/.test(url.search);
    const listRead=method==='GET'&&path===BASE&&!url.search;
    const ownRead=taskId&&method==='GET'&&path===`${PREFIX}/task/${taskId}`&&!url.search;
    const commentRead=taskId&&method==='GET'&&path===`${PREFIX}/task/${taskId}/comment`&&!url.search;
    const create=method==='POST'&&path===BASE+'/task'&&!url.search;
    const update=taskId&&method==='PUT'&&path===`${PREFIX}/task/${taskId}`&&!url.search;
    const comment=taskId&&method==='POST'&&path===`${PREFIX}/task/${taskId}/comment`&&!url.search;
    requireSafe(listRead||pageRead||ownRead||commentRead||create||update||comment, 'forbidden_endpoint');
    if(create||update) {
      const payload=JSON.parse(opts.body);
      requireSafe(payload.name===NAME&&payload.description.split(/\r?\n/).includes(marker)&&
        Object.keys(payload).sort().join(',')==='description,name', 'forbidden_payload');
      // A failed/ambiguous POST spends the budget too: never blindly retry creation.
      if(create) requireSafe(++creates===1, 'creation_budget_exceeded');
      if(update) requireSafe(++updates<=3, 'update_budget_exceeded');
    }
    if(comment) {
      requireSafe(opts.body===JSON.stringify({comment_text:commentText,notify_all:false}), 'forbidden_comment');
      requireSafe(++comments===1, 'comment_budget_exceeded');
    }
    requireSafe(++requests<=100, 'request_budget_exceeded');
    return fetchImpl(url.href,{...opts,redirect:'error',signal:AbortSignal.timeout(15000)});
  }
  async function request(path, method='GET', body) {
    let response;
    try { response=await guardedFetch(ORIGIN+path,{method,headers:{Authorization:token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}); }
    catch { throw Error(method==='POST'?'ambiguous_post_stop_and_reconcile':'request_unavailable'); }
    requireSafe(response.ok, 'http_'+response.status);
    try { return await response.json(); } catch { throw Error('malformed_response'); }
  }
  const list=await request(BASE);
  requireSafe(String(list.id)===LIST, 'list_mismatch');
  const api=client({token,listId:LIST,fetchImpl:guardedFetch,sleep});
  let tasks=await api.tasks(), own=candidates(tasks,f);
  const first=testPlan(f,tasks);
  requireSafe(first.length<=1, 'change_budget_exceeded');
  if(own.length) taskId=own[0].id;
  await api.apply(first);
  // Poll reads only, allowing list visibility to settle. Never issue another create.
  for(let attempt=0;attempt<4;attempt++) {
    tasks=await api.tasks(); own=candidates(tasks,f);
    if(own.length===1) break;
    await sleep(1000);
  }
  requireSafe(own.length===1, 'creation_not_visible_stop_and_reconcile');
  taskId=own[0].id;
  const detail=await request(`${PREFIX}/task/${taskId}`);
  requireSafe(candidates([detail],f).length===1&&detail.id===taskId, 'task_detail_mismatch');
  const second=testPlan(f,tasks);
  requireSafe(second.length===0, 'second_sync_not_idempotent');
  await api.apply(second);
  // Force a real PUT with test metadata, then verify it on the same task.
  const changed={...f,evidence:f.evidence+' Actualización sintética autorizada.'};
  const changes=testPlan(changed,tasks);
  requireSafe(changes.length===1&&changes[0].method==='PUT'&&changes[0].taskId===taskId, 'invalid_update_plan');
  await api.apply(changes);
  const updated=await request(`${PREFIX}/task/${taskId}`);
  requireSafe(candidates([updated],f).length===1&&updated.description===changes[0].payload.description, 'update_not_verified');
  const added=await request(`${PREFIX}/task/${taskId}/comment`,'POST',{comment_text:commentText,notify_all:false});
  requireSafe(added.id!==undefined, 'comment_missing_id');
  const history=await request(`${PREFIX}/task/${taskId}/comment`);
  requireSafe(Array.isArray(history.comments)&&history.comments.some(c=>String(c.id)===String(added.id)&&c.comment_text===commentText), 'comment_not_verified');
  const final=candidates(await api.tasks(),f);
  requireSafe(final.length===1&&final[0].id===taskId, 'final_dedup_failed');
  const result={status:'passed',authentication:'passed',listId:LIST,stableId:f.id,
    taskId,taskUrl:`https://app.clickup.com/t/${taskId}`,runUrl,
    createdThisRun:creates,creation:first.some(c=>c.method==='POST')?'passed':'not_retested_existing_fixture',
    deduplication:'passed',secondSyncChanges:second.length,update:'passed',comment:'passed',
    finalMatchingTasks:final.length,outputPolicy:'allowlisted_fields_only',realFindingsSynced:0};
  requireSafe(!JSON.stringify(result).includes(token), 'credential_in_output_rejected');
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let result;
  try {
    requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&
      process.env.GITHUB_REPOSITORY==='Fedee17/sfstore'&&process.env.GITHUB_REF==='refs/heads/codex/nightly-audit-clickup'&&
      process.env.CLICKUP_TEST_CONFIRM===LIST, 'execution_gate_failed');
    result=await runTest({token:process.env.CLICKUP_API_TOKEN,listId:process.env.CLICKUP_LIST_ID,
      runUrl:`https://github.com/Fedee17/sfstore/actions/runs/${process.env.GITHUB_RUN_ID}`});
  } catch { result={status:'failed',reason:'controlled_test_failed_response_and_error_omitted',realFindingsSynced:0};process.exitCode=1; }
  const output=JSON.stringify(result,null,2);
  // Do not log server data, errors, list names, user identities, or credentials.
  mkdirSync('clickup-test-output',{recursive:true});writeFileSync('clickup-test-output/result.json',output+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'```json\n'+output+'\n```\n');
  console.log(output);
}
