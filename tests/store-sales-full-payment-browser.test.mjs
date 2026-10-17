import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url), root=resolve(import.meta.dirname,'..');

test('real physical-sale React form: split payments, list/25% repricing, complete payment and retry feedback',
 {skip:!process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sfstore-sales-ui-'));let server,browser;
  try{
    const transpile=(source,target)=>writeFileSync(join(dir,target),ts.transpileModule(readFileSync(join(root,source),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText);
    transpile('components/admin/sales/store-sale-form.tsx','form.js');transpile('components/admin/pending-submit-button.tsx','pending.js');transpile('lib/store-sales.ts','model.js');
    writeFileSync(join(dir,'action.js'),`export async function createStoreSaleAction(state,form){ window.submitted.push(Object.fromEntries(form)); window.lastItems=form.getAll('unitPrice'); window.lastMethods=form.getAll('paymentMethod'); return window.rejectSynthetic ? {status:'error',message:'Precio actualizado: revisá el total.'} : {status:'success',orderId:'synthetic',paymentStatus:'paid',message:'Venta confirmada sintética'}; }`);
    writeFileSync(join(dir,'link.js'),`import React from 'react';export default function Link({href,children,...rest}){return React.createElement('a',{href,...rest},children);}`);
    writeFileSync(join(dir,'entry.js'),`import React from 'react';import{createRoot}from'react-dom/client';import{StoreSaleForm}from'./form.js';window.submitted=[];window.rejectSynthetic=true;createRoot(document.getElementById('root')).render(React.createElement(StoreSaleForm,{products:[{id:'11111111-1111-4111-8111-111111111111',name:'SYNTHETIC PRODUCT',slug:'synthetic',sku:'TEST-100',price:100,transfer_price:1,stock:2,status:'active',categories:null}]}));`);
    const webpack=require('next/dist/compiled/webpack/webpack').webpack;
    const compiler=webpack({mode:'development',target:'web',entry:join(dir,'entry.js'),devtool:false,output:{path:join(dir,'out'),filename:'bundle.js'},resolve:{modules:[join(root,'node_modules')],alias:{'@/app/admin/ventas/actions':join(dir,'action.js'),'@/components/admin/pending-submit-button':join(dir,'pending.js'),'@/lib/store-sales':join(dir,'model.js'),'next/link':join(dir,'link.js')}},performance:{hints:false}});
    await new Promise((resolve,reject)=>compiler.run((err,stats)=>err?reject(err):stats.hasErrors()?reject(new Error(stats.toString({all:false,errors:true}))):resolve()));
    await new Promise((resolve,reject)=>compiler.close(err=>err?reject(err):resolve()));
    server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/bundle.js'?readFileSync(join(dir,'out','bundle.js')):'<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    const {chromium}=require(process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,channel:'msedge'});
    for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
      const context=await browser.newContext({viewport});await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
      const search=page.getByRole('searchbox');await search.fill('TEST-100');await page.getByRole('button',{name:/SYNTHETIC PRODUCT/}).click();
      await page.locator('input[name="quantity"]').fill('2');assert.equal(await page.locator('input[name="unitPrice"]').inputValue(),'75.00');
      const submit=page.getByRole('button',{name:'Registrar venta',exact:true});assert.equal(await submit.isDisabled(),true);
      await page.locator('input[name="paymentAmount"]').fill('150');assert.equal(await submit.isEnabled(),true);
      await page.getByRole('button',{name:'Agregar otro medio'}).click();assert.equal(await submit.isDisabled(),true);
      await page.locator('input[name="paymentAmount"]').nth(0).fill('100');await page.locator('input[name="paymentAmount"]').nth(1).fill('50');
      await page.locator('select[name="paymentMethod"]').nth(1).selectOption('transfer');assert.equal(await submit.isEnabled(),true);
      await page.locator('select[name="paymentMethod"]').nth(1).selectOption('debit');assert.equal(await page.locator('input[name="unitPrice"]').inputValue(),'100.00');assert.equal(await submit.isDisabled(),true);
      await page.locator('input[name="paymentAmount"]').nth(1).fill('100');assert.equal(await submit.isEnabled(),true);
      const key=await page.locator('input[name="idempotencyKey"]').inputValue();await submit.click();await page.getByRole('alert').filter({hasText:'Precio actualizado'}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.lastItems),['100.00']);assert.deepEqual(await page.evaluate(()=>window.lastMethods),['cash','debit']);
      assert.equal(await page.locator('input[name="idempotencyKey"]').inputValue(),key);
      await page.locator('select[name="paymentMethod"]').nth(1).selectOption('transfer');await page.locator('input[name="paymentAmount"]').nth(1).fill('50');
      await page.evaluate(()=>{window.rejectSynthetic=false});await submit.click();try{await page.getByRole('status').filter({hasText:'Venta confirmada sintética'}).waitFor({timeout:3000});}catch{throw new Error(JSON.stringify(await page.evaluate(()=>({submits:window.submitted.length,reject:window.rejectSynthetic,feedback:document.querySelector('[role=alert],[role=status]')?.textContent,invalid:[...document.querySelectorAll('input:invalid')].map(x=>({name:x.name,reason:x.validationMessage})),errors:[]}))));}
      assert.equal(await submit.isDisabled(),true);assert.equal(await page.evaluate(()=>window.submitted.length),2);assert.deepEqual(errors,[]);
      await context.close();
    }
  } finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));assert.ok(dir.startsWith(join(tmpdir(),'sfstore-sales-ui-')));rmSync(dir,{recursive:true,force:true});}
});
