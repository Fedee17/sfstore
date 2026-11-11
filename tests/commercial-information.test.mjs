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
const info=load('lib/products/commercial-information.ts',{'@/lib/catalog/attribute-config':config});
const {getProductCommercialInformation:describe}=info;
const {ProductInformation}=load('components/product-information.tsx',{'react/jsx-runtime':jsx,'@/lib/products/commercial-information':info});
const purchaseSummary=load('components/product-purchase-summary.tsx',{'@/lib/web-transfer-pricing':prices});
const attr=(name,value)=>({name,value});
const base={id:'synthetic',name:'PRUEBA',slug:'synthetic',kind:'simple',category:'perfumes',price:100,stock:2,shortDescription:'Resumen de prueba',description:'Primer párrafo.\n\nSegundo párrafo.',attributes:[]};

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
 assert.deepEqual(describe({category:'mates'}),{shortDescription:'',description:'',fields:[]});
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
 const html=renderToStaticMarkup(React.createElement(purchaseSummary.ProductPricePanel,{price:129333.67}));
 assert.match(html,/line-through/);assert.ok(html.indexOf('129.334')<html.indexOf('97.001'));assert.match(html,/25% OFF · Transferencia/);
 for(const price of [0,null,NaN]) assert.doesNotMatch(renderToStaticMarkup(React.createElement(purchaseSummary.ProductPricePanel,{price})),/25% OFF|line-through|\$\s*0/);
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
 const Detail=load('components/product-family-detail.tsx',{'react':{...React,useState:()=>[choices,()=>{}]},'react/jsx-runtime':jsx,'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/lib/catalog/public-product-visibility':{publicCategoryPaths:{mates:'/mates'}},'@/lib/whatsapp':{getProductWhatsAppLink:()=>'/synthetic'},'@/lib/products/family-presentation':{getFamilyRepresentativeImage:()=>null},'@/lib/web-transfer-pricing':prices,'@/components/product-purchase-summary':purchaseSummary,'@/components/site-header':{SiteHeader:()=>null},'@/components/product-image-gallery':{ProductImageGallery:()=>null},'@/components/product-information':{ProductInformation},'@/components/add-to-cart-button':{AddToCartButton:({product})=>React.createElement('button',{'data-cart-id':product.id},'Comprar')}}).ProductFamilyDetail;
 return renderToStaticMarkup(React.createElement(Detail,{product:{...selected,id:'family',kind:'family',variants:[selected,other],description:'NO HEREDAR DEL PRIMER SKU'}}));
};
test('family shows only chosen SKU information, never implicit representative or sibling attributes',()=>{
 const initial=renderFamily({});assert.doesNotMatch(initial,/Dato exclusivo|NO HEREDAR|Características del producto/);assert.match(initial,/<button[^>]*disabled/);
 const grey=renderFamily({Color:'Gris'});assert.match(grey,/Dato exclusivo Gris|1 L/);assert.doesNotMatch(grey,/Dato exclusivo Negro|2 L/);assert.match(grey,/data-cart-id="grey"/);
 const black=renderFamily({Color:'Negro'});assert.match(black,/Dato exclusivo Negro/);assert.doesNotMatch(black,/Dato exclusivo Gris/);assert.match(black,/data-cart-id="black"/);
});
test('product page shows whole-peso prices and retains purchase actions; same-category exploration does not assert compatibility',async()=>{
 const taxonomy=load('lib/product-taxonomy.ts',{'@/lib/catalog/attribute-config':config});
 const Page=load('app/producto/[slug]/page.tsx',{'react':React,'react/jsx-runtime':jsx,'next/link':{default:({children,prefetch,...props})=>React.createElement('a',props,children)},'next/navigation':{notFound:()=>{throw Error('not found')}},'@/lib/catalog/public-product-visibility':{publicCategoryLabels:{perfumes:'Perfumes'},publicCategoryPaths:{perfumes:'/perfumes'}},'@/lib/product-taxonomy':taxonomy,'@/lib/products/commercial-information':info,'@/lib/web-transfer-pricing':prices,'@/components/product-purchase-summary':purchaseSummary,'@/app/home-product-card':{HomeProductCarousel:({products})=>React.createElement('div',null,products.map(product=>React.createElement('a',{key:product.id,href:'/producto/'+product.slug},product.name)))},'@/services/products':{getProductBySlug:async()=>base,getRelatedProducts:async()=>[{...base,id:'other',name:'Otro perfume'},{...base,id:'wrong',category:'mates',name:'MATE INCOMPATIBLE'},base]},'@/components/site-header':{SiteHeader:()=>null},'@/components/product-family-detail':{},'@/components/product-image-gallery':{ProductImageGallery:()=>null},'@/components/product-information':{ProductInformation},'@/components/component-offers':{ComponentOffers:()=>null},'./product-actions':{ProductActions:({product})=>React.createElement('button',{'data-price':product.price},'Comprar')}}).default;
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:'synthetic'})}));assert.match(html,/>\$\s75<\/p>/);assert.match(html,/>\$\s100<\/span>/);assert.match(html,/data-price="100"/);assert.match(html,/Más en Perfumes/);assert.match(html,/Otro perfume/);assert.doesNotMatch(html,/MATE INCOMPATIBLE|También te puede gustar|compatibles/);
});
