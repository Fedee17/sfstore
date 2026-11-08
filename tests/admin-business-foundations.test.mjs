import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {buildCommercialDay} from '../lib/commercial-reporting/daily.ts';
import {commercialDayBounds} from '../lib/commercial-reporting/periods.ts';
import * as pricing from '../lib/store-sales.ts';

test('daily figures keep confirmed sales, dated receipts and monthly pending amounts separate',()=>{
 const sale=(id,extra={})=>({id,occurredOn:'2026-11-07',excluded:false,confirmed:true,totalCents:10000,pendingCents:0,issues:[],...extra});
 const report={month:'2026-11',provisional:false,totals:{undatedApprovedForSalesCents:5000},sales:[sale('paid'),sale('pending',{confirmed:false,pendingCents:10000}),sale('cancelled',{confirmed:false}),sale('excluded',{excluded:true}),sale('yesterday',{occurredOn:'2026-11-06'})],datedReceipts:[{orderId:'older-sale',occurredOn:'2026-11-07',method:'transfer',amountCents:7000},{orderId:'other',occurredOn:'2026-11-06',method:'cash',amountCents:9000}]};
 const day=buildCommercialDay(report,'2026-11-07');
 assert.equal(day.confirmedCount,1);assert.equal(day.confirmedCents,10000);
 assert.equal(day.receiptsCents,7000);assert.equal(day.pendingMonthCents,10000);assert.equal(day.undatedMonthCents,5000);
 assert.deepEqual(day.methods,[{method:'transfer',amountCents:7000,distinctOrders:1}]);
 assert.throws(()=>buildCommercialDay(report,'2026-10-31'),/MONTH_MISMATCH/);
});
test('inventory day includes the Argentine late evening and excludes the next midnight',()=>{
 const bounds=commercialDayBounds('2026-11-07');
 assert.equal(bounds.startInclusive,'2026-11-07T03:00:00.000Z');assert.equal(bounds.endExclusive,'2026-11-08T03:00:00.000Z');
 const late=new Date('2026-11-07T22:30:00-03:00').toISOString();
 assert(late>=bounds.startInclusive&&late<bounds.endExclusive);
 const source=readFileSync(new URL('../services/inventory.ts',import.meta.url),'utf8');
 assert.match(source,/commercialDayBounds\(filters.from\).startInclusive/);assert.match(source,/commercialDayBounds\(filters.to\).endExclusive/);
});
test('consultation ignores a stale stored transfer price and uses the same suggestion as a sale',async()=>{
 const source=readFileSync(new URL('../services/admin-catalog.ts',import.meta.url),'utf8');
 const out={};const rows=[{id:'synthetic',price:100,transfer_price:1,stock:2,categories:null}];
 const query={select(){return this;},eq(){return this;},neq(){return this;},async order(){return {data:rows,error:null};}};
 new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>({
  '@/lib/supabase/server':{getSupabaseAdminClient:()=>({from:()=>query})},'@/lib/store-sales':pricing,'@/lib/products/yara-rosa-consolidation':{YARA_ROSA:{archivedId:'unused'}}
 }[name]),out);
 const result=await out.getQuickCatalogProducts();assert.equal(result.data[0].transfer_price,75);assert.equal(rows[0].transfer_price,1);
});
