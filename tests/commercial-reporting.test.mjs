import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildCommercialMonth } from "../lib/commercial-reporting/model.ts";
import { readCompleteSnapshot, readCommercialMonth, READ_TABLES } from "../lib/commercial-reporting/reader.ts";
import { commercialDate, monthBounds, sourceDate } from "../lib/commercial-reporting/periods.ts";
import { moneyCents, sumCents } from "../lib/commercial-reporting/money.ts";
import { COMMERCIAL_EVIDENCE } from "../lib/commercial-reporting/evidence.ts";

const policy = () => ({ version: "synthetic-unit-v1", exclusionCoverage: "reviewed_complete",
  excludedOrderIds: [], excludedPurchaseIds: [], excludedProductIds: [], excludedCategoryIds: [],
  sourceBatches: [{ id: "batch", sha256: "a".repeat(64) }],
  imputedPurchases: [{ batchId: "batch", sheet: "Control de compras", rows: [154,155,156,157,158,159] }] });
const order = (v = {}) => ({ id: "sale", channel: "store", status: "completed", payment_status: "paid",
  historical_import: false, historical_occurred_on: null, affects_inventory: true,
  created_at: "2026-10-17T18:00:00Z", subtotal: "100.00", discount: "25.00", shipping_cost: "0.00", total: "75.00",
  cost_snapshot_policy: "current_product_cost_at_sale_v1", ...v });
const line = (v = {}) => ({ id: "line", order_id: "sale", product_id: "product", product_name: "SYNTHETIC UNIT",
  category_name: "UNIT CATEGORY", quantity: 1, unit_price: "75.00", subtotal: "75.00",
  list_unit_price_snapshot: "100.00", unit_cost_snapshot: null, ...v });
const payment = (v = {}) => ({ id: "payment", order_id: "sale", method: "cash", store_payment_method: "cash",
  status: "approved", amount: "75.00", paid_at: "2026-10-17T18:01:00Z", ...v });
const purchase = (v = {}) => ({ id: "purchase", status: "historical", historical_import: true,
  historical_occurred_on: "2026-10-01", purchase_date: "2026-10-01", affects_inventory: false,
  total_cost: "20.00", supplier_subtotal: "20.00", shipping_cost: "0.00", ...v });
const provenance = (v = {}) => ({ id: "provenance", batch_id: "batch", source_sheet: "Control de compras",
  source_row: 154, record_type: "purchase", target_id: "purchase", ...v });
function fixture() { return { orders: [order()], saleLines: [line()], payments: [payment()], purchases: [],
  purchaseLines: [], provenance: [], products: [{ id: "product", category_id: "category" }], batches: [{ id: "batch", source_sha256: "a".repeat(64) }] }; }
const report = (d = fixture(), p = policy(), month = "2026-10") => buildCommercialMonth(d, month, p);
function deepFreeze(x) { Object.freeze(x); for (const v of Object.values(x)) if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v); return x; }

test("one order with multiple products and combined payments is counted once", () => {
 const d = fixture(); d.saleLines = [line({ id: "l1", subtotal: "30.00" }), line({ id: "l2", subtotal: "45.00" })];
 d.payments = [payment({ id: "p1", amount: "40", method: "cash" }), payment({ id: "p2", amount: "35", method: "transfer", store_payment_method: "transfer" })];
 const r = report(d); assert.equal(r.sales.length, 1); assert.equal(r.totals.confirmedSalesCents, 7500);
 assert.deepEqual(r.paymentMethodsForSales.map(x => [x.method,x.amountCents]), [["cash",4000],["transfer",3500]]);
 assert.equal(r.totals.datedReceiptsCents,7500); assert.equal(r.sales[0].partialGrossMarginCents,null);
});
test("cash plus debit uses recorded detailed methods without changing prices", () => {
 const d=fixture(); d.orders=[order({subtotal:100,discount:0,total:100})];d.saleLines=[line({unit_price:100,subtotal:100})];
 d.payments=[payment({id:"a",amount:40}),payment({id:"b",amount:60,method:"card",store_payment_method:"debit"})];
 assert.deepEqual(report(d).paymentMethodsForSales.map(x=>[x.method,x.amountCents]),[["cash",4000],["debit",6000]]);
});
test("pending and rejected payments are never receipts", () => {
 const d=fixture();d.orders=[order({status:"pending",payment_status:"pending"})];
 d.payments=[payment({id:"a",status:"pending"}),payment({id:"b",status:"rejected"})];
 const r=report(d);assert.equal(r.totals.approvedPaymentsForSalesCents,0);assert.equal(r.totals.confirmedSalesCents,0);assert.equal(r.totals.pendingForSalesCents,7500);
});
test("partial payment records only actual approved money", () => {
 const d=fixture();d.orders=[order({status:"pending",payment_status:"partial"})];d.payments=[payment({amount:20})];
 const r=report(d);assert.equal(r.totals.approvedPaymentsForSalesCents,2000);assert.equal(r.totals.pendingForSalesCents,5500);assert.equal(r.totals.confirmedSalesCents,0);
});
test("completed header without approved ledger is an issue not income", () => {
 const d=fixture();d.payments=[];const r=report(d);assert.equal(r.totals.confirmedSalesCents,0);assert.equal(r.totals.datedReceiptsCents,0);
 assert.ok(r.sales[0].issues.includes("PAID_STATE_WITHOUT_EXACT_APPROVED_PAYMENT"));
});
test("historic approved money never acquires an invented cash date", () => {
 const d=fixture(); d.orders=[order({historical_import:true,historical_occurred_on:"2026-06-01",channel:"historical",status:"historical",affects_inventory:false,created_at:"2026-10-17T18:00:00Z"})];
 d.payments=[payment({paid_at:null,method:"card",store_payment_method:null})];
 const r=report(d,policy(),"2026-06");assert.equal(r.totals.confirmedSalesCents,7500);assert.equal(r.totals.datedReceiptsCents,0);
 assert.equal(r.totals.undatedApprovedForSalesCents,7500);assert.equal(r.undatedReceiptsAttributedToSales[0].paidAt,null);
 assert.equal(r.sales[0].origin,"physical_historical");assert.equal(r.paymentMethodsForSales[0].method,"card");
 assert.equal(report(d).totals.registeredSalesCents,0);
});
test("cash month can contain receipts for orders from a prior month", () => {
 const d=fixture();d.orders[0].created_at="2026-09-01T12:00:00Z";const r=report(d);
 assert.equal(r.sales.length,0);assert.equal(r.datedReceipts.length,1);assert.equal(r.totals.datedReceiptsCents,7500);assert.equal(r.totals.approvedPaymentsForSalesCents,0);
});
test("Argentina month boundary is half-open and explicit", () => {
 assert.equal(commercialDate("2026-11-01T02:59:59.999Z"),"2026-10-31");assert.equal(commercialDate("2026-11-01T03:00:00Z"),"2026-11-01");
 assert.deepEqual(monthBounds("2026-10"),{startInclusive:"2026-10-01T03:00:00.000Z",endExclusive:"2026-11-01T03:00:00.000Z"});
 assert.equal(monthBounds("2026-12").endExclusive,"2027-01-01T03:00:00.000Z");assert.equal(sourceDate("2024-02-29"),"2024-02-29");
 assert.throws(()=>sourceDate("2026-02-29"));assert.throws(()=>commercialDate("2026-01-01T00:00:00"));assert.throws(()=>monthBounds("2026-13"));
});
test("purchase imputations require exact batch, hash, sheet and row", () => {
 const d=fixture();d.purchases=[purchase()];d.provenance=[provenance()];
 const r=report(d);assert.equal(r.purchases[0].dateQuality,"imputed");assert.equal(r.totals.imputedPurchasesCents,2000);
 d.provenance[0].source_row=153;assert.equal(report(d).purchases[0].dateQuality,"source_date");
 d.batches[0].source_sha256="b".repeat(64);assert.equal(report(d).purchases[0].dateQuality,"unknown");
});
test("all six known imputations and their total can be projected without changing source dates", () => {
 const d=fixture();d.purchases=[11900,8500,49990,22900,37500,19000].map((v,i)=>purchase({id:`purchase${i}`,total_cost:v}));
 d.provenance=d.purchases.map((x,i)=>provenance({id:`r${i}`,target_id:x.id,source_row:154+i}));
 const before=JSON.stringify(d);assert.equal(report(d).totals.imputedPurchasesCents,14979000);assert.equal(JSON.stringify(d),before);
});
test("synthetic operation IDs are excluded even when paid", () => {
 const d=fixture(),p=policy();p.excludedOrderIds=["sale"];
 const r=report(d,p);assert.equal(r.totals.registeredSalesCents,0);assert.equal(r.totals.datedReceiptsCents,0);assert.equal(r.sales[0].excluded,true);
});
for (const kind of ["product","category"]) test(`synthetic ${kind} IDs exclude the entire mixed order`,()=>{
 const d=fixture(),p=policy();if(kind==="product")p.excludedProductIds=["product"];else p.excludedCategoryIds=["category"];
 d.saleLines.push(line({id:"real",product_id:"different-real-product"}));assert.equal(report(d,p).totals.approvedPaymentsForSalesCents,0);
});
test("synthetic purchases are excluded and real archived identities are not blanket-excluded",()=>{
 const d=fixture(),p=policy();d.purchases=[purchase()];p.excludedPurchaseIds=["purchase"];
 assert.equal(report(d,p).totals.purchasesCents,0);assert.equal(report(d).totals.purchasesCents,2000);
});
test("reviewed evidence includes the known paid acceptance order and advertises coverage limits",()=>{
 assert.ok(COMMERCIAL_EVIDENCE.excludedOrderIds.includes("349d9f2a-d7dc-4ea8-bb11-75499cb59e18"));
 assert.equal(COMMERCIAL_EVIDENCE.excludedProductIds.length,2);assert.equal(report(fixture(),COMMERCIAL_EVIDENCE).provisional,true);
});
test("unknown costs stay NULL and cannot become a zero margin",()=>{
 const d=fixture();const r=report(d);assert.equal(r.sales[0].lines[0].unit_cost_snapshot,null);
 assert.equal(r.sales[0].linesWithUnknownCost,1);assert.equal(r.sales[0].partialGrossMarginCents,null);
 assert.deepEqual(r.sales[0].lineCosts,[{lineId:"line",unitCostCents:null,evidence:"unknown"}]);
});
test("only traceable nonzero stored snapshots produce partial gross margin",()=>{
 const d=fixture();d.saleLines=[line({id:"known",subtotal:30,unit_cost_snapshot:10}),line({id:"unknown",subtotal:45})];
 const r=report(d);assert.equal(r.sales[0].partialGrossMarginCents,2000);assert.equal(r.sales[0].linesWithVerifiedCost,1);assert.equal(r.sales[0].linesWithUnknownCost,1);
 d.orders[0].cost_snapshot_policy=null;assert.equal(report(d).sales[0].partialGrossMarginCents,null);
 d.orders[0].cost_snapshot_policy="current_product_cost_at_sale_v1";d.saleLines[0].unit_cost_snapshot=0;
 assert.equal(report(d).sales[0].partialGrossMarginCents,null);
});
test("source totals and original discounts are preserved rather than recalculated",()=>{
 const d=fixture();d.orders=[order({total:"11670",subtotal:"11670",discount:0})];d.saleLines=[line({unit_price:11000,subtotal:11670})];d.payments=[payment({amount:11670})];
 const r=report(d);assert.equal(r.totals.confirmedSalesCents,1167000);assert.equal(r.sales[0].lines[0].unit_price,11000);assert.equal(r.sales[0].original.discount,0);
});
test("projection can use deeply frozen inputs with no mutation",()=>{
 const d=deepFreeze(fixture());assert.equal(report(d,deepFreeze(policy())).totals.confirmedSalesCents,7500);
});
test("duplicate rows and orphan joins fail instead of multiplying amounts",()=>{
 const d=fixture();d.payments.push(payment());assert.throws(()=>report(d),/DUPLICATE_ID/);
 d.payments=[payment({order_id:"missing"})];assert.throws(()=>report(d),/ORPHAN_PAYMENT/);
});
test("historical inventory contract violation fails closed",()=>{
 const d=fixture();d.orders[0].historical_import=true;assert.throws(()=>report(d),/HISTORICAL_INVENTORY|INVALID_SOURCE_DATE/);
});
test("cancelled paid order is not a sale but actual approved receipt is retained for review",()=>{
 const d=fixture();d.orders[0].status="cancelled";const r=report(d);
 assert.equal(r.totals.confirmedSalesCents,0);assert.equal(r.totals.registeredSalesCents,0);assert.equal(r.totals.pendingForSalesCents,0);
 assert.equal(r.totals.datedReceiptsCents,7500);assert.equal(r.datedReceipts[0].parentCancelled,true);
});
test("refund state is not a fabricated partial refund or certified net revenue",()=>{
 const d=fixture();d.payments.push(payment({id:"refund",amount:10,status:"refunded"}));const r=report(d);
 assert.equal(r.totals.confirmedSalesCents,0);assert.ok(r.sales[0].issues.includes("REFUND_NET_NOT_CERTIFIED"));
 assert.equal(r.totals.approvedPaymentsForSalesCents,7500);
});
test("exact cents preserve decimals and reject implicit rounding or overflow",()=>{
 assert.equal(moneyCents("0.01"),1);assert.equal(moneyCents(74.79),7479);assert.equal(sumCents([10,20]),30);
 for(const value of [null,undefined,NaN,-1,"1.001","1e3"])assert.throws(()=>moneyCents(value));
 assert.throws(()=>sumCents([Number.MAX_SAFE_INTEGER,1]));
});
test("purchase drafts and cancellations are visible but excluded from acquisition totals",()=>{
 const d=fixture();d.purchases=[purchase({id:"a",status:"draft",historical_import:false,affects_inventory:true}),purchase({id:"b",status:"cancelled"})];
 assert.equal(report(d).purchases.length,2);assert.equal(report(d).totals.purchasesCents,0);
});
test("origin comes from original flags without changing technical channel",()=>{
 for(const [channel,expected] of [["store","physical_current"],["web","online"],["order","other"]]){
  const d=fixture();d.orders[0].channel=channel;const r=report(d);assert.equal(r.sales[0].origin,expected);assert.equal(r.sales[0].original.channel,channel);
 }
});
test("keyset read loads more than 100 records and tolerates server page clamping",async()=>{
 const data=fixture();data.orders=Array.from({length:245},(_,i)=>order({id:String(i).padStart(4,"0")}));data.saleLines=[];data.payments=[];
 let calls=0;const result=await readCompleteSnapshot(async(key,after)=>{
  calls++;return data[key].filter(x=>after===null||x.id>after).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,17);
 },{pageSize:200});
 assert.equal(result.orders.length,245);assert.ok(calls>15);
});
test("pagination error and safety limit never return partial totals",async()=>{
 await assert.rejects(()=>readCompleteSnapshot(async()=>{throw new Error("network");}),/network/);
 await assert.rejects(()=>readCompleteSnapshot(async()=>[order({id:"a"})],{maxPagesPerTable:1}),/NO_PARTIAL_REPORT/);
 await assert.rejects(()=>readCompleteSnapshot(async()=>[order({id:"a"})]),/NON_MONOTONIC_PAGE/);
});
test("invalid month makes no gateway calls",async()=>{
 let calls=0;await assert.rejects(()=>readCommercialMonth(async()=>{calls++;return [];},"bad",policy()),/INVALID_MONTH/);assert.equal(calls,0);
});
test("service guards before privileged client and exposes SELECT-only whitelist",()=>{
 const service=readFileSync(new URL("../services/commercial-history.ts",import.meta.url),"utf8");
 assert.ok(service.includes('import "server-only"'));assert.ok(service.indexOf("await requireAdminSession()")<service.indexOf("const client = getSupabaseAdminClient()"));
 assert.doesNotMatch(service,/\.(insert|update|delete|upsert|rpc)\s*\(/);assert.doesNotMatch(service,/use server/);
 for(const {columns} of Object.values(READ_TABLES))assert.doesNotMatch(columns,/(?:^|,)(?:customer_id|phone|email|reference|notes|secret|cost)(?:,|$)/);
 assert.equal(READ_TABLES.orders.columns.includes("metadata->>cost_snapshot_policy"),true);
});


test("real Supabase SDK adapter sends only GET with a minimal projection and keyset filter", async()=>{
 const {createClient}=await import("@supabase/supabase-js");
 const {createCommercialPageReader}=await import("../lib/commercial-reporting/postgrest.ts");
 const requests=[];
 const client=createClient("http://127.0.0.1:1","synthetic-unit-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
  requests.push({url:new URL(url),method:init?.method});
  return new Response(JSON.stringify([order()]),{status:200,headers:{"Content-Type":"application/json"}});
 }}});
 const rows=await createCommercialPageReader(client)("orders","00000000-0000-4000-8000-000000000001",200);
 assert.equal(rows.length,1);assert.equal(requests.length,1);assert.equal(requests[0].method,"GET");
 assert.equal(requests[0].url.pathname,"/rest/v1/orders");assert.equal(requests[0].url.searchParams.get("order"),"id.asc");
 assert.equal(requests[0].url.searchParams.get("id"),"gt.00000000-0000-4000-8000-000000000001");
 assert.ok(requests[0].url.searchParams.get("select").includes("cost_snapshot_policy:metadata->>cost_snapshot_policy"));
});
test("SDK adapter sanitizes database errors and makes no retry writes",async()=>{
 const {createClient}=await import("@supabase/supabase-js");
 const {createCommercialPageReader}=await import("../lib/commercial-reporting/postgrest.ts");
 const client=createClient("http://127.0.0.1:1","synthetic-unit-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>
  new Response(JSON.stringify({message:"SENSITIVE_DB_DIAGNOSTIC",code:"42501"}),{status:403,headers:{"Content-Type":"application/json"}})}});
 await assert.rejects(()=>createCommercialPageReader(client)("orders",null,200),error=>error.message==="COMMERCIAL_READ_FAILED_NO_PARTIAL_REPORT");
});
test("expired read budget produces no partial report",async()=>{
 await assert.rejects(()=>readCompleteSnapshot(async()=>{await new Promise(r=>setTimeout(r,15));return [];},{maxDurationMs:1}),/TIMEOUT_NO_PARTIAL_REPORT/);
});
