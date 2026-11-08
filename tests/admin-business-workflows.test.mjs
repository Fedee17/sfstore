import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {catalogIssues,availabilityRows} from '../lib/admin/catalog-review.ts';
import {historyListHref,historyDetailHref,safeHistoryReturnPath} from '../lib/admin/history-navigation.ts';
import {createCommercialScopedReader,normalizeListOptions} from '../lib/commercial-reporting/list-reader.ts';
import {commercialDayBounds} from '../lib/commercial-reporting/periods.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function clientFixture(respond=()=>({rows:[],count:0})) {
  const urls=[];
  const client=createClient('https://synthetic.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async input=>{
    const url=new URL(input);urls.push(url);const {rows,count}=respond(url);
    return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json','Content-Range':rows.length?`0-${rows.length-1}/${count}`:`*/${count}`}});
  }}});
  return {read:createCommercialScopedReader(client),urls};
}

test('stock review preserves quantities, separates combos and does not invent a cost for them',()=>{
  const base={id:id(1),name:'SYNTHETIC',price:100,cost:70,stock:4,status:'active',product_images:[{url:'/local.jpg'}]};
  const rows=[base,{...base,id:id(2),stock:0,product_images:[]},{...base,id:id(3),stock:2,cost:null},{...base,id:id(4),stock:1,cost:null,component_offer:true},{...base,id:id(5),stock:0,status:'archived'}];
  const before=structuredClone(rows);
  assert.deepEqual(availabilityRows(rows,'low').map(row=>row.id),[id(4),id(3)]);
  assert.deepEqual(availabilityRows(rows,'out').map(row=>row.id),[id(2)]);
  assert.deepEqual(catalogIssues(rows[1]),['Sin foto']);assert.deepEqual(catalogIssues(rows[2]),['Sin costo válido']);assert.deepEqual(catalogIssues(rows[3]),[]);
  assert.deepEqual(catalogIssues({...base,price:NaN,cost:-1,product_images:[]}),['Sin foto','Sin precio válido','Sin costo válido']);
  assert.deepEqual(rows,before);
});

test('history links preserve the search, dates and page and reject external return destinations',()=>{
  const options={kind:'sales',page:3,origin:'historical',search:'Mate & termo',from:'2026-11-01',to:'2026-11-07',paymentStatus:'paid'};
  const href=historyListHref(options);const query=new URL(href,'https://synthetic.invalid').searchParams;
  assert.equal(query.get('search'),options.search);assert.equal(query.get('page'),'3');
  const detail=historyDetailHref('/admin/ventas/'+id(1),options);
  assert.equal(new URL(detail,'https://synthetic.invalid').searchParams.get('returnTo'),href);
  assert.equal(safeHistoryReturnPath(href,'sales'),href);
  for(const value of ['https://evil.invalid/admin/ventas','//evil.invalid/admin/ventas','javascript:alert(1)','/admin/compras','/admin/ventas/../configuracion'])assert.equal(safeHistoryReturnPath(value,'sales'),'/admin/ventas');
  assert.throws(()=>normalizeListOptions({...options,from:'2026-12-01'}),/INVALID_FILTER/);
  assert.throws(()=>normalizeListOptions({...options,date:'2026-11-01'}),/INVALID_FILTER/);
});

test('history uses both bounds in one civil-date clause for sales and purchases',async()=>{
  for(const [kind,key,column] of [['sales','orders','created_at'],['purchases','purchases','purchase_date']]) {
    const f=clientFixture();await f.read(key,{offset:0,limit:20,parent:{kind,from:'2026-11-07',to:'2026-11-08'}});
    const clause=f.urls[0].searchParams.get('or');
    assert.match(clause,/historical_occurred_on.gte.2026-11-07/);assert.match(clause,/historical_occurred_on.lte.2026-11-08/);
    assert.ok(clause.includes(`${column}.gte.${kind==='sales'?'2026-11-07T03:00:00.000Z':'2026-11-07'}`));
    assert.ok(clause.includes(`${column}.${kind==='sales'?'lt.2026-11-09T03:00:00.000Z':'lte.2026-11-08'}`));
  }
});

test('history searches original item snapshots and reference, caches only within one reader and rejects partial matches',async()=>{
  const f=clientFixture(url=>url.searchParams.has('ilike')?{rows:[],count:0}:url.searchParams.get('select')==='id'?{rows:[{id:id(1)}],count:1}:url.searchParams.get('select')==='order_id'?{rows:[{order_id:id(2)}],count:1}:{rows:[],count:0});
  const scope={offset:0,limit:20,parent:{kind:'sales',search:'Mate_100%'}};
  await f.read('orders',scope);await f.read('orders',scope);
  assert.equal(f.urls.length,4); // Two search requests, then two parent pages.
  const parent=f.urls.find(url=>url.searchParams.has('id'));
  assert.equal(parent.searchParams.get('id'),`in.(${id(1)},${id(2)})`);
  assert.equal(f.urls[1].searchParams.get('product_name'),'ilike.%Mate\\_100\\%%');
  const partial=clientFixture(()=>({rows:[{id:id(1),order_id:id(1)}],count:4}));
  await assert.rejects(()=>partial.read('orders',scope),/SEARCH_TOO_BROAD/);
  const broad=clientFixture(()=>({rows:[],count:101}));
  await assert.rejects(()=>broad.read('orders',scope),/SEARCH_TOO_BROAD/);
});

test('pending web payment inbox filters reports before pagination rather than losing older reports behind unrelated orders',async()=>{
  const source=readFileSync(new URL('../services/checkout-manual-admin.ts',import.meta.url),'utf8');
  const calls=[];
  const query=table=>{
    const q={};for(const key of ['select','eq','order','in','range','limit','single'])q[key]=(...args)=>{calls.push({table,key,args});return q;};
    q.then=(resolve)=>resolve(table==='checkout_payment_reports'?{data:[],count:0,error:null}:{data:[],error:null});return q;
  };
  const exports={};new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.includes('admin-session')?{requireAdminActionSession:async()=>({id:id(1)})}:name.includes('supabase/server')?{getSupabaseAdminClient:()=>({from:query})}:{},exports);
  assert.deepEqual(await exports.listManualCheckoutOrders(2,true),[]);
  assert.ok(calls.some(call=>call.key==='eq'&&call.args[0]==='status'&&call.args[1]==='pending'));
  assert.ok(calls.some(call=>call.key==='range'&&call.args[0]===200&&call.args[1]===299));
  assert.ok(!calls.some(call=>call.table==='checkout_operations'));
});

test('catalog and inventory do not present a truncated backend response as a complete result',async()=>{
  function load(file,response,calls){
    const query={};for(const method of ['select','eq','neq','order','range','gte','lt','or','in'])query[method]=(...args)=>{calls.push([method,...args]);return query;};
    query.then=resolve=>resolve(response);
    const exports={};new Function('require','exports',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.includes('supabase/server')?{getSupabaseAdminClient:()=>({from:()=>query})}:name.includes('yara-rosa')?{YARA_ROSA:{archivedId:'excluded'}}:name.includes('/periods')?{commercialDayBounds}:{},exports);
    return exports;
  }
  const catalogue=load('services/admin.ts',{data:[{id:id(1)}],count:2,error:null},[]);
  const bad=await catalogue.getAdminProducts({requireComplete:true});assert.equal(bad.data,null);assert.match(bad.error,/incompleto/);
  const calls=[];const inventory=load('services/inventory.ts',{data:[],count:50,error:null},calls);
  const empty=await inventory.listInventoryMovements({page:2,from:'2026-11-07',to:'2026-11-07'});assert.equal(empty.error,null);assert.equal(empty.total,50);
  assert.ok(calls.some(call=>call[0]==='range'&&call[1]===50&&call[2]===99));
  assert.ok(calls.some(call=>call[0]==='gte'&&call[2]==='2026-11-07T03:00:00.000Z'));
  assert.ok(calls.some(call=>call[0]==='lt'&&call[2]==='2026-11-08T03:00:00.000Z'));
  const partial=load('services/inventory.ts',{data:[],count:50,error:null},[]);
  assert.match((await partial.listInventoryMovements({page:1})).error,/página completa/);
});
