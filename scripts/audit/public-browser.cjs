/* SFSTORE public, non-destructive browser audit. No customer data or purchases. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const BASE = 'https://sfstore-ten.vercel.app';
const OUT = process.env.AUDIT_OUTPUT || 'audit-output/browser';
fs.mkdirSync(OUT, {recursive:true});
const result = { date: new Date().toISOString(), url: BASE, scope: 'public-read-only', checks: [], findings: [], screenshots: [], blockedMutations: 0 };
const note = (name, status, evidence, severity='medium') => {
  result.checks.push({name,status,evidence});
  if(status==='FAIL') result.findings.push({name,severity,evidence});
};
const money = text => {
  const match = String(text).match(/\$\s*([\d.,]+)/);
  if(!match) return null;
  const raw=match[1].replace(/\./g,'').replace(',','.');
  const n=Number(raw);
  return Number.isFinite(n)?n:null;
};
const within = (actual,expected) => actual!==null && expected!==null && Math.abs(actual-expected)<=1.01;
const rowPrice = async (scope,label) => {
  const row=scope.getByText(label,{exact:true}).first().locator('..');
  return money(await row.innerText({timeout:7000}));
};
const safeError = e => String(e?.message||e).slice(0,350);
async function newSafePage(browser,width,height) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,locale:'es-AR',serviceWorkers:'block'});
  const page=await context.newPage();
  // Explicitly prevent all state-changing HTTP requests, including purchase/order APIs.
  await page.route('**/*',route=>{
    const method=route.request().method();
    if(!['GET','HEAD','OPTIONS'].includes(method)){result.blockedMutations++;return route.abort('blockedbyclient');}
    return route.continue();
  });
  page.on('pageerror',e=>result.checks.push({name:'javascript-error',status:'WARN',evidence:safeError(e)}));
  return {page,context};
}
async function goto(page,route) {
  const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:45000});
  if(!response || response.status()>=400) throw Error(route+' HTTP '+(response?.status()??'sin respuesta'));
  await page.locator('body').waitFor({state:'visible',timeout:12000});
  return response.status();
}
async function screenshot(page,name){
  const file=path.join(OUT,name+'.png');
  await page.screenshot({path:file,fullPage:false,animations:'disabled'});
  result.screenshots.push(file);
}
(async ()=>{
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const sizes=[{width:390,height:844},{width:768,height:1024},{width:1366,height:900}];
    for(const size of sizes){
      const {page,context}=await newSafePage(browser,size.width,size.height);
      try{
        const status=await goto(page,'/');
        await page.locator('article[data-product-slug]').first().waitFor({timeout:15000});
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth+2);
        note('home '+size.width+'px',overflow?'FAIL':'PASS', 'HTTP '+status+'; ancho documento='+await page.evaluate(()=>document.documentElement.scrollWidth)+'; viewport='+size.width,overflow?'high':'low');
        await screenshot(page,'home-'+size.width);
        const title=await page.title(),description=await page.locator('meta[name="description"]').getAttribute('content');
        note('SEO home '+size.width+'px',title&&description?'PASS':'FAIL','title='+JSON.stringify(title)+'; description='+JSON.stringify(description),'medium');
        if(size.width===390){
          const cards=await page.locator('article[data-product-slug]').evaluateAll(nodes=>nodes.slice(0,12).map(node=>({slug:node.getAttribute('data-product-slug'),name:node.querySelector('h3')?.textContent?.trim()||'',text:node.innerText?.slice(0,400)||''})));
          let audited=false;
          const rejected=[];
          for(const item of cards){
            if(!item.slug || /Agotado|consultar precio/i.test(item.text)){rejected.push({slug:item.slug,reason:'unavailable-card'});continue;}
            await goto(page,'/producto/'+encodeURIComponent(item.slug));
            const heading=await page.locator('h1').first().innerText();
            const selectors=page.locator('fieldset');
            for(let d=0;d<await selectors.count();d++){
              const fieldset=selectors.nth(d);
              const option=fieldset.getByRole('button').filter({hasNotText:/Agotado|No disponible/i}).first();
              if(await option.count()) await option.click();
            }
            const action=page.getByRole('button',{name:/^Agregar .* al carrito$/}).first();
            if(!await action.isVisible().catch(()=>false) || await action.isDisabled()){rejected.push({slug:item.slug,reason:'no-enabled-buy-button',title:heading,buttonPresent:await action.count(),disabled:await action.count()?await action.isDisabled():null,disabledAttribute:await action.count()?await action.getAttribute('disabled'):null,stockText:(await page.locator('main').innerText()).match(/(?:Stock disponible|Disponible:|Sin stock)[^\n]*/ig)?.slice(0,3),buttons:await page.getByRole('button').allTextContents(),url:page.url()});continue;}
            const family=await page.locator('[data-testid="variant-list-price"]').count()>0;
            const detail=family?'':await page.locator('main article').first().innerText();
            const listMatch=detail.match(/Precio lista\s*\n\s*(\$\s*[\d.,]+)/i);
            const transferMatch=detail.match(/Precio por transferencia\s*\n\s*(\$\s*[\d.,]+)/i);
            const list=family?money(await page.locator('[data-testid="variant-list-price"]').innerText()):money(listMatch?.[1]);
            const transfer=family?money(await page.locator('[data-testid="variant-transfer-price"]').innerText()):money(transferMatch?.[1]);
            note('precio ficha '+item.slug,within(transfer,list*0.75)?'PASS':'FAIL',JSON.stringify({product:heading,list,transfer,expected:list===null?null:list*.75}), 'high');
            await screenshot(page,'product-mobile');
            await action.click({timeout:10000});
            await goto(page,'/carrito');
            await page.getByRole('heading',{name:'Resumen de compra'}).waitFor({timeout:12000});
            const summary=page.locator('aside').first();
            const subtotal=await rowPrice(summary,'Subtotal de lista');
            const total=await rowPrice(summary,'Productos por transferencia');
            const expected=subtotal===null?null:subtotal*.75;
            note('carrito 25% '+item.slug,within(total,expected)&&within(subtotal,list)?'PASS':'FAIL',JSON.stringify({product:heading,subtotal,total,expected}), 'critical');
            await screenshot(page,'cart-mobile');
            const continueLink=page.getByRole('link',{name:'Continuar con transferencia'});
            if(!await continueLink.isVisible()) throw Error('No se encontró CTA de checkout');
            await continueLink.click();
            await page.getByRole('heading',{name:'Prepará tu pedido'}).waitFor({timeout:12000});
            const checkout=page.locator('aside').first();
            const checkoutPrice=await rowPrice(checkout,'Productos por transferencia (25% OFF)');
            note('checkout sin confirmar '+item.slug,within(checkoutPrice,total)?'PASS':'FAIL',JSON.stringify({product:heading,cartTotal:total,checkoutProducts:checkoutPrice}), 'critical');
            await screenshot(page,'checkout-mobile');
            // STOP before any form submit: never prepare an order, quote delivery or pay.
            audited=true;
            break;
          }
          if(!audited) note('flujo comercial','NO VERIFICADO',JSON.stringify({reason:'No se encontró producto destacado con compra disponible; no se fabricó una operación.',candidates:cards.map(x=>({slug:x.slug,name:x.name})),rejected}));
        }
      }catch(e){note('navegación '+size.width+'px','FAIL',safeError(e),'high');}
      finally{await context.close();}
    }
  }catch(e){note('navegador','FAIL',safeError(e),'high');}
  finally{
    if(browser)await browser.close();
    const dest=path.join(OUT,'results.json');
    fs.writeFileSync(dest,JSON.stringify(result,null,2));
    console.log(JSON.stringify({results:dest,checks:result.checks.length,findings:result.findings.length,screenshots:result.screenshots.length,blockedMutations:result.blockedMutations}));
    if(result.findings.length || result.checks.some(x=>x.status==='NO VERIFICADO')) process.exitCode=1;
  }
})();
