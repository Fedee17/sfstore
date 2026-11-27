import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {listingQuality,LISTING_MIN_DESCRIPTION} from '../lib/admin/catalog-review.ts';

const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const long='x'.repeat(LISTING_MIN_DESCRIPTION);
const product=(patch={})=>({id:'p',name:'Mate',slug:'mate',status:'active',price:100,stock:1,featured:false,categories:null,
  description:long,product_images:[{id:'i',url:'a.webp',alt:'Mate de calabaza',sort_order:0,is_primary:true}],
  product_attributes:[{id:'a',name:'Material',value:'Calabaza',sort_order:0}],...patch});

test('a complete listing scores 100 with nothing missing',()=>{
  assert.deepEqual(listingQuality(product()),{score:100,missing:[]});
});

test('each missing piece costs 25 points and is named',()=>{
  assert.deepEqual(listingQuality(product({product_images:[]})),{score:50,missing:['Foto','Texto alternativo']});
  assert.deepEqual(listingQuality(product({product_images:[{id:'i',url:'a.webp',alt:' ',sort_order:0,is_primary:true}]})),{score:75,missing:['Texto alternativo']});
  assert.deepEqual(listingQuality(product({description:'Corta',short_description:''})),{score:75,missing:['Descripción']});
  assert.deepEqual(listingQuality(product({product_attributes:[{id:'a',name:'Material',value:'  ',sort_order:0}]})),{score:75,missing:['Atributos']});
});

test('short description counts when long enough; combos are not scored',()=>{
  assert.equal(listingQuality(product({description:null,short_description:long})).score,100);
  assert.equal(listingQuality(product({component_offer:true})),null);
});

test('products list offers the listing filter and shows the score',()=>{
  const page=source('app/admin/productos/page.tsx');
  assert.match(page,/name="quality" value="low"/);
  assert.match(page,/Ficha \{quality\.score\} %/);
  const service=source('services/admin.ts').split('export async function getAdminProducts')[1].split('export async function')[0];
  assert.match(service,/product_attributes \(/);
});
