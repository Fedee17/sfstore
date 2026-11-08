import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {commercialDayBounds,validateStoreSaleDate} from '../lib/store-sale-date.ts';
import {buildCommercialAnalytics} from '../lib/commercial-reporting/analytics.ts';
import * as pricing from '../lib/store-sales.ts';

test('date validation accepts real past dates and uses the Argentine current day',()=>{
  const now=new Date('2026-11-09T01:30:00Z');
  for(const date of ['2026-11-08','2026-10-01','2024-02-29'])assert.equal(validateStoreSaleDate(date,now),date);
  for(const date of ['','2026-02-30','2025-02-29','08/11/2026','2026-11-09','1899-12-31'])assert.throws(()=>validateStoreSaleDate(date,now));
});

test('a late sale belongs to its commercial month while dated receipts keep the actual recording date',()=>{
  const policy={version:'synthetic',excludedOrderIds:[],excludedProductIds:[],excludedCategoryIds:[],excludedPurchaseIds:[],sourceBatches:[],imputedPurchases:[],exclusionCoverage:'reviewed_complete'};
  const snapshot={orders:[{id:'sale',channel:'store',status:'paid',payment_status:'paid',historical_import:false,historical_occurred_on:null,affects_inventory:true,created_at:'2026-11-08T12:00:00Z',store_sale_date:'2026-10-15',subtotal:100,discount:25,shipping_cost:0,total:75,cost_snapshot_policy:'current_product_cost_at_late_entry_v1'}],saleLines:[{id:'line',order_id:'sale',product_id:'mate',product_name:'SYNTHETIC',category_name:'Mates',quantity:1,unit_price:75,subtotal:75,list_unit_price_snapshot:100,unit_cost_snapshot:40}],payments:[{id:'pay',order_id:'sale',method:'cash',store_payment_method:'cash',status:'approved',amount:75,paid_at:'2026-11-08T12:00:00Z'}],purchases:[],purchaseLines:[],provenance:[],products:[],batches:[]};
  const before=structuredClone(snapshot),october=buildCommercialAnalytics(snapshot,'2026-10',policy),november=buildCommercialAnalytics(snapshot,'2026-11',policy);
  assert.equal(october.report.sales[0].occurredOn,'2026-10-15');assert.equal(october.counts.confirmed,1);assert.equal(october.products[0].quantity,1);assert.equal(october.report.totals.confirmedSalesCents,7500);
  assert.equal(october.report.totals.datedReceiptsCents,0);assert.equal(november.report.totals.datedReceiptsCents,7500);assert.equal(november.counts.confirmed,0);
  assert.equal(october.margin.grossMarginCents,null);assert.equal(october.margin.unknownCostLines,1);assert.deepEqual(snapshot,before);
});

function load(file,modules){
  const exports={};new Function('require','exports',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>modules[name]??{},exports);return exports;
}

test('service sends the validated date through the new RPC and does not invoke RPC for invalid dates',async()=>{
  const calls=[];
  const service=load('services/store-sales.ts',{'@/lib/store-sale-date':{validateStoreSaleDate},'@/lib/supabase/server':{getSupabaseAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{order_id:'synthetic'},error:null};}})}});
  const request={idempotencyKey:'key',createdBy:'actor',customerName:'',notes:'',items:[],payments:[],saleDate:'2025-09-12'};
  await service.createStoreSale(request);assert.equal(calls[0].name,'create_store_sale_dated_atomic');assert.equal(calls[0].args.p_sale_date,request.saleDate);
  await assert.rejects(service.createStoreSale({...request,saleDate:'not-a-date'}));assert.equal(calls.length,1);
  await service.createStoreSale({...request,saleDate:undefined});assert.equal(calls[1].name,'create_store_sale_atomic');assert.ok(!('p_sale_date' in calls[1].args));
});

test('authorized action validates before creating the sale and forwards the date without changing the operation key',async()=>{
  const requests=[];
  const actions=load('app/admin/ventas/actions.ts',{'next/cache':{revalidatePath:()=>{}},'@/lib/admin-session':{requireAdminActionSession:async()=>({id:'actor'})},'@/lib/store-sale-date':{validateStoreSaleDate},'@/lib/store-sales':pricing,'@/services/store-sales':{createStoreSale:async request=>{requests.push(request);return{order_id:'synthetic',payment_status:'paid',remaining_amount:0};}}});
  const form=new FormData();for(const[name,value]of Object.entries({idempotencyKey:'original-key',productId:'product',quantity:'1',unitPrice:'75',paymentMethod:'cash',paymentAmount:'75',saleDate:'2025-09-12'}))form.set(name,value);
  assert.equal((await actions.createStoreSaleAction({},form)).status,'success');assert.equal(requests[0].saleDate,'2025-09-12');assert.equal(requests[0].idempotencyKey,'original-key');
  form.set('saleDate','2026-02-30');assert.equal((await actions.createStoreSaleAction({},form)).status,'error');assert.equal(requests.length,1);
});

test('legacy sales reader uses the explicit commercial date with an Argentine recording-date fallback',async()=>{
  const calls=[],query={};for(const method of ['select','eq','order','limit','or'])query[method]=(...args)=>{calls.push([method,...args]);return query;};query.then=resolve=>resolve({data:[],error:null});
  const service=load('services/store-sales.ts',{'@/lib/store-sale-date':{commercialDayBounds,validateStoreSaleDate},'@/lib/supabase/server':{getSupabaseAdminClient:()=>({from:()=>query})}});
  await service.listStoreSales({date:'2026-10-15'});
  const clause=calls.find(([method])=>method==='or')[1];assert.match(clause,/store_sale_date.eq.2026-10-15/);assert.match(clause,/store_sale_date.is.null/);assert.match(clause,/created_at.gte.2026-10-15T03:00:00.000Z/);assert.match(clause,/created_at.lt.2026-10-16T03:00:00.000Z/);
});
