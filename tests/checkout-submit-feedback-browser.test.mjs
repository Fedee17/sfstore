import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
const base=process.env.SFSTORE_TEST_CHECKOUT_URL;
const modulePath=process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE;
test('checkout shows validation and request failures beside submit, focuses feedback, preserves retry key', {skip:!base||!modulePath}, async()=>{
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
  const {chromium}=createRequire(import.meta.url)(modulePath);
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  let cases=0;
  try{
    for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
      const context=await browser.newContext({viewport});const orders=[],sessions=[];let mode='rejected';
      await context.addInitScript(()=>localStorage.setItem('sfstore-cart',JSON.stringify({state:{items:[{productId:'11111111-1111-4111-8111-111111111111',name:'Synthetic100',slug:'synthetic',category:'mates',price:100,transferPrice:75,quantity:2,stock:2}],totalItems:2,subtotal:200},version:0})));
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.origin!==new URL(base).origin)return route.abort();
        if(url.pathname==='/api/checkout/session'){
          sessions.push(true);
          return route.fulfill({status:mode==='auth'?401:200,contentType:'application/json',body:JSON.stringify(mode==='auth'?{error:'Synthetic session rejected'}:{ready:true})});
        }
        if(url.pathname==='/api/checkout'){
          orders.push(req.postDataJSON());
          if(mode==='offline')return route.abort('failed');
          return route.fulfill({status:mode==='unavailable'?503:409,contentType:'application/json',body:JSON.stringify({error:mode==='unavailable'?'Synthetic unavailable':'Synthetic paused'})});
        }
        return route.continue();
      });
      const page=await context.newPage();await page.goto(base+'/checkout');
      const submit=page.getByRole('button',{name:'Preparar pedido por transferencia',exact:true});
      const check=async text=>{
        const alert=page.locator('#checkout-feedback');await alert.filter({hasText:text}).waitFor();assert.equal(await alert.getAttribute('role'),'alert');
        await page.waitForFunction(()=>document.activeElement?.id==='checkout-feedback');
        const box=await alert.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=viewport.height,'feedback must be in viewport');
        assert.equal(await submit.getAttribute('aria-describedby'),'checkout-feedback');assert.equal(await submit.isEnabled(),true);cases++;
      };
      await submit.click();await check('Revisá los datos');assert.equal(sessions.length,0);assert.equal(orders.length,0);
      await page.getByLabel('Nombre completo').fill('Synthetic Buyer');await page.getByLabel(/^Teléfono/).fill('0000000000');
      await page.getByLabel('Email (opcional)').fill('invalid');await submit.click();await check('Revisá los datos');assert.equal(sessions.length,0);
      await page.getByLabel('Email (opcional)').fill('buyer@example.invalid');mode='auth';await submit.click();await check('Synthetic session rejected');assert.equal(orders.length,0);
      mode='rejected';await submit.click();await check('Synthetic paused');assert.equal(orders.length,1);
      await submit.click();await check('Synthetic paused');assert.equal(orders.length,2);assert.equal(orders[0].operationKey,orders[1].operationKey);assert.equal(orders[0].items[0].quantity,2);
      mode='unavailable';await submit.click();await check('Synthetic unavailable');
      mode='offline';await submit.click();await check('fetch');
      await context.close();
    }
    console.log(JSON.stringify({feedbackBrowserCases:cases,productionConnected:false}));
  }finally{await browser.close();}
});
