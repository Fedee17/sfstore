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
const argentina={ARGENTINA_PROVINCES:['Provincia sintética']};
const require=createRequire(import.meta.url);
function load(file,modules={},globals={},append=''){
 const exports={}; const source=readFileSync(new URL('../'+file,import.meta.url),'utf8')+append;
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',...Object.keys(globals),code)(n=>modules[n]??require(n),exports,...Object.values(globals)); return exports;
}
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const {useCartStore,cartItemKey}=load('store/cart-store.ts',{'@/lib/products/component-combos':combos},{localStorage:storage});
const photo=(url,primary=true)=>({url,alt:'Foto exacta de prueba',sort_order:primary?2:0,is_primary:primary});
const sku=(color)=>({id:color,name:`Termo — Color: ${color} · SKU-${color}`,familyName:'Termo de prueba',familyId:'family',kind:'variant',variantLabel:`Color: ${color}`,sku:`SKU-${color}`,slug:'family',category:'mates',price:100,stock:3,featured:false,shortDescription:'SYNTHETIC',imagePlaceholder:'T',images:[photo(`/detail-${color}.svg`,false),photo(`/sku-${color}.svg`)]});

test('cart retains each SKU photo, color, quantities and exact prices without family cover or economic changes',()=>{
 useCartStore.getState().clearCart(); const grey=sku('Gris'),black=sku('Negro'),before=JSON.stringify(grey);
 useCartStore.getState().addItem(grey);useCartStore.getState().addItem(black);useCartStore.getState().increaseQuantity('Gris');
 const state=useCartStore.getState();assert.equal(state.items.length,2);assert.equal(state.totalItems,3);assert.equal(state.subtotal,300);assert.equal(prices.getWebTransferSubtotal(state.items),225);
 assert.deepEqual(state.items.map(i=>[i.productId,i.variantLabel,i.primaryImageUrl,i.quantity]),[['Gris','Color: Gris','/sku-Gris.svg',2],['Negro','Color: Negro','/sku-Negro.svg',1]]);
 assert.equal(state.items[0].displayName,'Termo de prueba');assert.equal(state.items[0].name,grey.name);assert.equal(JSON.stringify(grey),before);
 const persisted=JSON.parse(memory.get('sfstore-cart'));assert.equal(persisted.state.items[0].primaryImageUrl,'/sku-Gris.svg');
 useCartStore.getState().addItem({...grey,images:[photo('/new-Gris.svg')]});assert.equal(useCartStore.getState().items[0].primaryImageUrl,'/new-Gris.svg');
 assert.equal(useCartStore.getState().items[0].quantity,3);
});

const imageModules={'react':React,'react/jsx-runtime':jsx,'@/lib/products/public-families':{},'@/lib/pricing':{},'@/lib/web-transfer-pricing':prices,'@/lib/whatsapp':{},'@/components/add-to-cart-button':{}};
const {ProductImage}=load('components/product-grid.tsx',imageModules);
const {CartItemIdentity}=load('components/cart-item-identity.tsx',{'react/jsx-runtime':jsx,'@/components/product-grid':{ProductImage}});
const identity=item=>renderToStaticMarkup(React.createElement(CartItemIdentity,{item}));
test('legacy carts without saved images remain readable and never borrow a family or other SKU image',()=>{
 const legacy={productId:'legacy',name:'Producto original',slug:'legacy',category:'mates',quantity:2,price:100,stock:2};
 const html=identity(legacy);assert.match(html,/Producto original/);assert.match(html,/Imagen no disponible/);assert.doesNotMatch(html,/<img|Color:|SKU:/);
 memory.set('sfstore-cart',JSON.stringify({version:1,state:{items:[legacy],totalItems:2,subtotal:200}}));useCartStore.persist.rehydrate();
 assert.equal(useCartStore.getState().items[0].productId,'legacy');assert.equal(useCartStore.getState().subtotal,200);assert.equal(useCartStore.getState().items[0].primaryImageUrl,undefined);
});

test('simple products and the two virtual connectors keep only their own photograph, never a physical component photo',()=>{
 useCartStore.getState().clearCart();const head={...sku('Cabezal'),id:'head',familyId:undefined,kind:'simple',stock:4},cable={...head,id:'cable',stock:4};
 useCartStore.getState().addItem(head);assert.equal(useCartStore.getState().items[0].primaryImageUrl,'/sku-Cabezal.svg');useCartStore.getState().clearCart();
 for(const connector of ['cc','lightning']) useCartStore.getState().addItem({...head,id:`virtual-${connector}`,kind:'combo',familyName:undefined,name:`Combo ${connector}`,images:[photo(`/combo-${connector}.svg`)],price:30666.67,combo:{presentationId:'recipe',connector,priceVersion:'v1',recipeName:'Test',head,cable:{...cable,id:connector}}});
 assert.deepEqual(useCartStore.getState().items.map(i=>[cartItemKey(i),i.primaryImageUrl]),[['recipe:cc','/combo-cc.svg'],['recipe:lightning','/combo-lightning.svg']]);
 assert.equal(prices.getWebTransferSubtotal(useCartStore.getState().items),46000);
 useCartStore.getState().clearCart();useCartStore.getState().addCombo('recipe','Legacy','cc',30666.67,'v1',head,cable);
 assert.equal(useCartStore.getState().items[0].primaryImageUrl,undefined);
});

test('cart and checkout render the same exact SKU identity and retain original monetary summaries',()=>{
 useCartStore.getState().clearCart();useCartStore.getState().addItem(sku('Gris'));
 const state=useCartStore.getState(),modules={'react':React,'react/jsx-runtime':jsx,'@/components/cart-item-identity':{CartItemIdentity},'@/components/site-header':{SiteHeader:()=>null},'@/store/cart-store':{useCartStore:()=>state,cartItemKey},'@/lib/web-transfer-pricing':prices,'@/lib/catalog/public-product-visibility':{publicCategoryLabels:{mates:'Mates'},publicCategoryPaths:{mates:'/mates'}},'@/lib/whatsapp':{buildWhatsAppUrl:()=>'/synthetic'},'next/navigation':{useRouter:()=>({}),useSearchParams:()=>new URLSearchParams()},'@/components/transfer-alias':{TransferAlias:()=>null},'@/lib/checkout/guest-client':{},'@/lib/checkout/argentina':argentina,'@/components/checkout-captcha':{CheckoutCaptcha:()=>null},'@/services/orders':{}};
 const Cart=load('app/carrito/page.tsx',modules).default;
 const Checkout=load('app/checkout/page.tsx',modules,{},'\nexport { CheckoutContent };').CheckoutContent;
 for(const Component of [Cart,Checkout]){
  const html=renderToStaticMarkup(React.createElement(Component));assert.match(html,/src="\/sku-Gris.svg"/);assert.match(html,/Color: Gris/);assert.match(html,/SKU-Gris/);assert.match(html,/Termo de prueba/);assert.doesNotMatch(html,/detail-Gris.svg/);assert.match(html,/75,00/);assert.match(html,/100,00/);
 }
});

test('compact use reuses ProductImage while the existing catalog keeps its standard appearance',()=>{
 const product={name:'Prueba',imagePlaceholder:'PR',primaryImageUrl:'/same.svg'};
 const standard=renderToStaticMarkup(React.createElement(ProductImage,{product})),compact=renderToStaticMarkup(React.createElement(ProductImage,{product,compact:true}));
 assert.match(standard,/aspect-\[4\/3\]/);assert.match(standard,/group-hover:scale/);assert.match(compact,/aspect-square/);assert.doesNotMatch(compact,/group-hover:scale/);
});
