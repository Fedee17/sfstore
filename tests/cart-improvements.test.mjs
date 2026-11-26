// Owner request 20/11: open the cart on add, undo removals, explain the stock limit, sync price and stock, rounding discount.
import * as deliveryChoice from '../lib/checkout/delivery-choice.ts';
import { analyticsRenderStubs } from './fixtures/analytics-render-stubs.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as combos from '../lib/products/component-combos.ts';
import * as prices from '../lib/web-transfer-pricing.ts';
const require=createRequire(import.meta.url);
function load(file,modules={},globals={}){
 modules={...analyticsRenderStubs,'@/lib/web-transfer-pricing':prices,...modules};
 const exports={}; const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',...Object.keys(globals),code)(n=>modules[n]??require(n),exports,...Object.values(globals)); return exports;
}
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const store=load('store/cart-store.ts',{'@/lib/products/component-combos':combos},{localStorage:storage});
const {useCartStore}=store;
const product=(id,extra={})=>({id,name:`Producto ${id}`,slug:id,category:'mates',kind:'simple',price:100,transferPrice:75,stock:3,featured:false,shortDescription:'',imagePlaceholder:'P',...extra});

test('catalog sync updates price and stock, trims quantity, removes sold-out lines and leaves unknown SKUs untouched',()=>{
 const cart=useCartStore.getState();cart.clearCart();
 for(const id of ['a','b','c','d'])cart.addItem(product(id));
 useCartStore.getState().increaseQuantity('b');useCartStore.getState().increaseQuantity('b');
 useCartStore.getState().syncCatalog({a:{price:120,cashPrice:90,stock:3},b:{price:100,cashPrice:75,stock:1},c:{price:100,cashPrice:75,stock:0}});
 const state=useCartStore.getState();
 assert.deepEqual(state.items.map(i=>[i.productId,i.price,i.transferPrice,i.quantity,i.stock]),[['a',120,90,1,3],['b',100,75,1,1],['d',100,75,1,3]]);
 assert.equal(state.subtotal,320);
 assert.deepEqual(state.syncNotices,['Cambió el precio de Producto a.','Queda 1 unidad de Producto b: ajustamos la cantidad.','Producto c se agotó y lo quitamos del carrito.']);
 useCartStore.getState().clearSyncNotices();assert.deepEqual(useCartStore.getState().syncNotices,[]);
 // Sync notices are session-only: they are never written to localStorage.
 assert.doesNotMatch(memory.get('sfstore-cart'),/syncNotices/);
});

test('restoreItems undoes a removal or an emptied cart with the exact previous lines',()=>{
 const cart=useCartStore.getState();cart.clearCart();cart.addItem(product('a'));cart.addItem(product('b'));
 const previous=useCartStore.getState().items;
 useCartStore.getState().clearCart();assert.equal(useCartStore.getState().items.length,0);
 useCartStore.getState().restoreItems(previous);
 assert.deepEqual(useCartStore.getState().items,previous);assert.equal(useCartStore.getState().totalItems,2);
});

test('cart explains the stock limit next to the disabled «+»',()=>{
 const item={productId:'a',name:'Producto a',slug:'a',category:'mates',price:100,transferPrice:75,quantity:2,stock:2};
 const Cart=load('components/cart-content.tsx',{'@/lib/checkout/delivery-choice':deliveryChoice,'react':React,'react/jsx-runtime':jsx,'@/components/cart-item-identity':{CartItemIdentity:()=>null},'@/store/cart-store':{useCartHydrated:()=>true,useCartStore:()=>({items:[item],totalItems:2,subtotal:200}),cartItemKey:i=>i.productId},'@/lib/catalog/public-product-visibility':{publicCategoryPaths:{mates:'/mates'}},'@/lib/whatsapp':{buildWhatsAppUrl:()=>'/synthetic'}}).default;
 const html=renderToStaticMarkup(React.createElement(Cart));
 assert.match(html,/Máximo disponible: 2 unidades\./);
 assert.match(html,/aria-label="Agregar una unidad de Producto a" disabled=""/);
});

test('adding a product announces it so the always-mounted drawer opens and refreshes the cart',()=>{
 const button=readFileSync(new URL('../components/add-to-cart-button.tsx',import.meta.url),'utf8');
 const drawer=readFileSync(new URL('../components/cart-drawer.tsx',import.meta.url),'utf8');
 assert.match(button,/window\.dispatchEvent\(new Event\(cartAddedEvent\)\)/);
 assert.match(drawer,/addEventListener\(cartAddedEvent, open\)/);
 assert.match(drawer,/refreshCartCatalog\(\);\r?\n  if \(dialog && !dialog\.open\) dialog\.showModal\(\);/);
});

test('cart catalog endpoint is read-only, bounded and fail-closed',async()=>{
 let catalog=[{id:'a',kind:'simple',price:100,transferPrice:75,stock:2},{id:'fam',kind:'family',price:1,stock:0,variants:[{id:'v1',kind:'variant',price:150,transferPrice:112.5,stock:4}]}];
 const route=load('app/api/catalog/cart/route.ts',{'next/cache':{unstable_cache:fn=>fn},'@/lib/catalog/public-catalog-revalidation':{PUBLIC_CATALOG_CACHE_TAG:'public-catalog',revalidatePublicCatalogCaches:()=>{}},'@/services/products':{getCatalogPublications:async()=>catalog}});
 const get=async query=>{const response=await route.GET(new Request('http://local/api/catalog/cart'+query));return [response.status,await response.json()];};
 assert.deepEqual(await get('?ids=a,v1,fam,missing'),[200,{a:{price:100,cashPrice:75,stock:2},v1:{price:150,cashPrice:112.5,stock:4}}]);
 assert.equal((await get(''))[0],400);
 assert.equal((await get('?ids=a;drop'))[0],400);
 assert.equal((await get('?ids='+Array.from({length:51},(_,i)=>'x'+i).join(',')))[0],400);
 catalog=[];assert.deepEqual(await get('?ids=a'),[503,{}]);
 assert.doesNotMatch(readFileSync(new URL('../app/api/catalog/cart/route.ts',import.meta.url),'utf8'),/export async function (POST|PUT|PATCH|DELETE)/);
});

test('rounding discount is the gap between the rounded-up total shown and the exact amount paid',()=>{
 assert.equal(prices.getWebRoundingDiscount([{transferPrice:prices.getWebTransferPrice(10001),quantity:1}]),0.25);
 assert.equal(prices.getWebRoundingDiscount([{transferPrice:prices.getWebTransferPrice(100),quantity:2}]),0);
});
