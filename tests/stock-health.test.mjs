import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stockFixture} from './fixtures/stock-health-data.mjs';
import {stockHealthWindow,STOCK_PREVIEW_LIMIT} from '../lib/admin/stock-health.ts';
import {readStockSnapshot} from '../lib/admin/stock-health-reader.ts';
import {buildSalesWorkspace} from '../lib/admin/sales-workspace.ts';

test('separate 30/60 day windows use Argentine dates and top five',()=>{
  assert.deepEqual(stockHealthWindow('2026-11-09T02:59:59Z'),{from:'2026-10-10',idleFrom:'2026-09-10',to:'2026-11-08'});
  assert.equal(STOCK_PREVIEW_LIMIT,5);
});
test('coverage uses available once, with physical reconstructed from retained reservations',()=>{
  const f=stockFixture();f.product('a',{available:2,reserved:5});f.sale('a',{quantity:30});
  f.product('out',{available:0});f.sale('out',{quantity:1});
  f.product('boundary',{available:10});f.sale('boundary',{quantity:30});
  const r=f.run();assert.deepEqual(r.risk.map(p=>p.id),['out','a']);
  assert.equal(r.risk[1].coverageDays,2);assert.equal(r.risk[1].physical,7);assert.equal(r.risk[1].available,2);
});
test('a sale 40 days ago prevents immobilized classification but not 30-day demand',()=>{
  const f=stockFixture();f.product('a');f.sale('a',{date:'2026-09-30T12:00:00Z'});
  assert.equal(f.run().idle.length,0);assert.equal(f.run().risk.length,0);
});
test('60-day inclusive boundary, late entry business date and future sales',()=>{
  const f=stockFixture();for(const id of ['boundary','old','late','future'])f.product(id);
  f.sale('boundary',{date:'2026-09-10T03:00:00Z'});
  f.sale('old',{date:'2026-09-10T02:59:59Z'});
  f.sale('late',{store_sale_date:'2026-10-01'});
  f.sale('future',{date:'2026-11-09T12:00:00Z'});
  assert.deepEqual(f.run().idle.map(p=>p.id),['future','old']);
});
test('exclude recent products including exact 30-day boundary; SKU-less identities remain separate',()=>{
  const f=stockFixture();f.product('old');f.product('recent',{created_at:'2026-10-10T03:00:00Z'});f.product('just-old',{created_at:'2026-10-10T02:59:59Z'});
  const r=f.run();assert.deepEqual(r.idle.map(p=>p.id),['just-old','old']);assert.equal(r.recentExcluded,1);
});
test('rank by known current cost, preserve null/zero as unknown and exclude unavailable stock',()=>{
  const f=stockFixture();f.product('low',{available:1,cost:'10.01'});f.product('high',{available:3,cost:'20.01'});
  f.product('unknown',{cost:null});f.product('zero',{cost:'0.00'});f.product('empty',{available:0});
  const r=f.run();assert.deepEqual(r.idle.map(p=>p.id),['high','low','unknown','zero']);assert.equal(r.retainedCents,7004);assert.equal(r.unknownCostItems,2);
});
test('unpaid, cancelled, refunded and known fixtures are not demand',()=>{
  const f=stockFixture();for(const id of ['pending','cancel','refund','fixture'])f.product(id);
  f.sale('pending',{payment_status:'pending',status:'pending'});f.commercial.payments[0].amount=0;
  f.sale('cancel',{status:'cancelled'});f.sale('refund',{payment_status:'refunded'});
  f.sale('fixture',{id:'test-sale'});
  assert.equal(f.run().risk.length,0);assert.equal(f.run().idle.length,4);
});
test('physical component lines and variants count once by product id, not family or name',()=>{
  const f=stockFixture();f.product('blue',{family_id:'family',name:'Mismo nombre'});f.product('red',{family_id:'family',name:'Mismo nombre'});f.product('cable');
  f.sale('blue',{quantity:3});const order=f.commercial.orders[0];order.total=600;order.subtotal=600;f.commercial.payments[0].amount=600;
  f.commercial.saleLines.push({...f.commercial.saleLines[0],id:'component-cable',product_id:'cable'});
  const r=f.run();assert.deepEqual(r.idle.map(p=>p.id),['red']);assert.equal(r.risk.length,0);
});
test('historical demand requires verified source date and exact current product identity, not cost',()=>{
  const f=stockFixture();f.product('known');f.product('unknown');
  const known=f.sale('known',{historical_import:true,historical_occurred_on:'2026-10-20',affects_inventory:false});
  f.commercial.provenance.push({id:'record',batch_id:'batch',source_sheet:'Ventas',source_row:1,record_type:'sale',target_id:known});
  f.sale('unknown',{historical_import:true,historical_occurred_on:'2026-10-20',affects_inventory:false});
  f.sale(null);
  const r=f.run();assert.equal(r.risk[0].id,'known');assert.equal(r.unverifiedHistoricalSales,1);assert.equal(r.unidentifiedLines,1);
  assert.equal(r.idle.length,0);assert.equal(r.uncertainExcluded,1);
});
test('fail closed on incomplete, duplicate, invalid quantity and overflowing money snapshots',()=>{
  const f=stockFixture();const p=f.product('a');f.inventory.products.push({...p});assert.throws(()=>f.run(),/DUPLICATE/);f.inventory.products.pop();
  p.available=-1;assert.throws(()=>f.run(),/QUANTITY/);p.available=2;p.cost='bad';assert.throws(()=>f.run(),/MONEY/);
  p.cost='90071992547409.91';assert.throws(()=>f.run(),/OVERFLOW/);
  f.inventory.products=Array.from({length:10001},()=>p);assert.throws(()=>f.run(),/READ_LIMIT/);
});
test('stock reader invokes only the read-only RPC and rejects partial or malformed responses',async()=>{
  const f=stockFixture();f.product('a');const calls=[];
  const client=(data,error=null)=>({rpc(name){calls.push(name);return {abortSignal:async()=>({data,error})};}});
  assert.deepEqual(await readStockSnapshot(client(f.inventory)),f.inventory);
  await assert.rejects(readStockSnapshot(client({asOf:f.inventory.asOf})),/READ_FAILED/);
  await assert.rejects(readStockSnapshot(client({...f.inventory,products:[{}]})),/INVALID_SNAPSHOT/);
  assert.ok(calls.every(name=>name==='get_stock_health_snapshot'));
});
test('stock window ignores selected historical month and stock failures preserve the sales dashboard',()=>{
  const f=stockFixture();const p=f.product('a');f.sale('a');
  const options={kind:'sales',origin:'all',channel:'all',page:1};
  const result=buildSalesWorkspace(f.commercial,options,'2020-01',f.policy,f.inventory);
  assert.equal(result.analytics.report.month,'2020-01');assert.equal(result.stockHealth.risk[0].id,'a');
  p.available=-1;
  const failed=buildSalesWorkspace(f.commercial,options,'2026-11',f.policy,f.inventory);
  assert.equal(failed.stockHealth,null);assert.equal(failed.analytics.counts.confirmed,1);assert.equal(failed.sales.length,1);
});
