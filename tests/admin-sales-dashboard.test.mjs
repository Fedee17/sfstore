import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildSalesWorkspace} from '../lib/admin/sales-workspace.ts';
import {checkoutOrderState,checkoutMoney,checkoutDate} from '../lib/admin/checkout-presentation.ts';

function fixture(){
  const policy={version:'synthetic',excludedOrderIds:['fixture'],excludedProductIds:['fixture-product'],excludedCategoryIds:['fixture-category'],excludedPurchaseIds:[],sourceBatches:[],imputedPurchases:[],exclusionCoverage:'reviewed_complete'};
  const snapshot={orders:[],saleLines:[],payments:[],purchases:[],purchaseLines:[],provenance:[],products:[{id:'category-product',category_id:'fixture-category'}],batches:[]};
  function sale(id,{date='2026-11-07T12:00:00Z',product='mate',name='Mate',quantity=1,amount=100,paid=true}={}){
    snapshot.orders.push({id,order_number:'SALE-'+id,channel:'store',status:paid?'paid':'pending',payment_status:paid?'paid':'pending',historical_import:false,historical_occurred_on:null,affects_inventory:true,created_at:date,subtotal:amount,discount:0,shipping_cost:0,total:amount,cost_snapshot_policy:null});
    snapshot.saleLines.push({id:'line-'+id,order_id:id,product_id:product,product_name:name,category_name:'Mates',quantity,unit_price:amount/quantity,subtotal:amount,list_unit_price_snapshot:null,unit_cost_snapshot:null});
    if(paid)snapshot.payments.push({id:'payment-'+id,order_id:id,method:'cash',store_payment_method:'cash',status:'approved',amount,paid_at:date});
  }
  return{snapshot,policy,sale,run:(options={},month='2026-11')=>buildSalesWorkspace(snapshot,{kind:'sales',...options},month,policy)};
}

test('known fixture exclusions apply before history pagination and totals; rows are preserved',()=>{
  const f=fixture();for(let i=0;i<22;i++)f.sale('real-'+i);
  f.sale('fixture');f.sale('by-product',{product:'fixture-product'});f.sale('by-category',{product:'category-product'});
  const before=structuredClone(f.snapshot),first=f.run(),second=f.run({page:2});
  assert.equal(first.total,22);assert.equal(first.sales.length,20);assert.equal(second.sales.length,2);assert.equal(first.pages,2);
  assert.equal(first.analytics.counts.confirmed,22);assert.equal(first.analytics.report.totals.confirmedSalesCents,220000);
  assert.deepEqual(f.snapshot,before);
});

test('monthly ranking and bars use confirmed original amounts and change with the month',()=>{
  const f=fixture();f.sale('nov-a',{quantity:3,amount:300});f.sale('oct-b',{date:'2026-10-31T23:30:00-03:00',product:'thermos',name:'Termo',quantity:2,amount:400});f.sale('pending',{quantity:50,amount:5000,paid:false});
  const november=f.run(),october=f.run({},'2026-10');
  assert.equal(november.analytics.counts.confirmed,1);assert.equal(november.analytics.products[0].name,'Mate');assert.equal(november.analytics.products[0].quantity,3);
  assert.equal(november.analytics.trend.at(-1).confirmedSalesCents,30000);
  assert.equal(october.analytics.products[0].name,'Termo');assert.equal(october.analytics.trend.at(-1).confirmedSalesCents,40000);
});

test('search filters history without changing the selected dashboard and stale payment filters are ignored',()=>{
  const f=fixture();f.sale('a');f.sale('b',{name:'Termo',product:'thermos'});
  const all=f.run(),filtered=f.run({search:'TÉRMO',paymentStatus:'partial',month:'2026-11'});
  assert.equal(filtered.sales.length,1);assert.equal(filtered.options.paymentStatus,'');assert.deepEqual(filtered.analytics,all.analytics);
  assert.equal(f.run({},'2026-09').analytics.products.length,0);
});

test('payment actions are offered only for pending transfer orders, never paid or cancelled ones',()=>{
  const base={state:'pending',payment_status:'pending',result:{paymentMethod:'transfer'},report:{status:'pending'}};
  assert.equal(checkoutOrderState(base).canCredit,true);assert.equal(checkoutOrderState(base).canReject,true);
  for(const patch of [{state:'cancelled'},{state:'expired'},{payment_status:'paid'},{payment_status:'refunded'},{result:{paymentMethod:'cash'}}])assert.equal(checkoutOrderState({...base,...patch}).canCredit,false);
  assert.equal(checkoutOrderState({...base,payment_status:'paid'}).label,'Pago acreditado');
  assert.equal(checkoutMoney(NaN),'Importe no disponible');assert.equal(checkoutDate('invalid'),'Sin fecha registrada');
});

test('sales server authorizes and validates before reading one snapshot; payment selector is absent',()=>{
  const service=readFileSync(new URL('../services/commercial-history.ts',import.meta.url),'utf8').split('export async function getSalesWorkspace')[1];
  assert.ok(service.indexOf('requireAdminSession()')<service.indexOf('getSupabaseAdminClient()'));
  assert.ok(service.indexOf('validateMonth(month)')<service.indexOf('getSupabaseAdminClient()'));
  assert.equal((service.match(/await readCompleteSnapshot/g)||[]).length,1);
  const ui=readFileSync(new URL('../components/admin/commercial-history-ui.tsx',import.meta.url),'utf8');assert.doesNotMatch(ui,/name="paymentStatus"/);
});
