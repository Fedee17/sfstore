import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {buildCommercialFacts} from '../lib/commercial-reporting/model.ts';
import {stockFixture} from './fixtures/stock-health-data.mjs';
import {buildSalesHeatmap,HEATMAP_WINDOW_DAYS,WEEKDAYS} from '../lib/admin/sales-heatmap.ts';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const now=new Date('2026-11-27T20:00:00Z');
const run=(f)=>buildSalesHeatmap(buildCommercialFacts(f.commercial,f.policy).sales,now);

test('counts confirmed sales by Argentine weekday and hour',()=>{
  const f=stockFixture();f.product('p');
  f.sale('p',{date:'2026-11-27T14:30:00Z',quantity:2}); // viernes 11:30 en Argentina
  f.sale('p',{date:'2026-11-27T14:59:00Z',quantity:1}); // viernes 11:59
  f.sale('p',{date:'2026-11-24T02:10:00Z',quantity:1}); // lunes 23:10 en Argentina (martes en UTC)
  const h=run(f);
  assert.equal(HEATMAP_WINDOW_DAYS,90);
  assert.deepEqual(WEEKDAYS,['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']);
  assert.equal(h.cells[4][11].sales,2);
  assert.equal(h.cells[4][11].amountCents,300*100);
  assert.equal(h.cells[0][23].sales,1);
  assert.equal(h.totalSales,3);
  assert.deepEqual(h.peak,{weekday:4,hour:11,sales:2});
});

test('only sales registered the same day carry a trustworthy hour',()=>{
  const f=stockFixture();f.product('p');
  f.sale('p',{date:'2026-11-26T15:00:00Z',store_sale_date:'2026-11-20'}); // cargada tarde: la hora no es la de la venta
  f.sale('p',{date:'2026-11-26T15:00:00Z',store_sale_date:'2026-11-26'});
  f.sale('p',{date:'2026-08-01T15:00:00Z'}); // fuera de los 90 días
  f.sale('p',{date:'2026-11-26T15:00:00Z',status:'pending',payment_status:'pending'});
  const h=run(f);
  assert.equal(h.totalSales,1);
  assert.equal(h.skippedLateEntry,1);
});

test('analytics shows the heatmap with its scope',()=>{
  const page=source('app/admin/analytics/page.tsx');
  assert.match(page,/Días y horarios de venta · últimos \{HEATMAP_WINDOW_DAYS\} días/);
  assert.match(page,/<caption className="sr-only">Ventas confirmadas por día de la semana y hora/);
  const service=source('services/commercial-history.ts').split('export async function getCommercialAnalytics')[1].split('export async function')[0];
  assert.match(service,/buildSalesHeatmap\(facts\.sales\)/);
});
