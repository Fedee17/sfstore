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
function load(file,modules={}){const exports={};new Function('require','exports',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(name=>Object.hasOwn(modules,name)?modules[name]:require(name),exports);return exports;}
const config=load('lib/catalog/attribute-config.ts');
const info=load('lib/products/commercial-information.ts',{'@/lib/catalog/attribute-config':config});
const {getProductCommercialInformation:describe}=info;
const {ProductInformation}=load('components/product-information.tsx',{'react/jsx-runtime':jsx,'@/lib/products/commercial-information':info});
const attr=(name,value)=>({name,value});
const base={id:'synthetic',name:'PRUEBA',slug:'synthetic',kind:'simple',category:'perfumes',price:100,stock:2,shortDescription:'Resumen de prueba',description:'Primer párrafo.\n\nSegundo párrafo.',attributes:[]};

test('registered perfume profile reuses labels and legacy aliases without inventing notes or duration',()=>{
 const product={...base,attributes:[attr('Familia olfativa','Cítrico'),attr('olfactory_family','citrico'),attr('Intensidad','media'),attr('Ocasión','noche'),attr('occasion','valor-desconocido'),attr('Notas','bergamota'),attr('Duración','12 horas')]};
 assert.deepEqual(describe(product).fields,[{label:'Perfil olfativo',values:['Cítrico']},{label:'Intensidad orientativa',values:['Media']},{label:'Ocasiones sugeridas',values:['Noche']}]);
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
test('existing details block renders accessible fields, safe escaped text and paragraphs without empty placeholders',()=>{
 const html=renderToStaticMarkup(React.createElement(ProductInformation,{product:{...base,attributes:[attr('Marca','<script>test</script>')],description:'Párrafo uno.\n\nPárrafo dos.'}}));
 assert.match(html,/<summary[^>]*>Información del producto/);assert.match(html,/<dl aria-label="Características del producto"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/whitespace-pre-line/);assert.match(html,/Párrafo uno\.\n\nPárrafo dos\./);
 const empty=renderToStaticMarkup(React.createElement(ProductInformation,{product:{category:'mates'}}));assert.doesNotMatch(empty,/<dl|No disponible|null|undefined/);
 assert.doesNotMatch(html+empty,/Aboná el 100% por transferencia|Para retirar, esperá la confirmación del local/);
 assert.doesNotMatch(html,/<details[^>]*\sopen(?:=|\s|>)/);
});

const renderFamily=choices=>{
 const selected={...base,id:'grey',category:'mates',name:'SKU Gris',description:'Dato exclusivo Gris',attributes:[attr('Capacidad','1 L')],variantOptions:{Color:'Gris'},images:[]};
 const other={...selected,id:'black',name:'SKU Negro',description:'Dato exclusivo Negro',attributes:[attr('Capacidad','2 L')],variantOptions:{Color:'Negro'}};
 const Detail=load('components/product-family-detail.tsx',{'react':{...React,useState:()=>[choices,()=>{}]},'react/jsx-runtime':jsx,'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/lib/catalog/public-product-visibility':{publicCategoryPaths:{mates:'/mates'}},'@/lib/products/family-presentation':{getFamilyRepresentativeImage:()=>null},'@/lib/web-transfer-pricing':prices,'@/components/site-header':{SiteHeader:()=>null},'@/components/product-image-gallery':{ProductImageGallery:()=>null},'@/components/product-information':{ProductInformation},'@/components/add-to-cart-button':{AddToCartButton:({product})=>React.createElement('button',{'data-cart-id':product.id},'Comprar')}}).ProductFamilyDetail;
 return renderToStaticMarkup(React.createElement(Detail,{product:{...selected,id:'family',kind:'family',variants:[selected,other],description:'NO HEREDAR DEL PRIMER SKU'}}));
};
test('family shows only chosen SKU information, never implicit representative or sibling attributes',()=>{
 const initial=renderFamily({});assert.doesNotMatch(initial,/Dato exclusivo|NO HEREDAR|Características del producto/);assert.match(initial,/<button[^>]*disabled/);
 const grey=renderFamily({Color:'Gris'});assert.match(grey,/Dato exclusivo Gris|1 L/);assert.doesNotMatch(grey,/Dato exclusivo Negro|2 L/);assert.match(grey,/data-cart-id="grey"/);
 const black=renderFamily({Color:'Negro'});assert.match(black,/Dato exclusivo Negro/);assert.doesNotMatch(black,/Dato exclusivo Gris/);assert.match(black,/data-cart-id="black"/);
});
test('product page retains exact prices and actions; same-category exploration does not assert compatibility',async()=>{
 const taxonomy=load('lib/product-taxonomy.ts',{'@/lib/catalog/attribute-config':config});
 const Page=load('app/producto/[slug]/page.tsx',{'react':React,'react/jsx-runtime':jsx,'next/link':{default:({children,prefetch,...props})=>React.createElement('a',props,children)},'next/navigation':{notFound:()=>{throw Error('not found')}},'@/lib/catalog/public-product-visibility':{publicCategoryLabels:{perfumes:'Perfumes'},publicCategoryPaths:{perfumes:'/perfumes'}},'@/lib/product-taxonomy':taxonomy,'@/lib/products/commercial-information':info,'@/lib/web-transfer-pricing':prices,'@/lib/pricing':{formatSavingsLabel:()=>''},'@/services/products':{getProductBySlug:async()=>base,getRelatedProducts:async()=>[{...base,id:'other',name:'Otro perfume'},{...base,id:'wrong',category:'mates',name:'MATE INCOMPATIBLE'},base]},'@/components/site-header':{SiteHeader:()=>null},'@/components/product-family-detail':{},'@/components/product-image-gallery':{ProductImageGallery:()=>null},'@/components/product-information':{ProductInformation},'@/components/component-offers':{ComponentOffers:()=>null},'./product-actions':{ProductActions:({product})=>React.createElement('button',{'data-price':product.price},'Comprar')}}).default;
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:'synthetic'})}));assert.match(html,/75,00/);assert.match(html,/100,00/);assert.match(html,/data-price="100"/);assert.match(html,/Más en Perfumes/);assert.match(html,/Otro perfume/);assert.doesNotMatch(html,/MATE INCOMPATIBLE|También te puede gustar|compatibles/);
});
