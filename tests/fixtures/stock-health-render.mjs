import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {stockPreviewData} from './stock-health-data.mjs';
import * as model from '../../lib/admin/stock-health.ts';

const require=createRequire(import.meta.url);
const css=readFileSync(new URL('../../components/admin/sales/sales-dashboard.module.css',import.meta.url),'utf8');
export function renderStockPreview(health=stockPreviewData()) {
  const source=readFileSync(new URL('../../components/admin/sales/stock-health.tsx',import.meta.url),'utf8');
  const styles=new Proxy({},{get:(_,key)=>String(key)});
  const exports={};
  const modules={
    'react/jsx-runtime':require('react/jsx-runtime'),
    'next/link':{default:({href,children,...props})=>React.createElement('a',{href,...props},children)},
    '@/components/admin/commercial-history-ui':{displayCents:cents=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(cents/100)},
    '@/lib/admin/stock-health':model,
    './sales-dashboard.module.css':{default:styles},
  };
  new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(!Object.hasOwn(modules,name))throw Error(`Unexpected module ${name}`);return modules[name];},exports);
  return `<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Salud de Stock · prueba local</title><style>body{margin:0;background:#F7F4ED;font-family:Arial,sans-serif;color:#1F1F1F}main{max-width:1100px;margin:auto;padding:20px;box-sizing:border-box}*{box-sizing:border-box}h1{font-size:28px}a{color:inherit}${css}</style><main><h1>Ventas · muestra sintética</h1>${renderToStaticMarkup(React.createElement(exports.StockHealthDashboard,{health}))}</main></html>`;
}
