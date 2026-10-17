import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildCommercialAnalytics, analyticsMonths, shiftCommercialMonth } from "../lib/commercial-reporting/analytics.ts";
import { buildCommercialMonth } from "../lib/commercial-reporting/model.ts";
import { COMMERCIAL_EVIDENCE } from "../lib/commercial-reporting/evidence.ts";

function fixture(){
 const policy={version:"synthetic",exclusionCoverage:"reviewed_complete",excludedOrderIds:["test"],excludedPurchaseIds:[],excludedProductIds:[],excludedCategoryIds:[],sourceBatches:[{id:"batch",sha256:"a".repeat(64)}],imputedPurchases:[{batchId:"batch",sheet:"Control de compras",rows:[154]}]};
 const input={orders:[],saleLines:[],payments:[],purchases:[],purchaseLines:[],provenance:[],products:[],batches:[{id:"batch",source_sha256:"a".repeat(64)}]};
 function sale(id,overrides={},amount=75,cost=null){
 input.orders.push({id,channel:"store",status:"paid",payment_status:"paid",historical_import:false,historical_occurred_on:null,affects_inventory:true,created_at:"2026-10-17T12:00:00Z",subtotal:100,discount:25,shipping_cost:0,total:amount,cost_snapshot_policy:"current_product_cost_at_sale_v1",...overrides});
 input.saleLines.push({id:`l-${id}`,order_id:id,product_id:"product",product_name:"SYNTHETIC PRODUCT",category_name:"SYNTHETIC CATEGORY",quantity:1,unit_price:amount,subtotal:amount,list_unit_price_snapshot:100,unit_cost_snapshot:cost});
 input.payments.push({id:`p-${id}`,order_id:id,method:"cash",store_payment_method:"cash",status:"approved",amount,paid_at:"2026-10-17T12:01:00Z"});
 }
 const run=(month="2026-10",now="2026-10-17T12:00:00Z")=>buildCommercialAnalytics(input,month,policy,new Date(now));
 return {input,policy,sale,run};
}
test("analytics uses exactly the validated monthly contract for mixed current/history",()=>{
 const f=fixture();f.sale("current",{},75,20);f.sale("history",{historical_import:true,historical_occurred_on:"2026-10-01",affects_inventory:false,channel:"historical",status:"historical"});f.input.payments[1].paid_at=null;
 const r=f.run();assert.deepEqual(r.report,buildCommercialMonth(f.input,"2026-10",f.policy));assert.equal(r.counts.confirmed,2);assert.equal(r.channels[0].amountCents,15000);assert.equal(r.report.totals.undatedApprovedForSalesCents,7500);assert.equal(r.report.totals.datedReceiptsCents,7500);
 assert.equal(r.margin.grossMarginCents,5500);assert.equal(r.margin.coveragePercent,50);assert.equal(r.margin.unknownRevenueCents,7500);assert.equal(r.margin.unknownCostLines,1);
});
test("two lines and two payment methods do not multiply any aggregate",()=>{
 const f=fixture();f.sale("a");f.input.saleLines[0].subtotal=30;f.input.saleLines.push({...f.input.saleLines[0],id:"l2",subtotal:45,product_id:"p2",quantity:2});
 f.input.payments[0].amount=40;f.input.payments.push({...f.input.payments[0],id:"p2",method:"card",store_payment_method:"debit",amount:35});
 const r=f.run();assert.equal(r.report.totals.confirmedSalesCents,7500);assert.equal(r.products.reduce((n,x)=>n+x.revenueCents,0),7500);assert.equal(r.categories[0].quantity,3);assert.equal(r.categories[0].revenueCents,7500);assert.deepEqual(r.report.paymentMethodsForSales.map(x=>[x.method,x.amountCents]),[["cash",4000],["debit",3500]]);
});
test("pending and partial orders are registered but not confirmed income or rankings",()=>{
 const f=fixture();f.sale("pending",{status:"pending",payment_status:"partial"});f.input.payments[0].amount=20;
 const r=f.run();assert.equal(r.report.totals.registeredSalesCents,7500);assert.equal(r.report.totals.pendingForSalesCents,5500);assert.equal(r.report.totals.confirmedSalesCents,0);assert.equal(r.products.length,0);assert.equal(r.margin.grossMarginCents,null);
});
test("imputed purchases keep stored dates and are not cash outflows",()=>{
 const f=fixture();f.input.purchases.push({id:"purchase",status:"historical",historical_import:true,historical_occurred_on:"2026-10-01",purchase_date:"2026-10-01",affects_inventory:false,total_cost:149790,supplier_subtotal:149790,shipping_cost:0});f.input.provenance.push({id:"record",batch_id:"batch",source_sheet:"Control de compras",source_row:154,record_type:"purchase",target_id:"purchase"});
 const before=JSON.stringify(f.input),r=f.run();assert.equal(r.counts.imputedPurchases,1);assert.equal(r.report.totals.imputedPurchasesCents,14979000);assert.equal(r.report.totals.datedReceiptsCents,0);assert.equal(JSON.stringify(f.input),before);
});
test("Argentina boundary, dated receipts of earlier sales and trend remain separate",()=>{
 const f=fixture();f.sale("oct",{created_at:"2026-11-01T02:59:59Z"});f.sale("nov",{created_at:"2026-11-01T03:00:00Z"});f.sale("sep",{created_at:"2026-09-30T12:00:00Z"});
 const r=f.run();assert.equal(r.report.sales.length,1);assert.equal(r.report.sales[0].id,"oct");assert.equal(r.report.totals.datedReceiptsCents,22500);assert.equal(r.trend.at(-2).confirmedSalesCents,7500);assert.equal(r.trend.at(-1).confirmedSalesCents,7500);assert.equal(r.comparison.sales.differenceCents,0);assert.equal(r.comparison.sales.percent,0);
});
test("unknown and zero costs do not invent a zero gross margin",()=>{
 const f=fixture();f.sale("null");f.sale("zero",{},75,0);const r=f.run();assert.equal(r.margin.grossMarginCents,null);assert.equal(r.margin.coveragePercent,0);assert.equal(r.margin.unknownRevenueCents,15000);assert.equal(f.input.saleLines[0].unit_cost_snapshot,null);
});
test("unreconciled lines do not allocate guessed discounts or margin",()=>{
 const f=fixture();f.sale("a",{},75,20);f.input.saleLines[0].subtotal=100;const r=f.run();assert.equal(r.report.totals.confirmedSalesCents,7500);assert.equal(r.margin.grossMarginCents,null);assert.equal(r.margin.unreconciledSales,1);assert.equal(r.products[0].revenueCents,0);assert.equal(r.products[0].unpricedQuantity,1);
});
test("known synthetic IDs excluded from totals rankings channels cost and trend",()=>{
 const f=fixture();f.sale("test",{},75,10);const r=f.run();assert.equal(r.report.exclusions.sales,1);assert.equal(r.channels[0].amountCents,0);assert.equal(r.products.length,0);assert.equal(r.margin.grossMarginCents,null);assert.ok(r.trend.every(x=>x.confirmedSalesCents===0));assert.ok(COMMERCIAL_EVIDENCE.excludedOrderIds.includes("349d9f2a-d7dc-4ea8-bb11-75499cb59e18"));
});
test("physical, online and other confirmed channels reconcile with consolidated total",()=>{
 const f=fixture();f.sale("physical");f.sale("online",{channel:"web"});f.sale("other",{channel:"order"});const r=f.run();assert.deepEqual(r.channels.map(x=>x.amountCents),[7500,7500,7500]);assert.equal(r.report.totals.confirmedSalesCents,22500);
});
test("zero previous base and empty period have no invented percentages",()=>{
 const f=fixture();f.sale("a");const r=f.run();assert.equal(r.comparison.sales.percent,null);assert.equal(r.comparison.sales.differenceCents,7500);assert.equal(r.comparison.selectedMonthNotClosed,true);assert.equal(f.run("2026-09").comparison.selectedMonthNotClosed,false);const empty=f.run("2025-01");assert.equal(empty.margin.grossMarginCents,null);assert.equal(empty.margin.coveragePercent,null);assert.equal(empty.report.sales.length,0);
});
test("year rollover, invalid input and lower supported boundary",()=>{
 assert.equal(shiftCommercialMonth("2026-01",-1),"2025-12");assert.deepEqual(analyticsMonths("1900-01"),["1900-01"]);assert.throws(()=>analyticsMonths("2026-13"),/INVALID_MONTH/);assert.throws(()=>shiftCommercialMonth("2026-01",NaN),/INVALID_MONTH_OFFSET/);
 const f=fixture();assert.equal(f.run("1900-01").comparison.previousMonth,null);
});
test("shipping not included in margin or product rankings and labels stay snapshots",()=>{
 const f=fixture();f.sale("a",{shipping_cost:25},100,20);f.input.saleLines[0].subtotal=75;const r=f.run();assert.equal(r.margin.grossMarginCents,5500);assert.equal(r.margin.coveragePercent,100);assert.equal(r.margin.merchandiseRevenueCents,7500);assert.equal(r.products[0].revenueCents,7500);assert.equal(r.categories[0].name,"SYNTHETIC CATEGORY");
});
test("missing product identities with the same name are not automatically reconciled",()=>{
 const f=fixture();f.sale("a");f.sale("b");f.input.saleLines.forEach(x=>x.product_id=null);assert.equal(f.run().products.length,2);
});
test("analytics server guard precedes privileged client and snapshot read occurs once",()=>{
 const s=readFileSync(new URL("../services/commercial-history.ts",import.meta.url),"utf8").split("export async function getCommercialAnalytics")[1];assert.ok(s.indexOf("requireAdminSession()")<s.indexOf("getSupabaseAdminClient()"));assert.equal((s.match(/await readCompleteSnapshot/g)??[]).length,1);assert.ok(s.indexOf("analyticsMonths(month)")<s.indexOf("getSupabaseAdminClient()"));
});
