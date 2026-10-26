import { analyticsRenderStubs } from './fixtures/analytics-render-stubs.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as prices from '../lib/web-transfer-pricing.ts';
const require=createRequire(import.meta.url);
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
function load(file,modules,append=''){
 modules={...analyticsRenderStubs,...modules};
 const exports={};new Function('require','exports',ts.transpileModule(read(file)+append,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(n=>Object.hasOwn(modules,n)?modules[n]:require(n),exports);return exports;
}
const render=Component=>renderToStaticMarkup(React.createElement(Component));
const item={productId:'synthetic',name:'Producto de prueba',slug:'test',category:'mates',price:100,quantity:2,stock:3};
const modules={'react':React,'react/jsx-runtime':jsx,'@/components/cart-item-identity':{CartItemIdentity:()=>null},'@/components/site-header':{SiteHeader:()=>null},'@/store/cart-store':{useCartStore:()=>({items:[item],totalItems:2,subtotal:200}),cartItemKey:()=>item.productId},'@/lib/web-transfer-pricing':prices,'@/lib/catalog/public-product-visibility':{publicCategoryLabels:{mates:'Mates'},publicCategoryPaths:{mates:'/mates'}},'@/lib/whatsapp':{buildWhatsAppUrl:()=>'/synthetic'},'next/navigation':{useRouter:()=>({}),useSearchParams:()=>new URLSearchParams()},'@/lib/checkout/guest-client':{},'@/lib/checkout/argentina':{ARGENTINA_PROVINCES:[]},'@/components/checkout-captcha':{CheckoutCaptcha:()=>null},'@/services/orders':{}};

test('before order creation cart and checkout never render transfer destination; retain total and essential conditions',()=>{
 const Cart=load('app/carrito/page.tsx',modules).default;
 assert.match(render(Cart),/>Consultar carrito por WhatsApp<\/a>/);
 const Checkout=load('app/checkout/page.tsx',modules,'\nexport {CheckoutContent};').CheckoutContent;
 for(const Component of [Cart,Checkout]){
  const html=render(Component);assert.doesNotMatch(html,/Alias:|Copiar alias|Datos para transferir|Mercado Pago/);assert.match(html,/150,00/);assert.match(html,/No transfieras/);
 }
 const checkout=render(Checkout);assert.match(checkout,/24 horas/);assert.match(checkout,/100%/);assert.match(checkout,/No se admiten señas ni pagos parciales/);assert.match(checkout,/Esperá la confirmación del local/);
});

const receipt={id:'synthetic-order',payment_method:'transfer',payment_status:'pending',state:'pending',expired:false,order_number:'SYNTHETIC-1',total:150,expiresAt:'2030-01-01T12:00:00Z',lines:[]};
test('shipping without an accepted quote withholds transfer details and prevents creating an order',()=>{
 const hooks={...React,useState:initial=>React.useState(initial?.deliveryMethod?{...initial,deliveryMethod:'shipping'}:initial)};
 const Checkout=load('app/checkout/page.tsx',{...modules,react:hooks},'\nexport {CheckoutContent};').CheckoutContent;
 const html=render(Checkout);assert.match(html,/Pendiente de cotización; no transfieras/);assert.match(html,/Primero conocé y aceptá el total definitivo/);assert.doesNotMatch(html,/Alias:|Copiar alias/);assert.match(html,/<button[^>]*disabled=""[^>]*>Preparar pedido por transferencia/);
});
async function renderReceipt(order){
 let requested;const Page=load('app/checkout/exito/page.tsx',{'react/jsx-runtime':jsx,'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/services/checkout-buyer-receipt':{getBuyerCheckoutReceipt:async id=>{requested=id;return order;}},'@/components/transfer-alias':{TransferAlias:()=>React.createElement('div',{'data-testid':'transfer-details'},'SYNTHETIC-ALIAS')},'@/components/checkout-payment-report-form':{CheckoutPaymentReportForm:()=>null}}).default;
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({order:'synthetic-order',number:'FORGED',total:'0.01'})}));assert.equal(requested,'synthetic-order');return html;
}
test('authorized created order alone supplies definitive total and transfer destination, ignoring query amounts',async()=>{
 const html=await renderReceipt(receipt);assert.match(html,/SYNTHETIC-ALIAS/);assert.match(html,/150,00/);assert.doesNotMatch(html,/FORGED|0,01/);
});
test('unauthorized, non-transfer, closed, already paid and reported orders do not invite another transfer',async()=>{
 for(const order of [null,{...receipt,payment_method:'card'},{...receipt,state:'cancelled'},{...receipt,state:'expired'},{...receipt,expired:true},{...receipt,payment_status:'paid'},{...receipt,report:{status:'pending'}}]) assert.doesNotMatch(await renderReceipt(order),/SYNTHETIC-ALIAS/);
});
test('global WhatsApp is absent throughout purchase, preserving the existing catalog access',()=>{
 for(const pathname of ['/carrito','/checkout','/checkout/exito','/perfumes','/mates','/']){
  const Button=load('components/whatsapp-floating-button.tsx',{'react/jsx-runtime':jsx,'next/navigation':{usePathname:()=>pathname},'@/lib/whatsapp':{buildWhatsAppUrl:()=>'/synthetic-whatsapp'}}).WhatsAppFloatingButton;
  const html=render(Button);
  if(pathname==='/carrito'||pathname.startsWith('/checkout')) assert.equal(html,'');
  else {assert.match(html,/fixed bottom-5/);assert.match(html,/aria-label="Consultar por WhatsApp"/);assert.match(html,/href="\/synthetic-whatsapp"/);assert.match(html,/noopener noreferrer/);}
 }
});
