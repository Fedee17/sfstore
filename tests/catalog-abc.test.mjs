import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {stockFixture} from './fixtures/stock-health-data.mjs';
import {buildCommercialFacts} from '../lib/commercial-reporting/model.ts';
import {buildCatalogAbc,abcWindow,ABC_WINDOW_DAYS} from '../lib/admin/catalog-abc.ts';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const run=(f)=>buildCatalogAbc(buildCommercialFacts(f.commercial,f.policy).sales,f.inventory,f.policy);

test('90-day window ends on the Argentine commercial date',()=>{
  assert.equal(ABC_WINDOW_DAYS,90);
  assert.deepEqual(abcWindow('2026-11-09T02:59:59Z'),{from:'2026-08-11',to:'2026-11-08'});
});

test('classifies by cumulative revenue: A up to 80 %, B up to 95 %, C the rest',()=>{
  const f=stockFixture();
  for(const [id,q] of [['a1',50],['a2',30],['b1',10],['b2',5],['c1',3],['c2',2]]){f.product(id);f.sale(id,{quantity:q});}
  const r=run(f);
  assert.deepEqual(r.rows.map(row=>[row.id,row.abcClass]),[['a1','A'],['a2','A'],['b1','B'],['b2','B'],['c1','C'],['c2','C']]);
  assert.equal(r.totalRevenueCents,100*100*100);
  assert.equal(r.rows[0].cumulativeShare,0.5);
  assert.deepEqual(r.counts,{A:2,B:2,C:2});
});

test('sales outside the window, unconfirmed or excluded do not count',()=>{
  const f=stockFixture();
  f.product('old');f.sale('old',{date:'2026-08-10T12:00:00Z'});
  f.product('unpaid');f.sale('unpaid',{status:'pending',payment_status:'pending'});
  f.product('in');f.sale('in',{date:'2026-08-11T12:00:00Z',quantity:1});
  f.sale('in',{id:'test-sale'});
  assert.deepEqual(run(f).rows.map(row=>row.id),['in']);
  assert.equal(run(f).rows[0].units,1);
});

test('stocked products without sales are C, valued at verified cost, recent ones apart',()=>{
  const f=stockFixture();
  f.product('seller');f.sale('seller');
  f.product('idle',{available:4,cost:'250.00'});
  f.product('nocost',{available:2,cost:'0.00'});
  f.product('empty',{available:0});
  f.product('new',{available:3,created_at:'2026-10-01T12:00:00Z'});
  const r=run(f);
  assert.deepEqual(r.idle.map(row=>row.id),['idle','nocost']);
  assert.equal(r.idle[0].retainedCents,100000);
  assert.equal(r.idle[1].retainedCents,null);
  assert.equal(r.idleRetainedCents,100000);
  assert.equal(r.recentExcluded,1);
});

test('margin uses only stored positive cost snapshots; incomplete cost stays unknown',()=>{
  const f=stockFixture();
  f.product('known');const id=f.sale('known',{quantity:2,cost_snapshot_policy:'current_product_cost_at_sale_v1'});
  f.commercial.saleLines.find(l=>l.order_id===id).unit_cost_snapshot='40.00';
  f.product('unknown');f.sale('unknown',{quantity:2});
  const rows=new Map(run(f).rows.map(row=>[row.id,row]));
  assert.equal(rows.get('known').marginCents,(200-80)*100);
  assert.equal(rows.get('unknown').marginCents,null);
});

test('fails closed on duplicate products and keeps unidentified lines out',()=>{
  const f=stockFixture();f.product('x');f.inventory.products.push({...f.inventory.products[0]});
  assert.throws(()=>run(f),/CATALOG_ABC_DUPLICATE_PRODUCT/);
  const g=stockFixture();g.product('y');g.sale('ghost');
  assert.equal(run(g).unidentifiedLines,1);assert.equal(run(g).rows.length,0);
});

test('analytics shows the rotation section and isolates its failure',()=>{
  const page=source('app/admin/analytics/page.tsx');
  assert.match(page,/Rotación del catálogo · últimos \{ABC_WINDOW_DAYS\} días/);
  assert.match(page,/No pudimos calcular la rotación del catálogo/);
  assert.match(page,/Clase C con stock/);
  const service=source('services/commercial-history.ts').split('export async function getCommercialAnalytics')[1].split('export async function')[0];
  assert.match(service,/buildCatalogAbc\(/);
  assert.match(service,/rotation = null/);
});
