import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as web from '../lib/web-transfer-pricing.ts';
import * as combos from '../lib/products/component-combos.ts';
import { analyticsRenderStubs } from './fixtures/analytics-render-stubs.mjs';

const require = createRequire(import.meta.url);
const source = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
function load(file, overrides={}, globals={}, append='') {
  const modules = {...analyticsRenderStubs, react:React, 'react/jsx-runtime':jsx,
    '@/lib/web-transfer-pricing':web, '@/lib/products/component-combos':combos,
    '@/lib/brand':{brand:{whatsapp:'0000000000'}}, ...overrides};
  const exports={};
  const code=ts.transpileModule(source(file)+append,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',...Object.keys(globals),code)(id=>modules[id]??require(id),exports,...Object.values(globals));
  return exports;
}
const whatsapp=load('lib/whatsapp.ts',{'@/lib/pricing':require('../lib/pricing.ts')});
const storage=new Map();
const {useCartStore,cartItemKey}=load('store/cart-store.ts',{}, {localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
const product=(price,extra={})=>({id:'test',name:'Producto sintético',slug:'synthetic',kind:'simple',category:'perfumes',price,stock:3,featured:false,imagePlaceholder:'SY',shortDescription:'Prueba',...extra});
const invalid=[null,undefined,0,-1,NaN,Infinity,-Infinity,'100',Number.MAX_VALUE,0.001];
const storeModule={useCartStore,cartItemKey};
const ui={'@/store/cart-store':storeModule,'@/lib/whatsapp':whatsapp};
const {AddToCartButton}=load('components/add-to-cart-button.tsx',ui);
const {ProductActions}=load('app/producto/[slug]/product-actions.tsx',ui);
const {ProductGrid}=load('components/product-grid.tsx',{...ui,'@/lib/pricing':require('../lib/pricing.ts'),'@/lib/products/public-families':require('../lib/products/public-families.ts'),'@/components/add-to-cart-button':{AddToCartButton}});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));

test('a purchasable price is a positive finite amount within the existing web monetary contract',()=>{
  for(const price of invalid) assert.equal(web.hasValidWebPrice(price),false,String(price));
  for(const [price,net] of [[0.01,0.01],[1.34,1.01],[22000,16500],[15800,11850],[30666.67,23000]]){
    assert.equal(web.hasValidWebPrice(price),true);assert.equal(web.getWebTransferPrice(price),net);
  }
  assert.equal(web.getWebTransferSubtotal([{price:30666.67,quantity:3}]),69000);
});

test('the two confirmed cases use Consultar precio, retain availability and never quote a free price',()=>{
  for(const name of ['La voie Maison Alhambra','Momento Riffs']) for(const price of invalid){
    const p=product(price,{name}); const before={...p};
    for(const Component of [AddToCartButton,ProductActions]){
      const html=render(Component,{product:p});assert.match(html,/Consultar precio/);assert.doesNotMatch(html,/<button|Agregar al carrito|Sin stock|disponibilidad/);
      assert.match(html,/wa.me/);assert.doesNotMatch(decodeURIComponent(html),/precio lista de|transferencia de \$/);
    }
    for(const priceMode of ['full','compact']){
      const html=render(ProductGrid,{products:[p],label:'Sintético',priceMode});assert.match(html,/En stock/);assert.match(html,/Precio a confirmar/);assert.match(html,/Consultar precio/);assert.doesNotMatch(html,/Agregar al carrito|NaN|Infinity|\$\s*0/);
    }
    assert.deepEqual(p,before);
  }
});

test('simple SKU, selected variants, individual components and combos cannot bypass the store guard',()=>{
  for(const price of invalid){
    useCartStore.getState().clearCart();
    for(const kind of ['simple','variant']) useCartStore.getState().addItem(product(price,{kind}));
    assert.equal(useCartStore.getState().items.length,0);
    const head=product(22000,{id:'head'}),cable=product(15800,{id:'cc'});
    assert.equal(useCartStore.getState().addComponents({...head,price},cable),false);
    assert.equal(useCartStore.getState().addCombo('combo','Combo','cc',price,'v1',head,cable),false);
    assert.equal(useCartStore.getState().addCombo('combo','Combo','cc',30666.67,'v1',{...head,price},cable),false);
    assert.equal(useCartStore.getState().subtotal,0);
  }
  useCartStore.getState().addItem(product(100));useCartStore.getState().increaseQuantity('test');
  const before=structuredClone(useCartStore.getState().items);
  useCartStore.getState().addItem(product(0));assert.deepEqual(useCartStore.getState().items,before);
  assert.equal(web.getWebTransferSubtotal(before),150);
});

test('current and legacy storage remove invalid prices, rebuild forged totals and preserve valid SKU snapshots',async()=>{
  for(const version of [0,1,2]){
    const valid={productId:'valid',name:'SKU válido',price:100,quantity:2,stock:3,category:'mates',slug:'valid',primaryImageUrl:'/exact.svg'};
    const rows=[valid,...[0,null,-1,'100'].map((price,i)=>({...valid,productId:`bad-${i}`,price}))];
    storage.set('sfstore-cart',JSON.stringify({version,state:{items:rows,subtotal:999999,totalItems:999}}));
    await useCartStore.persist.rehydrate();
    const state=useCartStore.getState();assert.deepEqual(state.items,[valid]);assert.equal(state.subtotal,200);assert.equal(state.totalItems,2);assert.equal(state.invalidPriceNotice,true);
    assert.equal(typeof state.addItem,'function');assert.equal(state.items[0].primaryImageUrl,'/exact.svg');
  }
});

test('cart defensively withholds checkout and totals for mixed invalid runtime lines; hydration removal is explained',()=>{
  const rows=[{...product(100),productId:'valid',quantity:1},{...product(null),productId:'bad',quantity:1}];
  const Cart=load('app/carrito/page.tsx',{'@/lib/whatsapp':whatsapp,'@/components/site-header':{SiteHeader:()=>null},'@/components/cart-item-identity':{CartItemIdentity:()=>null},'@/lib/catalog/public-product-visibility':{publicCategoryLabels:{perfumes:'Perfumes'},publicCategoryPaths:{perfumes:'/perfumes'}},'@/store/cart-store':{cartItemKey,useCartStore:()=>({items:rows,totalItems:2,subtotal:NaN,invalidPriceNotice:true})}}).default;
  const html=render(Cart);assert.match(html,/Consultar precio/);assert.match(html,/Quitamos del carrito/);assert.match(html,/eliminá los productos sin precio válido/);assert.doesNotMatch(html,/href="\/checkout|NaN|Transferencia por unidad:.*0,00/);
});

test('valid products keep add controls, out of stock remains unavailable, and prices are not mutated',()=>{
  useCartStore.getState().clearCart();
  const p=product(30666.67),html=render(ProductActions,{product:p});assert.match(html,/Agregar al carrito/);assert.doesNotMatch(html,/Consultar precio/);
  const unavailable=render(ProductGrid,{products:[product(100,{stock:0})],label:'Prueba'});assert.match(unavailable,/Sin stock: consultar/);assert.doesNotMatch(unavailable,/Agregar al carrito/);
  assert.equal(product(100,{transferPrice:999}).price,100);
});

test('an explicitly selected unpriced variant consults its own price and never becomes purchasable',()=>{
  const variant=product(null,{id:'grey',kind:'variant',familyId:'family',variantOptions:{Color:'Gris'},sku:'SYNTHETIC-GREY'});
  const Family=load('components/product-family-detail.tsx',{...ui,
    react:{...React,useState:()=>[{Color:'Gris'},()=>{}]},
    'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
    '@/lib/catalog/public-product-visibility':{publicCategoryPaths:{perfumes:'/perfumes'}},
    '@/lib/products/family-presentation':{getFamilyRepresentativeImage:()=>null},
    '@/components/site-header':{SiteHeader:()=>null},'@/components/product-information':{ProductInformation:()=>null},
    '@/components/product-image-gallery':{ProductImageGallery:()=>null},'@/components/add-to-cart-button':{AddToCartButton}
  }).ProductFamilyDetail;
  const html=render(Family,{product:product(100,{id:'family',kind:'family',variants:[variant]})});
  assert.match(html,/Color: Gris/);assert.match(html,/Precio a confirmar/);assert.match(html,/Consultar precio/);
  assert.doesNotMatch(html,/Agregar al carrito<\/button>|\$.*0,00|NaN/);
});
