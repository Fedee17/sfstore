import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {projectComponentPublications} from '../lib/products/component-publications.ts';
import * as combo from '../lib/products/component-combos.ts';
import * as pricing from '../lib/store-sales.ts';
const require=createRequire(import.meta.url);
const source=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
function load(f,modules={},globals={}){const out={};const code=ts.transpileModule(source(f),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',...Object.keys(globals),code)(n=>Object.hasOwn(modules,n)?modules[n]:require(n),out,...Object.values(globals));return out;}
const id='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222';
const physical=[['head','Cabezal iPhone',22000],['cc','Cable USB-C a USB-C',15800],['lightning','Cable USB-C a Lightning',15800]].map(([id,name,price])=>({id,name,price,slug:id,stock:id==='head'?2:10,kind:'simple',category:'mates',categoryId:'category',featured:false,shortDescription:'SYNTHETIC',imagePlaceholder:'SY'}));
const offers=['cc','lightning'].map(connector=>({id:rid,name:'SYNTHETIC RECIPE',connector,presentation_product:id,head_slug:'head',cable_slug:connector,combo_list_price:'30666.67',combo_transfer_price:'23000.00',price_version:'v1'}));
const pubs=()=>projectComponentPublications(physical,offers);
const picturedOffers=()=>offers.map((o,index)=>({...o,image_id:`photo-${index}`,image_url:`https://images.test/${o.connector}.webp`,image_alt:`TEST ${o.connector}`}));

test('connector galleries expose several own photographs and reject images reused in another gallery',()=>{
 const rows=picturedOffers().map(o=>({...o,image_gallery:[{id:o.image_id,url:o.image_url,alt:o.image_alt,sort_order:0,is_primary:true},{id:`second-${o.connector}`,url:`https://images.test/${o.connector}-2.webp`,alt:'Second',sort_order:1,is_primary:false}]}));
 const result=projectComponentPublications(physical,rows);
 assert.equal(result[0].images.length,2);assert.equal(result[1].images.length,2);
 assert.ok(result[0].images.every(i=>!i.url.includes('lightning')));
 rows[1].image_gallery.push({...rows[0].image_gallery[0],is_primary:false});
 const guarded=projectComponentPublications(physical,rows);
 assert.equal(guarded[0].primaryImageUrl,null);
 assert.ok(!guarded[0].images.some(i=>i.url===rows[0].image_url));
});

test('P02 keeps each exact connector image in primary and gallery without changing commercial fields',()=>{
 const before=structuredClone(physical),plain=pubs(),pictured=projectComponentPublications(physical,picturedOffers());
 for(let i=0;i<2;i++){
  const p=pictured[i],url=`https://images.test/${p.combo.connector}.webp`;
  assert.equal(p.primaryImageUrl,url);assert.equal(p.images.length,1);assert.equal(p.images[0].url,url);assert.match(p.primaryImageAlt,new RegExp(p.name));
  for(const field of ['id','slug','name','price','transferPrice','stock','combo'])assert.deepEqual(p[field],plain[i][field]);
 }
 assert.deepEqual(physical,before);
});
test('P02 missing connector photo never borrows a component, untagged primary or other combo photo',()=>{
 const source=physical.map(p=>({...p,primaryImageUrl:'https://images.test/component.webp'}));
 const selected=picturedOffers();delete selected[1].image_id;delete selected[1].image_url;
 const result=projectComponentPublications(source,selected);
 assert.equal(result[0].primaryImageUrl,'https://images.test/cc.webp');assert.equal(result[1].primaryImageUrl,null);assert.deepEqual(result[1].images,[]);
 assert.ok(pubs().every(p=>!p.primaryImageUrl&&p.images.length===0));
});
test('P02 duplicate photo IDs or URLs fail closed for both connectors; unsafe URLs are not rendered',()=>{
 for(const field of ['image_id','image_url']){
  const rows=picturedOffers();rows[1][field]=rows[0][field];assert.ok(projectComponentPublications(physical,rows).every(p=>p.primaryImageUrl===null));
 }
 for(const url of ['javascript:alert(1)','data:image/png;base64,TEST','']){
  const rows=picturedOffers();rows[0].image_url=url;assert.equal(projectComponentPublications(physical,rows)[0].primaryImageUrl,null);
 }
});
const storage=new Map();const {useCartStore,cartItemKey}=load('store/cart-store.ts',{'@/lib/products/component-combos':combo},{localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});

test('one recipe yields exactly five presentations, with distinct names, slugs and publication IDs',()=>{
 const all=[...physical,...pubs()];assert.equal(all.length,5);assert.equal(new Set(all.map(p=>p.id)).size,5);assert.equal(new Set(all.map(p=>p.slug)).size,5);
 assert.deepEqual(pubs().map(p=>p.name),['Cargador completo USB-C a USB-C','Cargador completo USB-C a Lightning']);
 assert.ok(pubs().every(p=>p.kind==='combo'&&p.combo.presentationId===id&&p.price===30666.67&&p.transferPrice===23000));
});
test('publication stock is derived from exact components, never a writable combo balance',()=>{
 const before=structuredClone(physical);assert.ok(pubs().every(p=>p.stock===2));assert.deepEqual(physical,before);
 assert.equal(projectComponentPublications(physical.map(p=>p.id==='cc'?{...p,stock:0}:p),offers)[0].stock,0);
 assert.equal(projectComponentPublications(physical.filter(p=>p.id!=='cc'),offers).length,1);
 assert.deepEqual(projectComponentPublications(physical.filter(p=>p.id!=='head'),offers),[]);
});
test('wrong target, unapproved rule, invalid connector and duplicate offers fail closed',()=>{
 assert.deepEqual(projectComponentPublications(physical,offers.map(o=>({...o,combo_transfer_price:22000}))),[]);
 assert.deepEqual(projectComponentPublications(physical,offers.map(o=>({...o,price_version:''}))),[]);
 assert.deepEqual(projectComponentPublications(physical,[{...offers[0],connector:'usb-a'}]),[]);
 assert.throws(()=>projectComponentPublications(physical,[offers[0],offers[0]]),/DUPLICATE/);
});
test('virtual URLs round-trip without creating or accepting a fabricated physical identity',()=>{
 for(const p of pubs())assert.deepEqual(combo.parseComponentPublicationSlug(p.slug),{presentationId:id,connector:p.combo.connector});
 for(const slug of ['combo-not-a-uuid-cc','combo-'+id+'-usb-a','head'])assert.equal(combo.parseComponentPublicationSlug(slug),null);
});
test('catalog addItem routes each publication to existing UUID + connector and retains its own URL',()=>{
 useCartStore.getState().clearCart();for(const p of pubs())useCartStore.getState().addItem(p);
 const items=useCartStore.getState().items;assert.equal(items.length,2);assert.ok(items.every(i=>i.productId===id&&i.price===30666.67));
 assert.deepEqual(items.map(i=>i.comboConnector),['cc','lightning']);assert.equal(new Set(items.map(cartItemKey)).size,2);
 assert.deepEqual(items.map(i=>i.slug),pubs().map(p=>p.slug));assert.ok(items.every(i=>i.components.length===2));
 useCartStore.getState().addItem(physical[0]);assert.equal(useCartStore.getState().items.length,2);
 useCartStore.getState().increaseQuantity(cartItemKey(items[0]));assert.equal(useCartStore.getState().items[0].quantity,1);
});
test('legacy selector and standalone carts merge safely without another head or discount',()=>{
 useCartStore.getState().clearCart();useCartStore.getState().addCombo(id,'LEGACY','cc',30666.67,'v1',physical[0],physical[1]);useCartStore.getState().addItem(pubs()[0]);
 assert.equal(useCartStore.getState().items.length,1);assert.equal(useCartStore.getState().items[0].quantity,2);
 useCartStore.getState().clearCart();useCartStore.getState().addItem(physical[0]);useCartStore.getState().addItem(pubs()[0]);useCartStore.getState().addItem(pubs()[1]);
 assert.equal(useCartStore.getState().items.length,2);assert.equal(pricing.calculateStoreSalePricing([{price:30666.67,quantity:2}],['cash','transfer']).total,46000);
 assert.equal(pricing.calculateStoreSalePricing([{price:30666.67,quantity:1}],['debit']).total,30666.67);
});
test('catalog and detail add controls recognize the same logical combo already in the cart',()=>{
 const p=pubs()[0],items=[{productId:id,comboConnector:'cc',quantity:2,stock:2}];
 const hooks={...React,useState:()=>['',()=>{}]};const store={cartItemKey,useCartStore:Object.assign(fn=>fn({items,addItem:()=>{}}),{getState:()=>({items,addItem:()=>{}})})};
 for(const [f,name] of [['components/add-to-cart-button.tsx','AddToCartButton'],['app/producto/[slug]/product-actions.tsx','ProductActions']]){
  const m=load(f,{'react':hooks,'react/jsx-runtime':jsx,'@/store/cart-store':store,'@/lib/whatsapp':{getProductWhatsAppLink:()=>'/synthetic'}});
  const html=renderToStaticMarkup(React.createElement(m[name],{product:p}));assert.match(html,/disabled=""/);assert.match(html,/Stock máximo en carrito/);
 }
});

// Exercise actual paginated catalog services, including a backend clamp of one row per response.
function moduleUrl(code){return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');}
const service=await import(moduleUrl(source('services/products.ts')
 .replace('@/lib/products/component-publications',new URL('../lib/products/component-publications.ts',import.meta.url).href)
 .replace('@/lib/products/component-combos',new URL('../lib/products/component-combos.ts',import.meta.url).href)
 .replace('@/lib/products/public-families',new URL('../lib/products/public-families.ts',import.meta.url).href)
 .replace('@/lib/web-transfer-pricing',new URL('../lib/web-transfer-pricing.ts',import.meta.url).href)
 .replace('@/data/products',moduleUrl('export const products=[];'))
 .replace('@/lib/catalog/public-product-visibility',new URL('../lib/catalog/public-product-visibility.ts',import.meta.url).href)
 .replace('@/lib/products/yara-rosa-consolidation',new URL('../lib/products/yara-rosa-consolidation.ts',import.meta.url).href)
 .replace('@/lib/supabase/client',moduleUrl('export const getSupabaseClient=()=>globalThis.__publicationDb;'))));
const raw=physical.map((p,i)=>({...p,id:`00000000-0000-4000-8000-00000000000${i}`,status:'active',historical_identity:false,short_description:'SYNTHETIC',category_id:'category',category_slug:'mates',categories:{id:'category',name:'Accesorios',slug:'mates',is_active:true}}));
function db(offerError=false,visible=raw,offered=offers){const calls=[];return{calls,from(table){let rows=[...(table==='public_catalog_skus'?visible:offered)];const q={select(){return q;},order(){return q;},limit(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},neq(k,v){rows=rows.filter(r=>r[k]!==v);return q;},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q;},gt(k,v){rows=rows.filter(r=>r[k]>v);return q;},or(v){const m=/id.gt.([^,]+),and\(id.eq.[^,]+,connector.gt.([^)]*)\)/.exec(v);assert.ok(m);rows=rows.filter(r=>r.id>m[1]||(r.id===m[1]&&r.connector>m[2]));return q;},then(ok,bad){calls.push(table);return Promise.resolve({data:rows.slice(0,1),error:table==='public_component_offers'&&offerError?{code:'SYNTHETIC'}:null}).then(ok,bad);}};return q;}};}

test('P02 actual paginated catalog and each detail use the same connector photo',async()=>{
 globalThis.__publicationDb=db(false,raw,picturedOffers());
 const catalog=await service.getCatalogPublications();
 for(const p of catalog.filter(p=>p.kind==='combo')){
  const detail=await service.getProductBySlug(p.slug);assert.equal(detail.primaryImageUrl,p.primaryImageUrl);assert.equal(p.primaryImageUrl,`https://images.test/${p.combo.connector}.webp`);
 }
});

test('P02 uses the existing editor and removes the separate association form',()=>{
 const page=source('app/admin/productos/componentes/page.tsx');
 assert.doesNotMatch(page,/ComponentOfferImageForm|Guardar fotografías por conector/);
 assert.doesNotMatch(page,/editar\?conector=/);
 const editor=source('app/admin/productos/[id]/editar/page.tsx');
 assert.match(editor,/connector \? updateComponentGallery : updateProduct/);
 assert.match(editor,/image.combo_connector === connector/);
 assert.doesNotMatch(editor,/Presentación del cargador|aria-current|conector=/);
});

test('actual category and search publication source returns all five despite page clamps and equal recipe IDs',async()=>{
 globalThis.__publicationDb=db();const products=await service.getProductsByCategorySlug('mates');assert.equal(products.length,5);assert.equal(products.filter(p=>p.kind==='combo').length,2);
 assert.equal((await service.getCatalogPublications()).length,5);
});
test('each virtual detail resolves exact connector with batched physical reads; old head URL stays simple',async()=>{
 globalThis.__publicationDb=db();for(const p of pubs()){const detail=await service.getProductBySlug(p.slug);assert.equal(detail.name,p.name);assert.equal(detail.combo.connector,p.combo.connector);}
 assert.equal((await service.getProductBySlug('head')).kind,'simple');
});
test('offer failure leaves physical catalog functional and never invents a combo',async()=>{
 globalThis.__publicationDb=db(true);assert.equal((await service.getCatalogPublications()).length,3);assert.equal(await service.getProductBySlug(pubs()[0].slug),null);
 globalThis.__publicationDb=db(false,raw.filter(p=>p.slug!=='cc'));assert.equal((await service.getCatalogPublications()).filter(p=>p.kind==='combo').length,1);
});

test('counter search and quick choices expose both named virtual presentations without listing a physical combo SKU',()=>{
 let state=0;
 const hooks={useActionState:()=>[{status:'idle',message:''},()=>{}],useState:init=>{const n=state++;return [n===0?'cargador completo':n===1?true:typeof init==='function'?init():init,()=>{}];},useMemo:fn=>fn(),useRef:()=>({current:{}})};
 const recipe={id:rid,name:'SYNTHETIC',head_product:'head',cable_cc_product:'cc',cable_lightning_product:'lightning',presentation_product:id,prices_approved:true,combo_list_price:30666.67,combo_price_version:'v1'};
 const {StoreSaleForm}=load('components/admin/sales/store-sale-form.tsx',{'react':hooks,'react/jsx-runtime':jsx,'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/app/admin/ventas/actions':{createStoreSaleAction:()=>{}},'@/components/admin/pending-submit-button':{PendingSubmitButton:({children,pendingLabel,...props})=>React.createElement('button',{...props,'aria-label':pendingLabel},children)},'@/lib/store-sales':pricing,'@/lib/products/component-combos':combo});
 const html=renderToStaticMarkup(React.createElement(StoreSaleForm,{products:physical,recipes:[recipe]}));
 assert.match(html,/Agregar Cargador completo USB-C a USB-C/);assert.match(html,/Agregar Cargador completo USB-C a Lightning/);
 assert.match(html,/<span class="block font-semibold">Cargador completo USB-C a USB-C/);assert.match(html,/<span class="block font-semibold">Cargador completo USB-C a Lightning/);
 assert.match(html,/Disponibles: 2/);assert.match(html,/23.000,00/);assert.doesNotMatch(html,/name="productId"/);
});

test('combo enquiry retains exact connector without unrelated mate/thermo recommendations',()=>{
 const {buildProductWhatsAppMessage}=load('lib/whatsapp.ts',{'@/lib/brand':{brand:{whatsapp:'000'}},'@/lib/pricing':{getTransferUnitPrice:()=>0}});
 const message=buildProductWhatsAppMessage(pubs()[1]);assert.match(message,/USB-C a Lightning/);assert.match(message,/compatibilidad/);assert.doesNotMatch(message,/termo|yerba|bombilla/);
});

test('checkout serialization of both virtual publications sends only the original UUID and each connector',async()=>{
 useCartStore.getState().clearCart();for(const p of pubs())useCartStore.getState().addItem(p);let payload;
 const memory=new Map();const {createOrderFromCheckout}=load('services/orders.ts',{}, {sessionStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},fetch:async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({state:'pending',total:46000})};}});
 await createOrderFromCheckout({customer:{fullName:'SYNTHETIC',phone:'TEST'},shipping:{method:'pickup'},paymentMethod:'transfer',items:useCartStore.getState().items});
 assert.deepEqual(payload.items,[{productId:id,quantity:1,comboConnector:'cc'},{productId:id,quantity:1,comboConnector:'lightning'}]);
 assert.doesNotMatch(JSON.stringify(payload),/combo:|30666|23000|unitPrice|priceVersion|recipeName|components/);
});

test('electronics retain their source category and all five publications belong to Accessories, never Mates',async()=>{
 const electronics=raw.map(p=>({...p,category_slug:'electronica',categories:{...p.categories,name:'Electrónica',slug:'electronica'}}));
 globalThis.__publicationDb=db(false,electronics);
 const all=await service.getProductsByCategorySlug('accesorios');
 assert.equal(all.length,5);assert.ok(all.every(p=>p.category==='accesorios'));
 assert.ok(all.every(p=>p.categoryName==='Electrónica'));
 assert.equal((await service.getProductsByCategorySlug('mates')).length,0);
 assert.equal((await service.getProductsByCategorySlug('perfumes')).length,0);
});
