import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const root=new URL('../../',import.meta.url);
const hooks={...React,useEffect:()=>{},useRef:v=>({current:v}),useState:v=>[typeof v==='function'?v():v,()=>{}],useActionState:()=>[{status:'idle',message:''},()=>{},false]};
const mocks={
 'react':hooks,'react/jsx-runtime':jsx,
 'next/navigation':{useRouter:()=>({refresh(){}})},
 'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
 'next/image':{default:({fill,unoptimized,...props})=>React.createElement('img',props)},
 'browser-image-compression':{default:()=>{throw Error('NO_UPLOAD_IN_RENDER_FIXTURE');}},
 'heic-normalize':{},
 '@/app/admin/productos/actions':{},
 '@/components/admin/pending-submit-button':{PendingSubmitButton:({children,pendingLabel,...props})=>React.createElement('button',props,children)},
 '@/lib/catalog/attribute-config':{getAttributeFieldsForCategory:()=>[],getCatalogAttributeValues:()=>[]},
 '@/lib/product-taxonomy':{MATE_PRODUCT_TYPES:[],PRODUCT_ATTRIBUTE_NAMES:{}},
};
function load(file){const out={};const code=ts.transpileModule(readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(n=>mocks[n]??(n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n)),out);return out;}
const {ProductForm}=load('components/admin/products/product-form.tsx');
export function renderGallery(connector='cc'){
 const product={id:'11111111-1111-4111-8111-111111111111',name:'PRUEBA LOCAL',slug:'synthetic',status:'draft',price:30666.67,stock:0,featured:false,category_id:'category',categories:null,product_images:[]};
 return renderToStaticMarkup(React.createElement(ProductForm,{connector,product,categories:[],action:()=>{},submitLabel:connector?'Guardar fotografías':'Guardar cambios'}));
}
