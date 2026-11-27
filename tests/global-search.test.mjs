import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {buildGlobalSearch,normalizeSearchTerm,SEARCH_GROUP_LIMIT} from '../lib/admin/global-search.ts';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ok=(data)=>({status:'fulfilled',value:data});
const fail=(message)=>({status:'rejected',reason:new Error(message)});
const sale=(id,channel,historical=false)=>({id,occurredOn:'2026-11-20',totalCents:1200000,original:{order_number:`V-${id}`,channel,historical_import:historical},lines:[{product_name:'Lata Matera'}]});

test('term must be 2 to 80 characters after trimming',()=>{
  assert.equal(normalizeSearchTerm('  lata  '),'lata');
  assert.equal(normalizeSearchTerm('a'),null);
  assert.equal(normalizeSearchTerm('x'.repeat(81)),null);
  assert.equal(normalizeSearchTerm(undefined),null);
});

test('groups results with detail links and a filtered «ver todos» per module',()=>{
  const r=buildGlobalSearch('lata',{
    products:ok([{id:'p1',name:'Lata Matera',sku:'LATA-1',stock:4,status:'active'}]),
    orders:ok([{id:'o1',order_number:'E-1',customer_name:'Ana',displayName:'Lata Matera',status:'ordered',remainingAmount:500}]),
    sales:ok([sale('s1','store'),sale('s2','web'),sale('s3','order'),sale('s4','store',true)]),
    purchases:ok([{id:'c1',occurredOn:'2026-11-10',original:{supplier_name_snapshot:'Proveedor Uno',total_cost:'5000.00'}}]),
    suppliers:ok([{id:'pr1',name:'Latas SA',phone:null,is_active:true}]),
  });
  assert.deepEqual(r.groups.map(g=>[g.key,g.items.map(i=>i.href)]),[
    ['products',['/admin/productos/p1/editar']],
    ['orders',['/admin/pedidos/o1']],
    ['sales',['/admin/ventas/s1','/admin/pedidos/s2','/admin/ventas/s4']],
    ['purchases',['/admin/compras/c1']],
    ['suppliers',['/admin/proveedores/pr1']],
  ]);
  assert.equal(r.groups[0].allHref,'/admin/productos?search=lata');
  assert.equal(r.groups[4].allHref,'/admin/proveedores?q=lata');
  assert.equal(r.total,7);
});

test('limits each group and keeps failures visible per module',()=>{
  const many=Array.from({length:SEARCH_GROUP_LIMIT+3},(_,i)=>({id:`p${i}`,name:`Mate ${i}`,sku:null,stock:0,status:'draft'}));
  const r=buildGlobalSearch('mate',{products:ok(many),orders:fail('x'),sales:fail('COMMERCIAL_SEARCH_TOO_BROAD'),purchases:ok([]),suppliers:ok([])});
  const products=r.groups.find(g=>g.key==='products');
  assert.equal(products.items.length,SEARCH_GROUP_LIMIT);
  assert.equal(products.more,3);
  assert.equal(r.groups.find(g=>g.key==='orders').error,'No pudimos buscar en Encargos.');
  assert.equal(r.groups.find(g=>g.key==='sales').error,'Hay demasiadas ventas con ese texto. Probá con algo más específico.');
  assert.equal(r.groups.find(g=>g.key==='purchases'),undefined);
});

test('the shortcut opens search from any admin screen and the page guards the session',()=>{
  const nav=source('components/admin/admin-nav.tsx');
  assert.match(nav,/<GlobalSearchShortcut\/>/);
  const shortcut=source('components/admin/global-search-shortcut.tsx');
  assert.match(shortcut,/event\.key\.toLowerCase\(\) === "k" && \(event\.ctrlKey \|\| event\.metaKey\)/);
  assert.match(shortcut,/action="\/admin\/buscar"/);
  const page=source('app/admin/buscar/page.tsx');
  assert.match(page,/await requireAdminSession\(\)/);
  const service=source('services/global-search.ts');
  assert.ok(service.indexOf('requireAdminSession()')<service.indexOf('Promise.allSettled'));
});

test('stock detail uses singular for one unit',()=>{
  const r=buildGlobalSearch('mate',{products:ok([{id:'a',name:'A',sku:'A',stock:1,status:'active'},{id:'b',name:'B',sku:'B',stock:3,status:'active'}]),orders:ok([]),sales:ok([]),purchases:ok([]),suppliers:ok([])});
  assert.match(r.groups[0].items[0].detail,/· 1 disponible$/);
  assert.match(r.groups[0].items[1].detail,/· 3 disponibles$/);
});

test('purchase without supplier is named by what was bought',()=>{
  const line=(name)=>({product_name_snapshot:name});
  const r=buildGlobalSearch('lata',{products:ok([]),orders:ok([]),sales:ok([]),suppliers:ok([]),purchases:ok([
    {id:'c1',occurredOn:'2026-01-22',original:{supplier_name_snapshot:null,total_cost:'100'},lines:[line('Lata Matera Negra')]},
    {id:'c2',occurredOn:'2026-01-22',original:{supplier_name_snapshot:'',total_cost:'100'},lines:[line('Lata Matera Roja'),line('Bombilla')]},
    {id:'c3',occurredOn:'2026-01-22',original:{supplier_name_snapshot:null,total_cost:'100'},lines:[]},
  ])});
  assert.deepEqual(r.groups[0].items.map(i=>i.title),['Lata Matera Negra','Lata Matera Roja y 1 producto más','Compra sin detalle']);
  assert.match(r.groups[0].items[0].detail,/^Sin proveedor · /);
});
