import { loadProductDetailUi, loadPerfumeAccords, loadCommercialInformation } from './fixtures/product-detail-render.mjs';
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
function load(file,modules={}){modules={...analyticsRenderStubs,...modules};const exports={};new Function('require','exports',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(name=>Object.hasOwn(modules,name)?modules[name]:require(name),exports);return exports;}
const config=load('lib/catalog/attribute-config.ts');
const info=loadCommercialInformation(load,{'@/lib/catalog/attribute-config':config,'./perfume-accords':loadPerfumeAccords(load)});
const {getProductCommercialInformation:describe}=info;
const ui=loadProductDetailUi(load,{'@/lib/whatsapp':{buildWhatsAppUrl:message=>'/synthetic?text='+encodeURIComponent(message)}});
const {ProductInformation}=ui['@/components/product-information'];
const purchaseSummary=ui['@/components/product-purchase-summary'];
const {ProductPricePanel}=ui['./product-price-panel'];const {getPublishedPaymentPrices}=ui['@/lib/products/payment-prices'];
const web=ui['@/lib/web-transfer-pricing'];
const panel=price=>renderToStaticMarkup(React.createElement(ProductPricePanel,{prices:getPublishedPaymentPrices({price,transferPrice:web.hasValidWebPrice(price)?web.getWebTransferPrice(price):null})}));
const attr=(name,value)=>({name,value});
const base={id:'synthetic',name:'PRUEBA',slug:'synthetic',kind:'simple',category:'perfumes',price:100,stock:2,primaryImageUrl:'/synthetic.svg',shortDescription:'Resumen de prueba',description:'Primer párrafo.\n\nSegundo párrafo.',attributes:[]};

test('registered perfume profile reuses labels, legacy aliases and explicit notes without inferring duration',()=>{
 const product={...base,attributes:[attr('Familia olfativa','Cítrico'),attr('olfactory_family','citrico'),attr('Intensidad','media'),attr('Ocasión','noche'),attr('occasion','valor-desconocido'),attr('Notas','bergamota'),attr('Duración','12 horas')]};
 assert.deepEqual(describe(product).fields,[{label:'Perfil olfativo',values:['Cítrico']},{label:'Intensidad orientativa',values:['Media']},{label:'Ocasiones sugeridas',values:['Noche']},{label:'Notas',values:['bergamota']}]);
});
test('only explicit public-facing fields appear; supplier, costs, source metadata and unsupported values stay out',()=>{
 const product={...base,attributes:[attr('Marca','Marca sintética'),attr('marca','Marca sintética'),attr('Proveedor','NO PUBLICAR'),attr('cost','999'),attr('source','internal'),attr('material','no-verificado')]};
 assert.deepEqual(describe(product).fields,[{label:'Marca',values:['Marca sintética']}]);
});
test('material and capacity remain verbatim registered data, never parsed from product names',()=>{
 const product={...base,category:'mates',name:'Termo de acero 1L',attributes:[attr('Material','Algarrobo'),attr('material','algarrobo'),attr('Capacidad','750 ml')]};
 assert.deepEqual(describe(product).fields,[{label:'Material',values:['Algarrobo']},{label:'Capacidad',values:['750 ml']}]);
 assert.deepEqual(describe({...product,attributes:[]}).fields,[]);
 assert.deepEqual(describe({...base,category:'accesorios',attributes:product.attributes}).fields,[]);
});
test('description paragraphs survive and duplicate summaries disappear without modifying stored input',()=>{
 const before=JSON.stringify(base);assert.equal(describe(base).description,base.description);assert.equal(JSON.stringify(base),before);
 assert.equal(describe({...base,shortDescription:' Texto de prueba ',description:'texto\n de prueba'}).description,'');
 assert.deepEqual(describe({category:'mates'}),{shortDescription:'',description:'',fields:[],notesSource:undefined,communityReviewsUrl:undefined,accords:undefined});
});

test('import templates disappear while actual commercial sentences and attributes survive unchanged',()=>{
 const product={...base,shortDescription:'Eclaire disponible en SFSTORE. Te ayudamos a elegir según tus gustos, ocasión y presupuesto.',description:'Eclaire forma parte del catálogo de perfumes de SFSTORE. Si tenés dudas, te acompañamos para elegir una opción útil, linda y adecuada para comprar o regalar.',attributes:[attr('olfactory_family','gourmand'),attr('occasion','cita')]};
 const before=JSON.stringify(product),result=describe(product);
 assert.equal(result.shortDescription,'');assert.equal(result.description,'');assert.equal(JSON.stringify(product),before);
 assert.deepEqual(result.fields,[{label:'Perfil olfativo',values:['Gourmand']},{label:'Ocasiones sugeridas',values:['Cita']}]);
 const html=renderToStaticMarkup(React.createElement(ProductInformation,{product}));
 assert.match(html,/Gourmand/);assert.doesNotMatch(html,/<details|disponible en SFSTORE|forma parte del catálogo|Te ayudamos|Si tenés dudas/);
 assert.equal(describe({...product,description:'Notas de salida: bergamota. Te ayudamos a elegir según tus gustos, ocasión y presupuesto.'}).description,'Notas de salida: bergamota.');
 assert.equal(describe({...base,shortDescription:'Cítricos y jengibre.',description:'Cítricos y jengibre. Fondo de maderas.'}).description,'Fondo de maderas.');
 assert.equal(describe({...base,description:'Mayar combina estilo, presencia y una sensación de calidad desde el primer uso. Es una alternativa ideal si buscás un perfume para regalar bien, probar algo distinto o sumar a tu rutina un aroma que acompañe tu estilo. En SFSTORE te ayudamos a elegir según tus gustos, ocasión y presupuesto.'}).description,'');
 assert.equal(renderToStaticMarkup(React.createElement(ProductInformation,{product:{category:'perfumes'}})),'');
});

test('purchase summary preserves rounding, price order and only documented originality',()=>{
 const html=panel(129333.67);
 assert.match(html,/line-through/);assert.ok(html.indexOf('129.334')<html.indexOf('97.001'));assert.match(html,/25% OFF · Efectivo \/ Transferencia/);
 assert.match(html,/Ahorrás<strong[^>]*>\$\s*32\.333,42/);
 const smallDiscount=panel(0.03);
 assert.match(smallDiscount,/33% OFF · Efectivo \/ Transferencia/);
 assert.match(smallDiscount,/Ahorrás<strong[^>]*>\$\s*0,01/);
 for(const price of [0,null,NaN]) assert.doesNotMatch(panel(price),/25% OFF|line-through|Ahorrás|\$\s*0/);
 const undiscounted=panel(0.01);
 assert.match(undiscounted,/variant-transfer-price/);
 assert.doesNotMatch(undiscounted,/OFF|line-through|Efectivo|Ahorrás/);
 const conditions=attributes=>renderToStaticMarkup(React.createElement(purchaseSummary.ProductPurchaseConditions,{attributes}));
 assert.doesNotMatch(conditions([]),/Originalidad|originales|gratis|inmediato/i);
 assert.match(conditions([attr('Originalidad','Dato confirmado de prueba')]),/Dato confirmado de prueba/);
 assert.doesNotMatch(conditions([attr('supplier','NO PUBLICAR')]),/NO PUBLICAR/);
});

test('optional offers remain absent for empty, failed and unresolved queries, preserving valid offers',async()=>{
 const empty=load('components/component-offers.tsx',{'@/services/public-component-offers':{getComponentOffers:async()=>[]},'@/components/component-buy-together':{ComponentBuyTogether:({offers})=>offers.length?React.createElement('section',null,'Conjunto válido'):null}}).ComponentOffers;
 assert.equal(renderToStaticMarkup(await empty({headId:'synthetic'})),'');
 const failed=load('components/component-offers.tsx',{'@/services/public-component-offers':{getComponentOffers:async()=>{throw Error('unavailable')}},'@/components/component-buy-together':{ComponentBuyTogether:()=>null}}).ComponentOffers;
 assert.equal(await failed({headId:'synthetic'}),null);
 const valid=load('components/component-offers.tsx',{'@/services/public-component-offers':{getComponentOffers:async()=>[{id:'synthetic'}]},'@/components/component-buy-together':{ComponentBuyTogether:({offers})=>React.createElement('section',null,offers[0].id)}}).ComponentOffers;
 assert.match(renderToStaticMarkup(await valid({headId:'synthetic'})),/synthetic/);
 const source=readFileSync(new URL('../app/producto/[slug]/page.tsx',import.meta.url),'utf8');assert.doesNotMatch(source,/Consultando conjuntos/);assert.match(source,/Suspense fallback=\{null\}/);
});
test('existing details block renders accessible fields, safe escaped text and paragraphs without empty placeholders',()=>{
 const html=renderToStaticMarkup(React.createElement(ProductInformation,{product:{...base,attributes:[attr('Marca','<script>test</script>')],description:'Párrafo uno.\n\nPárrafo dos.'}}));
 assert.match(html,/<summary[^>]*>Sobre este producto/);assert.match(html,/<dl aria-label="Características del producto"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/whitespace-pre-line/);assert.match(html,/Párrafo uno\.\n\nPárrafo dos\./);
 const empty=renderToStaticMarkup(React.createElement(ProductInformation,{product:{category:'mates'}}));assert.doesNotMatch(empty,/<dl|No disponible|null|undefined/);
 assert.doesNotMatch(html+empty,/Aboná el 100% por transferencia|Para retirar, esperá la confirmación del local/);
 assert.doesNotMatch(html,/<details[^>]*\sopen(?:=|\s|>)/);
});

const renderFamily=choices=>{
 const selected={...base,id:'grey',category:'mates',name:'SKU Gris',description:'Dato exclusivo Gris',attributes:[attr('Capacidad','1 L')],variantOptions:{Color:'Gris'},images:[]};
 const other={...selected,id:'black',name:'SKU Negro',description:'Dato exclusivo Negro',attributes:[attr('Capacidad','2 L')],variantOptions:{Color:'Negro'}};
 const Detail=load('components/product-family-detail.tsx',{...ui,'react':{...React,useState:(()=>{let call=0;return()=>[call++%2?'cash':choices,()=>{}];})()},'react/jsx-runtime':jsx,'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/lib/catalog/public-product-visibility':{publicCategoryPaths:{mates:'/mates'}},'@/lib/whatsapp':{getProductWhatsAppLink:()=>'/synthetic'},'@/lib/products/family-presentation':{getFamilyRepresentativeImage:()=>null},'@/lib/web-transfer-pricing':prices,'@/components/product-purchase-summary':purchaseSummary,'@/components/site-header':{SiteHeader:()=>null},'@/components/product-image-gallery':{ProductImageGallery:()=>null},'@/components/product-information':{ProductInformation},'@/components/add-to-cart-button':{AddToCartButton:({product})=>React.createElement('button',{'data-cart-id':product.id},'Comprar')}}).ProductFamilyDetail;
 return renderToStaticMarkup(React.createElement(Detail,{installments:null,product:{...selected,id:'family',kind:'family',variants:[selected,other],description:'NO HEREDAR DEL PRIMER SKU'}}));
};
test('family shows only chosen SKU information, never implicit representative or sibling attributes',()=>{
 const initial=renderFamily({});assert.doesNotMatch(initial,/Dato exclusivo|NO HEREDAR|Características del producto/);assert.match(initial,/<button[^>]*disabled/);
 const grey=renderFamily({Color:'Gris'});assert.match(grey,/Dato exclusivo Gris|1 L/);assert.doesNotMatch(grey,/Dato exclusivo Negro|2 L/);assert.match(grey,/data-cart-id="grey"/);
 const black=renderFamily({Color:'Negro'});assert.match(black,/Dato exclusivo Negro/);assert.doesNotMatch(black,/Dato exclusivo Gris/);assert.match(black,/data-cart-id="black"/);
});
test('product page shows whole-peso prices and retains purchase actions; same-category exploration does not assert compatibility',async()=>{
 const taxonomy=load('lib/product-taxonomy.ts',{'@/lib/catalog/attribute-config':config});
 const Page=load('app/producto/[slug]/page.tsx',{...ui,'react':React,'react/jsx-runtime':jsx,'next/link':{default:({children,prefetch,...props})=>React.createElement('a',props,children)},'next/navigation':{notFound:()=>{throw Error('not found')}},'@/lib/catalog/public-product-visibility':{publicCategoryLabels:{perfumes:'Perfumes'},publicCategoryPaths:{perfumes:'/perfumes'}},'@/lib/product-taxonomy':taxonomy,'@/lib/products/commercial-information':info,'@/lib/web-transfer-pricing':prices,'@/components/product-purchase-summary':purchaseSummary,'@/components/product-grid':{ProductCard:({product})=>React.createElement('a',{href:'/producto/'+product.slug},product.name)},'@/lib/catalog/perfume-recommendation':{isDecantProduct:()=>false},'@/services/products':{getProductBySlug:async()=>base,getRelatedProducts:async()=>[{...base,id:'other',name:'Otro perfume'},{...base,id:'wrong',category:'mates',name:'MATE INCOMPATIBLE'},base]},'@/components/site-header':{SiteHeader:()=>null},'@/components/product-family-detail':{},'@/components/product-image-gallery':{ProductImageGallery:()=>null},'@/components/product-information':{ProductInformation},'@/components/component-offers':{ComponentOffers:()=>null},'@/components/storefront-surface.module.css':{default:{canvas:'canvas',botanicalCorner:'botanicalCorner'}},'@/lib/payments/installments':{getPublicInstallments:()=>null},'./product-actions':{ProductActions:({product,installments})=>React.createElement('button',{'data-price':product.price,'data-installments':String(installments)},'Comprar')}}).default;
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:'synthetic'})}));assert.match(html,/data-price="100"/);assert.match(html,/data-installments="null"/);assert.match(html,/Más en Perfumes/);assert.match(html,/Otro perfume/);assert.doesNotMatch(html,/MATE INCOMPATIBLE|También te puede gustar|compatibles|En stock|Categoría:/);
 assert.match(html,/Envíos y retiro/);assert.match(html,/Garantía y devoluciones/);assert.match(html,/data-product-detail/);
});

test('perfume accordion illustrates only documented stages and preserves partial coverage', () => {
 const product = {
   ...base,
   name: 'Marca sintética Perfume de prueba',
   attributes: [attr('Marca', 'Marca sintética'), attr('olfactory_family', 'citrico'), attr('occasion', 'diario'), attr('intensity', 'media'), attr('Notas de fondo', 'Cedro')],
   description: 'Descripción del perfume.\n\nNotas verificadas (selección parcial)\nSalida: bergamota, limón.\nCorazón: flores blancas.\nFondo: almizcle.\n\nPresentación: 100 ml.',
 };
 const html = renderToStaticMarkup(React.createElement(ProductInformation, { product, standalone: true }));
 assert.match(html, /<h2>Perfume de prueba<\/h2>/);
 assert.match(html, /Selección parcial/);
 assert.match(html, /\/perfume-notes\/bergamota.webp/);
 assert.match(html, /\/perfume-notes\/flores-blancas.webp/);
 assert.match(html, /\/perfume-notes\/cedro.webp/);
 assert.doesNotMatch(html, /src="\/synthetic.svg"/);
 assert.match(html, /<dt>Presentación<\/dt><dd>100 ml<\/dd>/);
 assert.match(html, /<dt>Intensidad orientativa<\/dt><dd>Media<\/dd>/);
 assert.doesNotMatch(html, /Descripción del perfume\./);
 assert.doesNotMatch(html, /Notas verificadas|almizcle|Acordes principales/);
});

test('perfume accordion retains prose without inventing notes, accords or empty sections', () => {
 const product = { ...base, attributes: [], description: 'Una salida con bergamota. Un fondo parecido al cedro.' };
 const html = renderToStaticMarkup(React.createElement(ProductInformation, { product, standalone: true }));
 assert.match(html, /Una salida con bergamota\. Un fondo parecido al cedro/);
 assert.doesNotMatch(html, /Notas olfativas|Perfil olfativo|Ideal para|Acordes principales|Características del producto/);
 assert.doesNotMatch(html, /perfume-notes\//);
 const summaryOnly = renderToStaticMarkup(React.createElement(ProductInformation, { product: { ...product, description: '' }, standalone: true }));
 assert.match(summaryOnly, /Resumen de prueba/);

 const mate = renderToStaticMarkup(React.createElement(ProductInformation, { product: { ...product, category: 'mates' }, standalone: true }));
 assert.doesNotMatch(mate, /perfume-notes|synthetic.svg/);
});

test('ingredient compositions require all documented notes and are reusable across product identities', () => {
 const render = product => renderToStaticMarkup(React.createElement(ProductInformation, { product, standalone: true }));
 for (const [notes, asset] of [
   ['Caramelo, Vainilla y Leche.', 'caramelo-vainilla-leche'],
   ['Pomelo, Menta, Cedro', 'pomelo-menta-cedro'],
   ['Bergamota, Jazmín, Vainilla', 'bergamota-jazmin-vainilla'],
 ]) {
   const product = { ...base, attributes: [attr('Notas', notes)] };
   assert.match(render(product), new RegExp('/perfume-notes/' + asset + '.webp'));
   assert.match(render({ ...product, name: 'Otra identidad', slug: 'otra-identidad' }), new RegExp('/perfume-notes/' + asset + '.webp'));
 }
 const partial = render({ ...base, attributes: [attr('Notas', 'Caramelo, Vainilla')] });
 assert.doesNotMatch(partial, /caramelo-vainilla-leche|synthetic.svg|Acordes principales/);
 assert.match(partial, /\/perfume-notes\/caramelo.webp/);
 assert.match(partial, /\/perfume-notes\/vainilla.webp/);
 const proseOnly = render({ ...base, description: 'Caramelo, vainilla y leche.', attributes: [] });
 assert.doesNotMatch(proseOnly, /perfume-notes\//);
});

test('featured perfume notes prioritize documented copy and keep notes without art in the detailed view',()=>{
 const highlight=ui['@/components/product-information'].getPerfumeHighlights;
 const input={...base,slug:'synthetic',shortDescription:'Pomelo y menta con un acorde inventado.',description:'Introducción. Notas de salida: bergamota, pomelo y menta. Corazón: orris / raíz de iris. Fondo: almizcle, nota sin imagen.'};
 const notes=highlight(describe(input)).notes;
 assert.deepEqual(notes.map(n=>n.label),['pomelo','menta','bergamota','orris / raíz de iris']);
 assert.ok(notes.every(note=>note.asset));
 const html=renderToStaticMarkup(React.createElement(ProductInformation,{product:input,standalone:true}));
 assert.match(html,/nota sin imagen/);
 assert.match(html,/chip-raiz-de-iris\.webp/);
 assert.doesNotMatch(html,/acorde inventado[^<]*chip-/);
});

test('registered brand takes precedence over the documented brand fallback',()=>{
 const product={...base,slug:'club-de-nuit-intense-man'};
 assert.equal(describe(product).fields.find(f=>f.label==='Marca')?.values[0],'Armaf');
 assert.equal(describe({...product,attributes:[attr('Marca','Marca registrada')]}).fields.find(f=>f.label==='Marca')?.values[0],'Marca registrada');
});

test('researched editions supply missing stages and registered notes retain their own provenance', () => {
 const product = { ...base, slug: 'afnan-9-am-dive', attributes: [] };
 const information = describe(product);
 assert.equal(information.notesSource, 'https://nl.afnan.com/en/products/9-am');
 assert.deepEqual(information.fields.find(f => f.label === 'Notas de salida')?.values,
   ['Mandarina', 'Cidra', 'Cardamomo', 'Pimienta rosa']);

 const registered = describe({ ...product, attributes: [
   attr('Notas', 'Menta'), attr('Fuente de notas', 'https://example.com/notas'),
 ] });
 assert.equal(registered.notesSource, 'https://example.com/notas');
 assert.deepEqual(registered.fields.filter(f => f.label.startsWith('Notas')), [{ label: 'Notas', values: ['Menta'] }]);
 const unsafe = describe({ ...product, attributes: [attr('Notas', 'Menta'), attr('Fuente de notas', 'javascript:alert(1)')] });
 assert.equal(unsafe.notesSource, undefined);
});

test('Hawas Verde preserves documented notes without assigning a pyramid', () => {
 const product = { ...base, slug: 'decant-hawas-verde', attributes: [] };
 const information = describe(product);
 assert.deepEqual(information.fields.filter(f => f.label.startsWith('Notas')),
   [{ label: 'Notas', values: ['Lima', 'Romero', 'Manzana verde', 'Pachulí', 'Ámbar'] }]);
 const notes = ui['@/components/product-information'].getPerfumeHighlights(information).notes;
 assert.equal(notes.length, 4);
 assert.ok(notes.every(note => note.asset));
 const html = renderToStaticMarkup(React.createElement(ProductInformation, { product, standalone: true }));
 assert.doesNotMatch(html, /<clipPath/);
});
