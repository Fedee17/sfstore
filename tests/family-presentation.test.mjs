import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {getFamilyRepresentativeImage} from '../lib/products/family-presentation.ts';
import {groupPublicProducts} from '../lib/products/public-families.ts';
import * as prices from '../lib/web-transfer-pricing.ts';
const image={url:'/synthetic-grey.svg',alt:'Gris de prueba',is_primary:true,sort_order:0};
const black={id:'black',kind:'variant',familyId:'family',familyName:'Familia de prueba',familySlug:'family',name:'Prueba Negro',sku:'BLACK',slug:'black',category:'mates',price:100,stock:2,featured:false,shortDescription:'Prueba',imagePlaceholder:'PR',variantOptions:{Color:'Negro'},images:[{...image,url:'/synthetic-black.svg'}]};
const grey={...black,id:'grey',sku:'GREY',name:'Prueba Gris',price:120,variantOptions:{Color:'Gris'},images:[image,{...image,url:'/synthetic-grey-detail.svg',is_primary:false,sort_order:1}]};
const green={...black,id:'green',sku:'GREEN',stock:0,variantOptions:{Color:'Verde'}};
const [family]=groupPublicProducts([black,grey,green]);
const approvals=[{familyId:'family',sourceProductId:'grey',imageUrl:image.url,label:'Gris'}];

test('representative photo requires an explicit family, SKU and exact image approval; it does not select or mutate a variant',()=>{
 const before=JSON.stringify(family);
 assert.deepEqual(getFamilyRepresentativeImage(family,approvals),{image,label:'Gris'});
 assert.equal(getFamilyRepresentativeImage(family),null);
 assert.equal(getFamilyRepresentativeImage({...family,id:'different'},approvals),null);
 assert.equal(getFamilyRepresentativeImage(black,approvals),null);
 assert.equal(JSON.stringify(family),before);
 assert.equal(family.variantOptions,undefined);
});
test('removed photo/source never falls back to a different photo, variant or family',()=>{
 assert.equal(getFamilyRepresentativeImage({...family,variants:[black,green]},approvals),null);
 assert.equal(getFamilyRepresentativeImage({...family,variants:[black,{...grey,images:grey.images.slice(1)}]},approvals),null);
});
test('approved Stanley reference resolves only its published image, independent of SKU order or price',()=>{
 const url='https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/5585ed23-1d19-40b0-a443-81953a999e9c/7b39b57749fafde6eddde539961f1724.webp';
 const f={...family,id:'e0eab95c-2f62-5e54-8d12-69870bffbaf8',variants:[black,{...grey,id:'475f74c8-622e-5f0b-801b-309041a3dc3e',images:[{...image,url}]}]};
 assert.equal(getFamilyRepresentativeImage(f)?.image.url,url);
 assert.equal(getFamilyRepresentativeImage({...f,variants:[...f.variants].reverse()})?.label,'Gris');
});

function render(choices={},product=family){
 const require=createRequire(import.meta.url),exports={};
 const source=readFileSync(new URL('../components/product-family-detail.tsx',import.meta.url),'utf8');
 const modules={
  'react':{...React,useState:()=>[choices,()=>{}]},'react/jsx-runtime':jsx,
  'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
  '@/lib/catalog/public-product-visibility':{publicCategoryPaths:{mates:'/mates'}},
  '@/lib/products/family-presentation':{getFamilyRepresentativeImage:p=>getFamilyRepresentativeImage(p,approvals)},
  '@/lib/web-transfer-pricing':prices,'@/components/site-header':{SiteHeader:()=>null},
  '@/components/product-image-gallery':{ProductImageGallery:({images=[],showThumbnails=true})=>React.createElement('div',{'data-gallery':JSON.stringify(images.map(i=>i.url)),'data-thumbnails':showThumbnails})},
  '@/components/add-to-cart-button':{AddToCartButton:({product:p})=>React.createElement('button',{disabled:p.stock<=0,'data-cart-product':p.id,'data-cart-price':p.price},'Agregar al carrito')},
 };
 new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(n=>modules[n]??require(n),exports);
 return renderToStaticMarkup(React.createElement(exports.ProductFamilyDetail,{product}));
}
test('initial family renders the representative cover without any selected option or purchasable SKU',()=>{
 const html=render();
 assert.match(html,/Imagen representativa: Gris/);assert.match(html,/synthetic-grey.svg/);
 assert.doesNotMatch(html,/aria-pressed="true"|data-cart-product/);
 assert.match(html,/<button[^>]*disabled[^>]*>Agregar al carrito/);
 assert.equal(html.split('Elegí tu color').length-1,1);
 assert.doesNotMatch(html,/Todavía no|Elegí un color para continuar|Elegí tu variante|Elegí un color para agregar/);
 assert.match(html,/Desde .*75/);assert.match(html,/Verde · Agotado/);
});
test('selected SKU controls its own price, availability and images, not the cover SKU',()=>{
 const html=render({Color:'Negro'});
 assert.match(html,/data-cart-product="black"/);assert.match(html,/data-cart-price="100"/);
 assert.match(html,/Disponible: 2 unidades/);assert.match(html,/synthetic-black.svg/);
 assert.doesNotMatch(html,/Imagen representativa|synthetic-grey.svg|Desde /);
 const greyHtml=render({Color:'Gris'});
 assert.match(greyHtml,/data-cart-product="grey"/);assert.match(greyHtml,/data-cart-price="120"/);
 assert.match(greyHtml,/90/);assert.match(greyHtml,/synthetic-grey-detail.svg/);
 assert.match(greyHtml,/data-thumbnails="false"/);
});
test('sold-out and invalid selections cannot create a purchasable cart line',()=>{
 assert.match(render({Color:'Verde'}),/Sin stock de esta variante/);
 assert.match(render({Color:'Verde'}),/<button disabled="" data-cart-product="green"/);
 assert.doesNotMatch(render({Color:'Missing'}),/data-cart-product/);
 assert.match(render({Color:'Missing'}),/Esta combinación no está disponible/);
});
test('all dimensions remain required; an incomplete combination never resolves an SKU',()=>{
 const p={...family,variants:[{...black,variantOptions:{Color:'Negro',Capacidad:'1 L'}},{...grey,variantOptions:{Color:'Gris',Capacidad:'2 L'}}]};
 assert.doesNotMatch(render({Color:'Negro'},p),/data-cart-product/);
 assert.match(render({Color:'Negro',Capacidad:'1 L'},p),/data-cart-product="black"/);
 assert.doesNotMatch(render({Color:'Negro',Capacidad:'2 L'},p),/data-cart-product/);
});

function renderGallery(props){
 const require=createRequire(import.meta.url),exports={};
 const source=readFileSync(new URL('../components/product-image-gallery.tsx',import.meta.url),'utf8');
 new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(require,exports);
 return renderToStaticMarkup(React.createElement(exports.ProductImageGallery,{images:[image],productName:'Prueba',placeholder:'PR',...props}));
}
test('gallery natural mobile sizing is opt-in and retains containment and the square notebook frame',()=>{
 const standard=renderGallery({}),natural=renderGallery({naturalSizeOnMobile:true});
 assert.match(standard,/class="aspect-square overflow-hidden"/);
 assert.match(standard,/class="h-full w-full object-contain"/);
 assert.match(natural,/class="overflow-hidden lg:aspect-square"/);
 assert.match(natural,/class="h-auto w-full object-contain lg:h-full"/);
 assert.doesNotMatch(natural,/object-cover/);
});
test('a missing image remains an honest placeholder with either mobile sizing mode',()=>{
 for(const naturalSizeOnMobile of [false,true]){
  const html=renderGallery({images:[],naturalSizeOnMobile});
  assert.match(html,/Imagen no disponible de Prueba/);
  assert.doesNotMatch(html,/<img/);
 }
});

test('family thumbnails can be omitted without removing stored photos or changing the default gallery',()=>{
 const props={images:grey.images};
 const before=JSON.stringify(props);
 const normal=renderGallery(props),hidden=renderGallery({...props,showThumbnails:false});
 assert.match(normal,/aria-label="Ver imagen 1 de Prueba" aria-pressed="true"/);
 assert.match(normal,/aria-label="Ver imagen 2 de Prueba" aria-pressed="false"/);
 assert.match(normal,/synthetic-grey-detail.svg/);
 assert.match(hidden,/synthetic-grey.svg/);
 assert.doesNotMatch(hidden,/<button|grid-cols-4|synthetic-grey-detail.svg/);
 assert.equal(JSON.stringify(props),before);
 assert.equal((hidden.match(/<img/g)??[]).length,1);
});
