import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {buildHomeInbox} from '../lib/admin/home-inbox.ts';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const order=(id,status,estimated_date=null)=>({id,status,estimated_date});
const product=(id,status,patch={})=>({id,name:id,slug:id,status,price:100,cost:50,stock:1,product_images:[{url:'x.webp'}],...patch});

test('lists only what needs attention, most urgent first, with the filtered link',()=>{
  const inbox=buildHomeInbox({today:'2026-11-27',
    orders:[order('late','ordered','2026-11-20'),order('due','pending','2026-11-27'),order('ready','ready'),order('done','delivered','2026-11-01')],
    coverage:new Map([['a',{risk:true}],['b',{risk:false}],['c',{risk:true}]]),
    products:[product('ok','active'),product('nophoto','active',{product_images:[]}),product('draft','draft',{product_images:[]})]});
  assert.deepEqual(inbox.items.map(i=>[i.key,i.tone,i.count,i.href]),[
    ['overdue-orders','critical',1,'/admin/pedidos'],
    ['stock-risk','warning',2,'/admin/inventario?stock=risk'],
    ['ready-orders','warning',1,'/admin/pedidos?status=ready'],
    ['incomplete-products','info',1,'/admin/productos?review=incomplete&status=active'],
  ]);
  assert.deepEqual(inbox.unavailable,[]);
});

test('an order due today is not overdue; delivered and cancelled never count',()=>{
  const inbox=buildHomeInbox({today:'2026-11-27',orders:[order('today','ordered','2026-11-27'),order('x','cancelled','2026-11-01')],coverage:new Map(),products:[]});
  assert.deepEqual(inbox.items,[]);
});

test('a failed source is reported as unavailable instead of a zero',()=>{
  const inbox=buildHomeInbox({today:'2026-11-27',orders:null,coverage:null,products:[product('nophoto','active',{product_images:[]})]});
  assert.deepEqual(inbox.items.map(i=>i.key),['incomplete-products']);
  assert.deepEqual(inbox.unavailable,['encargos','stock']);
});

test('home streams the inbox and keeps web payment shortcuts as links only',()=>{
  const page=source('app/admin/page.tsx');
  assert.match(page,/<Suspense fallback=\{<InboxFallback\/>\}><HomeInbox\/><\/Suspense>/);
  assert.match(page,/href="\/admin\/checkout\?view=payments"/);
  const inbox=source('components/admin/home-inbox.tsx');
  assert.match(inbox,/getStockCoverage\(\)\.catch\(\(\) => null\)/);
  assert.match(inbox,/No pudimos revisar/);
  assert.doesNotMatch(inbox,/checkout/);
});
