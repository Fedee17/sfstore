import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as attributes from '../../lib/catalog/attribute-config.ts';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const root=new URL('../../',import.meta.url);
let activeHarness=null;
const hooks={...React,useEffect:()=>{},useRef:v=>({current:v}),useState:v=>{if(!activeHarness)return [typeof v==='function'?v():v,()=>{}];const h=activeHarness;const i=h.cursor++;if(!(i in h.values))h.values[i]=typeof v==='function'?v():v;return [h.values[i],next=>{h.values[i]=typeof next==='function'?next(h.values[i]):next}];},useActionState:()=>[{status:'idle',message:''},()=>{},false]};
const mocks={
 'react':hooks,'react/jsx-runtime':jsx,
 'next/navigation':{useRouter:()=>({refresh(){}})},
 'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
 'next/image':{default:({fill,unoptimized,...props})=>React.createElement('img',props)},
 'browser-image-compression':{default:()=>{throw Error('NO_UPLOAD_IN_RENDER_FIXTURE');}},
 'heic-normalize':{},
 '@/app/admin/productos/actions':{},
 '@/components/admin/pending-submit-button':{PendingSubmitButton:({children,pendingLabel,...props})=>React.createElement('button',props,children)},
 '@/lib/catalog/attribute-config':{...attributes,getAttributeFieldsForCategory:()=>[],getCatalogAttributeValues:()=>[]},
 '@/lib/product-taxonomy':{MATE_PRODUCT_TYPES:[],PRODUCT_ATTRIBUTE_NAMES:{brand:'Marca',type:'Tipo'}},
};
function load(file){const out={};const code=ts.transpileModule(readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(n=>mocks[n]??(n.startsWith('@/')?load(n.slice(2)+'.ts'):n.startsWith('.')?load(new URL(n,new URL(file,root))):require(n)),out);return out;}
const {ProductForm}=load('components/admin/products/product-form.tsx');
export function renderGallery(connector='cc'){
 const product={id:'11111111-1111-4111-8111-111111111111',name:'PRUEBA LOCAL',slug:'synthetic',status:'draft',price:30666.67,stock:0,featured:false,category_id:'category',categories:null,product_images:[]};
 return renderToStaticMarkup(React.createElement(ProductForm,{connector,product,categories:[],action:()=>{},submitLabel:connector?'Guardar fotografías':'Guardar cambios'}));
}


// Exercise the existing component handlers without network, credentials or a save action.
export function pricingFormHarness({category='perfumes',type='Perfumes',family=false}={}){
 const h={cursor:0,values:[]};
 const product={id:'11111111-1111-4111-8111-111111111111',name:'Perfume de prueba',slug:'synthetic',status:'draft',price:21999,transfer_price:16500,cost:10000,stock:0,featured:false,category_id:'category',family_id:family?'family':null,categories:null,product_images:[],product_attributes:[{name:'Tipo',value:type}]};
 const props={product,categories:[{id:'category',name:'Categoria',slug:category}],action:()=>{throw Error('NO_REMOTE_SAVE')},submitLabel:'Guardar'};
 function render(){h.cursor=0;activeHarness=h;try{return ProductForm(props)}finally{activeHarness=null}}
 function flatten(node){return Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[]}
 function text(node){return Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'')}
 function input(name){return flatten(render()).find(n=>n.props?.name===name)}
 function button(label){return flatten(render()).find(n=>n.type==='button'&&text(n.props.children).includes(label))}
 return {input,button,change(name,value){const node=input(name);if(!node?.props.onChange)throw Error('NO_INPUT_HANDLER');node.props.onChange({target:{value}})},click(label){const node=button(label);if(!node||node.props.disabled)throw Error('UNAVAILABLE_BUTTON');node.props.onClick()},render:()=>renderToStaticMarkup(render())};
}
