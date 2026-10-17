import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {readCommercialList,normalizeListOptions} from "../lib/commercial-reporting/list-reader.ts";
import {COMMERCIAL_EVIDENCE} from "../lib/commercial-reporting/evidence.ts";
import {commercialDayBounds} from "../lib/commercial-reporting/periods.ts";
const id=i=>`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`;
function fixture(kind,n){
 const d={orders:[],saleLines:[],payments:[],purchases:[],purchaseLines:[],provenance:[],products:[],batches:[]};
 for(let i=1;i<=n;i++)if(kind==="sales"){
  d.orders.push({id:id(i),order_number:`H${i}`,channel:"historical",status:"historical",payment_status:"paid",historical_import:true,historical_occurred_on:"2025-06-01",affects_inventory:false,created_at:"2026-10-17T12:00:00Z",subtotal:"80",discount:0,total:"80",shipping_cost:0,cost_snapshot_policy:null});
  d.saleLines.push({id:id(10000+i),order_id:id(i),product_id:null,product_name:`Historical ${i}`,category_name:null,quantity:1,unit_price:100,subtotal:80,list_unit_price_snapshot:null,unit_cost_snapshot:null});
  d.payments.push({id:id(20000+i),order_id:id(i),method:"cash",store_payment_method:null,status:"approved",amount:80,paid_at:null});
 }else d.purchases.push({id:id(i),supplier_name_snapshot:`Supplier ${i}`,historical_import:true,historical_occurred_on:"2025-06-01",purchase_date:"2025-06-01",affects_inventory:false,status:"historical",total_cost:10,supplier_subtotal:10,shipping_cost:0});
 return d;
}
function reader(data,{clamp=7,changeCount=false,empty=false}={}){
 const calls=[];
 const read=async(key,scope)=>{
  calls.push({key,scope});let rows=data[key];
  if(scope.parent){const p=scope.parent;if(p.id)rows=rows.filter(x=>x.id===p.id);if(p.origin!=="all")rows=rows.filter(x=>x.historical_import===(p.origin==="historical"));}
  if(scope.ids)rows=rows.filter(x=>scope.ids.includes(x[scope.idColumn]));
  return{count:rows.length+(changeCount&&scope.offset>0?1:0),rows:empty?[]:rows.slice(scope.offset,scope.offset+Math.min(clamp,scope.limit))};
 };
 return{read,calls};
}
for(const[kind,total]of[["sales",129],["purchases",180]])test(`all ${total} historical ${kind} are reachable by bounded pages without duplicates`,async()=>{
 const {read,calls}=reader(fixture(kind,total));const seen=[];
 for(let page=1;page<=Math.ceil(total/20);page++){const r=await readCommercialList(read,{kind,page,origin:"historical"},COMMERCIAL_EVIDENCE);assert.equal(r.total,total);seen.push(...r[kind].map(x=>x.id));}
 assert.equal(seen.length,total);assert.equal(new Set(seen).size,total);
 assert.ok(calls.filter(x=>x.scope.parent).every(x=>x.scope.limit<=20));
 assert.ok(calls.filter(x=>!x.scope.parent).every(x=>x.scope.ids.length>0));
});
test("current and historical filters remain separate",async()=>{
 const d=fixture("sales",2);Object.assign(d.orders[1],{historical_import:false,channel:"store",status:"paid",affects_inventory:true});
 for(const origin of ["current","historical","all"]){const r=await readCommercialList(reader(d).read,{kind:"sales",origin},COMMERCIAL_EVIDENCE);assert.equal(r.sales.length,origin==="all"?2:1);}
});
test("historical detail does not require store channel or reprice source totals",async()=>{
 const r=await readCommercialList(reader(fixture("sales",1)).read,{kind:"sales",id:id(1),origin:"historical"},COMMERCIAL_EVIDENCE);
 assert.equal(r.sales[0].totalCents,8000);assert.equal(r.sales[0].lines[0].unit_price,100);assert.equal(r.sales[0].payments[0].paid_at,null);assert.equal(r.sales[0].lineCosts[0].unitCostCents,null);
});
test("missing detail returns no record without scanning unrelated relations",async()=>{
 const {read,calls}=reader(fixture("sales",1));const r=await readCommercialList(read,{kind:"sales",id:id(999)},COMMERCIAL_EVIDENCE);assert.equal(r.sales.length,0);assert.equal(calls.length,1);
});
test("count changes, empty truncated pages and invalid options fail explicitly",async()=>{
 await assert.rejects(()=>readCommercialList(reader(fixture("purchases",25),{changeCount:true}).read,{kind:"purchases"},COMMERCIAL_EVIDENCE),/CHANGED_RETRY/);
 await assert.rejects(()=>readCommercialList(reader(fixture("purchases",25),{empty:true}).read,{kind:"purchases"},COMMERCIAL_EVIDENCE),/INCOMPLETE_PAGE/);
 assert.throws(()=>normalizeListOptions({kind:"sales",page:0}),/INVALID_PAGE/);assert.throws(()=>normalizeListOptions({kind:"sales",id:"invalid"}),/INVALID_ID/);
});
test("daily Argentina filter preserves half-open midnight boundaries",()=>{
 assert.deepEqual(commercialDayBounds("2026-10-31"),{startInclusive:"2026-10-31T03:00:00.000Z",endExclusive:"2026-11-01T03:00:00.000Z"});
});
test("details branch to readonly components before operational forms",()=>{
 for(const kind of ["compras","ventas"]){const text=readFileSync(new URL(`../app/admin/${kind}/[id]/page.tsx`,import.meta.url),"utf8");assert.ok(text.indexOf("return <HistoricalDetail")<text.indexOf(kind==="compras"?"await getPurchaseById":"await getStoreSaleById"));}
 const ui=readFileSync(new URL("../components/admin/commercial-history-ui.tsx",import.meta.url),"utf8");const detail=ui.slice(ui.indexOf("export function HistoricalDetail"));assert.doesNotMatch(detail,/<form|ConfirmPurchaseForm|StoreSalePaymentForm/);assert.match(detail,/Costo no disponible|displayMoney/);
});
test("mutating entry points explicitly guard historical payment and confirmation",()=>{
 for(const[file,rpc]of[["store-sales.ts","record_store_sale_payment_atomic"],["purchases.ts","confirm_purchase"]]){const s=readFileSync(new URL(`../services/${file}`,import.meta.url),"utf8");const guard=s.indexOf('await assertCurrentCommercialOperation');assert.ok(guard>0);assert.ok(guard<s.indexOf(`"${rpc}"`,guard));}
});
