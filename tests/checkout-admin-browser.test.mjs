import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');

test('checkout admin: disclosures, complete-payment guard, retry key, rejection consent and mobile layout',{skip:!process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sfstore-checkout-admin-'));let server,browser;
  try{
    const files={card:'components/admin/checkout/order-card.tsx',forms:'components/admin/checkout-manual-forms.tsx',presentation:'lib/admin/checkout-presentation.ts'};
    for(const [name,file] of Object.entries(files))writeFileSync(join(dir,name+'.js'),ts.transpileModule(readFileSync(join(root,file),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
    const css=readFileSync(join(root,'components/admin/checkout/checkout-admin.module.css'),'utf8');
    const names=[...new Set([...css.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)].map(m=>m[1]))];
    writeFileSync(join(dir,'styles.js'),'export default '+JSON.stringify(Object.fromEntries(names.map(name=>[name,name]))));
    writeFileSync(join(dir,'link.js'),`import React from 'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children);}`);
    writeFileSync(join(dir,'actions.js'),`export async function confirmPayment(_,form){window.calls.push({type:'credit',...Object.fromEntries(form)});return Number(form.get('amount'))===100?{ok:true,message:'Pago sintético acreditado'}:{ok:false,message:'No coincide el importe sintético'};}
      export async function rejectPayment(_,form){window.calls.push({type:'reject',...Object.fromEntries(form)});return{ok:true,message:'Rechazo sintético registrado'};}
      export const releaseExpired=async()=>({ok:true,message:'Sin operaciones reales'}),setBuyerException=releaseExpired,approveShipping=releaseExpired;`);
    writeFileSync(join(dir,'entry.js'),`import React from 'react';import{createRoot}from'react-dom/client';import{CheckoutOrderCard}from'./card.js';window.calls=[];
      createRoot(document.getElementById('root')).render(React.createElement(CheckoutOrderCard,{order:{order_id:'11111111-1111-4111-8111-111111111111',operation_key:'22222222-2222-4222-8222-222222222222',buyer_id:'33333333-3333-4333-8333-333333333333',state:'pending',payment_status:'pending',expires_at:'2026-11-08T18:00:00Z',customer:{name:'Comprador sintético',phone:null},items:[{product_name:'Producto sintético',quantity:1}],result:{orderNumber:'SF-SYNTHETIC',total:100,paymentMethod:'transfer'},report:{status:'pending',reported_at:'2026-11-08T12:00:00Z',overdue:false},history:[]}}));`);
    const webpack=require('next/dist/compiled/webpack/webpack').webpack;
    const compiler=webpack({mode:'development',target:'web',entry:join(dir,'entry.js'),devtool:false,output:{path:join(dir,'out'),filename:'bundle.js'},resolve:{modules:[join(root,'node_modules')],alias:{'@/components/admin/checkout-manual-forms':join(dir,'forms.js'),'@/app/admin/checkout/actions':join(dir,'actions.js'),'@/lib/admin/checkout-presentation':join(dir,'presentation.js'),'./checkout-admin.module.css':join(dir,'styles.js'),'./checkout/checkout-admin.module.css':join(dir,'styles.js'),'next/link':join(dir,'link.js')}},performance:{hints:false}});
    await new Promise((resolve,reject)=>compiler.run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
    await new Promise((resolve,reject)=>compiler.close(error=>error?reject(error):resolve()));
    server=createServer((request,response)=>{response.setHeader('Content-Type',request.url==='/bundle.js'?'text/javascript':request.url==='/styles.css'?'text/css':'text/html; charset=utf-8');response.end(request.url==='/bundle.js'?readFileSync(join(dir,'out/bundle.js')):request.url==='/styles.css'?css:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root" style="max-width:900px;margin:16px auto;font-family:Arial"></div><script src="/bundle.js"></script>');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    const {chromium}=require(process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE);browser=await chromium.launch({channel:process.env.SFSTORE_TEST_BROWSER_CHANNEL||'chrome',headless:true});
    for(const width of [390,648,1366]){
      const context=await browser.newContext({viewport:{width,height:844}});await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
      assert.equal(await page.getByLabel('Importe recibido completo').isVisible(),false);
      await page.getByText('Revisar y acreditar pago',{exact:true}).click();
      await page.getByLabel('Importe recibido completo').fill('99');await page.getByLabel('Referencia del cobro').fill('SYNTHETIC');
      await page.getByRole('button',{name:'Acreditar pago manual'}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);
      await page.getByRole('checkbox',{name:/Verifiqué la acreditación/}).check();await page.getByRole('button',{name:'Acreditar pago manual'}).click();
      await page.getByRole('alert').filter({hasText:'No coincide'}).waitFor();
      assert.equal(await page.getByLabel('Referencia del cobro').inputValue(),'SYNTHETIC','A rejected submission must preserve the reference');
      assert.equal(await page.getByRole('checkbox',{name:/Verifiqué la acreditación/}).isChecked(),false,'A retry requires a fresh bank-verification confirmation');
      await page.getByRole('checkbox',{name:/Verifiqué la acreditación/}).check();
      await page.getByLabel('Importe recibido completo').fill('100');await page.getByRole('button',{name:'Acreditar pago manual'}).click();
      await page.getByRole('status').filter({hasText:'Pago sintético acreditado'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Pago registrado'}).isDisabled(),true);
      const submitted=await page.evaluate(()=>window.calls);assert.equal(submitted.length,2);assert.equal(submitted[0].operationKey,submitted[1].operationKey);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
      await page.reload();await page.getByText('El pago no se acreditó: rechazar aviso',{exact:true}).click();await page.getByLabel('Motivo del rechazo').fill('Revisión sintética sin acreditación');
      await page.getByRole('button',{name:'Rechazar aviso y liberar reserva'}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);
      await page.getByRole('checkbox',{name:/Verifiqué que no existe/}).check();await page.getByRole('button',{name:'Rechazar aviso y liberar reserva'}).click();await page.getByRole('status').filter({hasText:'Rechazo sintético'}).waitFor();
      assert.equal(await page.evaluate(()=>window.calls[0].type),'reject');await context.close();
    }
  }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));assert.ok(dir.startsWith(join(tmpdir(),'sfstore-checkout-admin-')));rmSync(dir,{recursive:true,force:true});}
});
