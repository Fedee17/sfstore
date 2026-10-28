import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as prices from '../lib/web-transfer-pricing.ts';
import { analyticsRenderStubs } from './fixtures/analytics-render-stubs.mjs';
import * as categories from '../lib/catalog/public-product-visibility.ts';
const require=createRequire(import.meta.url);
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
function load(f,modules){const out={};new Function('require','exports',ts.transpileModule(read(f),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(n=>Object.hasOwn(modules,n)?modules[n]:require(n),out);return out;}
const items=['cc','lightning'].map(connector=>({productId:'synthetic',comboConnector:connector,name:'Cargador '+connector,slug:connector,category:'accesorios',price:30666.67,quantity:1,stock:2}));
const store={useCartStore:()=>({items,totalItems:2,subtotal:61333.34}),cartItemKey:i=>i.comboConnector};
const hooks={...React,useState:v=>[v,()=>{}],useRef:()=>({current:null}),useEffect:()=>{}};
const modules={...analyticsRenderStubs,'react':hooks,'react/jsx-runtime':jsx,'@/components/cart-item-identity':{CartItemIdentity:({item})=>React.createElement('span',null,item.name)},'@/lib/web-transfer-pricing':prices,'@/lib/catalog/public-product-visibility':categories,'@/store/cart-store':store,'@/components/site-header':{SiteHeader:()=>null},'@/lib/whatsapp':{buildWhatsAppUrl:()=>'/synthetic'}};

test('cart labels list, discount and transfer subtotal without applying the discount twice',()=>{
 const Cart=load('app/carrito/page.tsx',modules).default;
 const html=renderToStaticMarkup(React.createElement(Cart));
 assert.match(html,/Subtotal de lista/);assert.match(html,/61\.333,34/);
 assert.match(html,/Descuento por transferencia/);assert.match(html,/15\.333,34/);
 assert.match(html,/Productos por transferencia/);assert.match(html,/46\.000,00/);
 assert.match(html,/Accesorios/);assert.doesNotMatch(html,/Se confirma al crear el pedido|Alias:/);
 assert.match(html,/Quitar una unidad/);assert.match(html,/Agregar una unidad/);
});
test('checkout line totals and pickup summary use the same unit-rounded transfer contract',()=>{
 const Page=load('app/checkout/page.tsx',{...modules,'next/navigation':{useRouter:()=>({}),useSearchParams:()=>new URLSearchParams()},'@/lib/checkout/guest-client':{},'@/lib/checkout/argentina':{ARGENTINA_PROVINCES:[]},'@/components/transfer-alias':{TransferAlias:()=>null},'@/components/checkout-captcha':{CheckoutCaptcha:()=>null},'@/services/orders':{}}).default;
 const html=renderToStaticMarkup(React.createElement(Page));
 assert.match(html,/Total por transferencia/);assert.match(html,/46\.000,00/);
 assert.equal((html.match(/23\.000,00/g)||[]).length,2);
 assert.doesNotMatch(html,/Se confirma al crear el pedido/);
 assert.equal(prices.getWebTransferSubtotal([{price:30666.67,quantity:3}]),69000);
 assert.equal(prices.getWebTransferSubtotal([{price:100,quantity:2}]),150);
});
test('home hero renders verified payment copy instead of raster installment advertisements',()=>{
 const Hero=load('components/home-hero-slider.tsx',modules).HomeHeroSlider;
 const html=renderToStaticMarkup(React.createElement(Hero,{slides:[{imageSrc:'/old-ad.png',title:'Perfumes',subtitle:'Elegí tu perfume',primaryCtaLabel:'Ver perfumes',primaryCtaHref:'/perfumes'}]}));
 assert.match(html,/25% OFF por transferencia/);assert.match(html,/pago completo/);
 assert.doesNotMatch(html,/<img|cuotas|old-ad/);
});
