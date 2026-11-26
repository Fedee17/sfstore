// Owner request 20/11: delivery type is chosen in its own step between cart and checkout.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as prices from '../lib/web-transfer-pricing.ts';
import * as delivery from '../lib/checkout/delivery-choice.ts';
import * as categories from '../lib/catalog/public-product-visibility.ts';
import {brand} from '../lib/brand.ts';
import { analyticsRenderStubs } from './fixtures/analytics-render-stubs.mjs';
import { mercadoPagoUiStubs } from './fixtures/mercadopago-ui-stubs.mjs';
const require=createRequire(import.meta.url);
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
function load(f,modules){const out={};new Function('require','exports',ts.transpileModule(read(f),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(n=>Object.hasOwn(modules,n)?modules[n]:(n.endsWith('.module.css')?{default:new Proxy({}, {get:(_,key)=>key})}:require(n)),out);return out;}
const items=[{productId:'synthetic',name:'Mate prueba',slug:'mate',category:'mates',price:1000,transferPrice:750,quantity:1,stock:2}];
const hooks={...React,useState:v=>[typeof v==='function'?v():v,()=>{}],useRef:()=>({current:null}),useEffect:()=>{}};
const base={...analyticsRenderStubs,'react':hooks,'react/jsx-runtime':jsx,'@/lib/web-transfer-pricing':prices,'@/lib/checkout/delivery-choice':delivery,'@/lib/brand':{brand},'@/lib/catalog/public-product-visibility':categories,'@/components/catalog/catalog-frame':{CatalogFrame:({children})=>React.createElement('main',null,children)},'@/components/cart-item-identity':{CartItemIdentity:({item})=>React.createElement('span',null,item.name)},'@/lib/whatsapp':{buildWhatsAppUrl:()=>'/synthetic'},'next/navigation':{useRouter:()=>({push(){}})},'@/lib/checkout/argentina':{ARGENTINA_PROVINCES:['Córdoba','Santa Fe']}};
const withCart=list=>({...base,'@/store/cart-store':{useCartHydrated:()=>true,useCartStore:()=>({items:list,totalItems:list.length,subtotal:1000,clearCart(){}}),cartItemKey:i=>i.productId}});

test('only the two known query values select a method; anything else keeps the checkout asking',()=>{
 assert.equal(delivery.parseDeliveryChoice('retiro'),'pickup');
 assert.equal(delivery.parseDeliveryChoice('envio'),'shipping');
 for(const value of [null,'','RETIRO','shipping','envio ','x'])assert.equal(delivery.parseDeliveryChoice(value),null);
 assert.equal(delivery.deliveryChoiceHref('pickup'),'/checkout?payment=transfer&entrega=retiro');
 assert.equal(delivery.deliveryChoiceHref('shipping'),'/checkout?payment=transfer&entrega=envio');
});

test('cart continues to the delivery step; pickup is a link and shipping opens its address form in place',()=>{
 const Cart=load('components/cart-content.tsx',withCart(items)).default;
 assert.match(renderToStaticMarkup(React.createElement(Cart)),/href="\/checkout\/entrega"[^>]*>Continuar<\/a>/);
 const Step=load('app/checkout/entrega/page.tsx',withCart(items)).default;
 const html=renderToStaticMarkup(React.createElement(Step));
 assert.match(html,/¿Cómo querés recibir tu compra\?/);
 assert.match(html,/href="\/checkout\?payment=transfer&amp;entrega=retiro"[^>]*>[\s\S]*Retiro en el local[\s\S]*Sin cargo/);
 assert.match(html,/<button type="button"[^>]*aria-expanded="false"[^>]*aria-controls="delivery-shipping"[^>]*>[\s\S]*Envío a domicilio/);
 assert.doesNotMatch(html,/id="delivery-shipping"|entrega=envio/);
 // Same page with the shipping option open (its open choice is the only state that starts undefined).
 const open=renderToStaticMarkup(React.createElement(load('app/checkout/entrega/page.tsx',{...withCart(items),react:{...hooks,useState:v=>[v===undefined?true:v,()=>{}]}}).default));
 assert.match(open,/aria-expanded="true"/);assert.match(open,/<form id="delivery-shipping"/);
 for(const label of ['Provincia','Localidad','Dirección','Código postal','Transporte preferido'])assert.match(open,new RegExp('<label for="delivery-[a-zA-Z]+">'+label+'</label>'));
 assert.match(open,/autoComplete="street-address"/);assert.match(open,/<option value="Andreani">/);assert.match(open,/type="submit"[^>]*>Continuar</);
 assert.ok(html.includes(brand.address));
 const empty=renderToStaticMarkup(React.createElement(load('app/checkout/entrega/page.tsx',withCart([])).default));
 assert.match(empty,/Tu carrito está vacío/);assert.doesNotMatch(empty,/entrega=/);
});

test('shipping address uses one rule set and only a complete, well-formed draft is reused',()=>{
 const memory=new Map();globalThis.sessionStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 try{
  assert.deepEqual(Object.keys(delivery.validateShippingAddress(delivery.emptyShippingAddress)),['province','city','address','postalCode','carrier']);
  const full={province:'Córdoba',city:'San Francisco',address:'Calle 1',postalCode:'2400',carrier:'Andreani'};
  assert.deepEqual(delivery.validateShippingAddress(full),{});
  assert.equal(delivery.parseShippingDraft(memory.get("sfstore-checkout-shipping")??null),null);
  delivery.saveShippingDraft(full);assert.deepEqual(delivery.parseShippingDraft(memory.get("sfstore-checkout-shipping")??null),full);
  memory.set('sfstore-checkout-shipping',JSON.stringify({...full,carrier:'Otro'}));assert.equal(delivery.parseShippingDraft(memory.get("sfstore-checkout-shipping")??null),null);
  memory.set('sfstore-checkout-shipping',JSON.stringify({...full,city:' '}));assert.equal(delivery.parseShippingDraft(memory.get("sfstore-checkout-shipping")??null),null);
  memory.set('sfstore-checkout-shipping','{');assert.equal(delivery.parseShippingDraft(memory.get("sfstore-checkout-shipping")??null),null);
  delivery.saveShippingDraft(full);delivery.clearShippingDraft();assert.equal(delivery.parseShippingDraft(memory.get("sfstore-checkout-shipping")??null),null);
 }finally{delete globalThis.sessionStorage;}
 // The checkout no longer keeps its own copy of the rules or the carrier list.
 const checkout=read('app/checkout/page.tsx');
 assert.match(checkout,/validateShippingAddress\(form\)/);assert.doesNotMatch(checkout,/Ingresá la provincia|"Via Cargo"/);
 assert.match(checkout,/clearCart\(\);\s*clearShippingDraft\(\);/);
});

test('checkout preselects the chosen method, shows only its fields and links back to change it',()=>{
 const render=query=>{const Page=load('app/checkout/page.tsx',{...mercadoPagoUiStubs,...withCart(items),'next/navigation':{useRouter:()=>({}),useSearchParams:()=>new URLSearchParams(query)},'@/lib/checkout/guest-client':{},'@/lib/checkout/argentina':{ARGENTINA_PROVINCES:['Córdoba']},'@/components/checkout-captcha':{CheckoutCaptcha:()=>null},'@/services/orders':{}}).default;return renderToStaticMarkup(React.createElement(Page));};
 const shipping=render('payment=transfer&entrega=envio');
 assert.match(shipping,/Envío a domicilio/);assert.match(shipping,/href="\/checkout\/entrega"[^>]*>Cambiar/);assert.match(shipping,/aria-label="Provincia"/);
 const pickup=render('payment=transfer&entrega=retiro');
 assert.match(pickup,/Retiro en el local · Sin cargo/);assert.match(pickup,/>Cambiar</);assert.doesNotMatch(pickup,/aria-label="Provincia"/);
 assert.match(pickup,/Esperá la confirmación del local antes de retirar/);
 // With a complete address saved by the step: summary line instead of the address fields.
 const draft={province:'Córdoba',city:'San Francisco',address:'Calle 1',postalCode:'2400',carrier:'Andreani'};
 const Page=load('app/checkout/page.tsx',{...mercadoPagoUiStubs,...withCart(items),'@/lib/checkout/delivery-choice':{...delivery,useShippingDraft:()=>draft},'next/navigation':{useRouter:()=>({}),useSearchParams:()=>new URLSearchParams('payment=transfer&entrega=envio')},'@/lib/checkout/guest-client':{},'@/lib/checkout/argentina':{ARGENTINA_PROVINCES:['Córdoba']},'@/components/checkout-captcha':{CheckoutCaptcha:()=>null},'@/services/orders':{}}).default;
 const fromStep=renderToStaticMarkup(React.createElement(Page));
 assert.match(fromStep,/Calle 1, San Francisco, Córdoba \(2400\)\. Transporte: Andreani\./);
 assert.doesNotMatch(fromStep,/aria-label="Provincia"|id="checkout-city"/);assert.match(fromStep,/Calcular envío/);
 // Without a valid choice (old links, typed URLs) both options stay on screen.
 const legacy=render('payment=transfer&entrega=otro');
 assert.doesNotMatch(legacy,/>Cambiar</);assert.match(legacy,/Dejá los datos para calcular/);
});

test('checkout, receipt and payment controls use boutique tokens only, inside the shared catalog frame',()=>{
 for(const file of ['app/checkout/page.tsx','app/checkout/exito/page.tsx','components/checkout-payment-report-form.tsx','components/transfer-alias.tsx']){
  const source=read(file);assert.doesNotMatch(source,/#[0-9A-Fa-f]{6}|bg-\[|text-\[#|border-\[#/,file);
 }
 for(const file of ['app/checkout/page.tsx','app/checkout/exito/page.tsx','app/checkout/entrega/page.tsx'])assert.match(read(file),/<CatalogFrame>/,file);
 // Owner decisions 21/11: own error tone, no floating cart over checkout forms, thumbnails in tokens.
 assert.match(read('app/storefront-theme.css'),/--boutique-danger:/);
 const css=read('app/checkout/checkout.module.css');for(const rule of ['.error','.alert'])assert.match(css,new RegExp('\\'+rule+' \\{[^}]*--boutique-danger'),rule);
 assert.match(read('components/site-header.tsx'),/!pathname\.startsWith\("\/checkout"\)/);
 assert.doesNotMatch(read('components/cart-item-identity.tsx'),/-\[#/);
});
