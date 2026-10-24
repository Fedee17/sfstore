import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeAdminProductPublications} from '../lib/products/admin-component-publications.ts';
import {parseComponentPublicationSlug} from '../lib/products/component-combos.ts';
const pid='11111111-1111-4111-8111-111111111111';
const head={id:'head',name:'Cabezal',slug:'cabezal',category_id:'electronics',categories:{name:'Electrónica',slug:'electronica'},price:22000,stock:21,status:'active',featured:false};
const parent={...head,id:pid,name:'Presentación compartida',stock:0};
const cables=['cc','lightning'].map(c=>({...head,id:c,name:`Cable ${c}`,slug:c,price:15800,stock:10}));
const products=[head,...cables,parent];
const offers=['cc','lightning'].map(connector=>({presentation_product:pid,connector,head_product:'head',available:10,combo_list_price:30666.67,combo_transfer_price:23000,image_id:null,image_url:null,image_alt:null}));
test('existing offers become two individual admin entries, plus three physical products, with no extra inventory',()=>{
 const before=structuredClone(products);
 const rows=mergeAdminProductPublications(products,offers,[head]);
 assert.equal(rows.length,5);assert.equal(new Set(rows.map(p=>p.id)).size,5);
 for(const row of rows.filter(p=>p.component_offer)){
  assert.equal(row.price,30666.67);assert.equal(row.transfer_price,23000);assert.equal(row.cost,null);
  const identity=parseComponentPublicationSlug(row.id);assert.equal(identity.presentationId,pid);
  assert.equal(row.name,identity.connector==='cc'?'Cargador completo USB-C a USB-C':'Cargador completo USB-C a Lightning');
 }
 assert.deepEqual(products,before);assert.ok(!rows.some(p=>p.id===pid));
});
test('search and category, status, availability and featured filters apply to virtual entries',()=>{
 const select=f=>mergeAdminProductPublications([],offers,[head],f);
 assert.equal(select({search:'Lightning'}).length,1);
 assert.equal(select({search:'cargador'}).length,2);
 for(const f of [{category:'perfumes'},{status:'draft'},{stock:'out'},{stock:'low'},{featured:true}])assert.equal(select(f).length,0);
 assert.equal(select({category:'electronics',status:'active'}).length,2);
});
test('duplicates and missing physical references fail explicitly; other products remain unchanged',()=>{
 assert.throws(()=>mergeAdminProductPublications([],offers,[]),/CATEGORY/);
 assert.throws(()=>mergeAdminProductPublications([],[offers[0],offers[0]],[head]),/DUPLICATE/);
 assert.deepEqual(mergeAdminProductPublications(products,[],[]),products);
});
test('admin list uses the normal Edit link and does not expose inventory actions for virtual rows',()=>{
 const page=readFileSync(new URL('../app/admin/productos/page.tsx',import.meta.url),'utf8');
 assert.match(page,/getAdminProductPublications\(productsFilters\)/);
 assert.match(page,/href=\{`\/admin\/productos\/\$\{product.id\}\/editar`\}/);
 assert.match(page,/!product.component_offer \? <>[\s\S]*InventoryAdjustmentForm[\s\S]*archiveProduct/);
 const editor=readFileSync(new URL('../app/admin/productos/[id]/editar/page.tsx',import.meta.url),'utf8');
 assert.match(editor,/parseComponentPublicationSlug\(editorId\)/);
 assert.doesNotMatch(editor,/<nav|conector=/);
});
