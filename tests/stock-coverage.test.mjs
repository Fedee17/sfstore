import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {stockFixture} from './fixtures/stock-health-data.mjs';
import {coverageDaysLabel,stockCoverageById,STOCK_RISK_DAYS} from '../lib/admin/stock-health.ts';
import {availabilityRows} from '../lib/admin/catalog-review.ts';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('stock health exposes every SKU coverage, not only the top risk list',()=>{
  const f=stockFixture();
  f.product('fast',{available:2});f.sale('fast',{quantity:30});
  f.product('slow',{available:30});f.sale('slow',{quantity:3});
  f.product('still',{available:4});
  const coverage=stockCoverageById(f.run());
  assert.equal(coverage.get('fast').coverageDays,2);
  assert.equal(coverage.get('slow').coverageDays,300);
  assert.equal(coverage.get('still').coverageDays,null);
  assert.equal(coverage.get('still').soldUnits,0);
  assert.equal(coverage.get('fast').risk,true);
  assert.equal(coverage.get('slow').risk,false);
});

test('coverage label floors days and keeps tiny values readable',()=>{
  assert.equal(coverageDaysLabel(2.97),'2,9 días');
  assert.equal(coverageDaysLabel(1),'1 día');
  assert.equal(coverageDaysLabel(0.05),'menos de 0,1 días');
});

test('availability filter "risk" lists SKUs that run out in under 10 days, fastest first',()=>{
  const product=(id,stock)=>({id,name:id,slug:id,status:'active',price:1,stock});
  const rows=[product('a',5),product('b',1),product('c',9),product('d',0)];
  const coverage=new Map([
    ['a',{coverageDays:6,soldUnits:25,risk:true}],
    ['b',{coverageDays:1,soldUnits:30,risk:true}],
    ['c',{coverageDays:90,soldUnits:3,risk:false}],
    ['d',{coverageDays:0,soldUnits:4,risk:true}],
  ]);
  assert.deepEqual(availabilityRows(rows,'risk',coverage).map(row=>row.id),['d','b','a']);
  assert.deepEqual(availabilityRows(rows,'risk',null).map(row=>row.id),[]);
  assert.deepEqual(availabilityRows(rows,'').map(row=>row.id),['d','b','a','c']);
  assert.equal(STOCK_RISK_DAYS,10);
});

test('availability screen shows coverage per SKU and fails closed when sales cannot be read',()=>{
  const ui=source('components/admin/inventory-availability.tsx');
  assert.match(ui,/getStockCoverage\(\)/);
  assert.match(ui,/<option value="risk">Por agotarse \(menos de \{STOCK_RISK_DAYS\} días\)<\/option>/);
  assert.match(ui,/Alcanza para \{coverageDaysLabel\(/);
  assert.match(ui,/Sin ventas en los últimos 30 días/);
  assert.match(ui,/No pudimos calcular cuántos días alcanza el stock/);
  const sales=source('components/admin/sales/stock-health.tsx');
  assert.match(sales,/coverageDaysLabel\(row\.coverageDays!\)/);
  assert.doesNotMatch(sales,/new Intl\.NumberFormat\('es-AR',\{style:'unit'/);
});
