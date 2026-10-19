import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const base=process.env.SFSTORE_TEST_CHECKOUT_URL;
test('real checkout browser: guest quotation retry, destination rate selection and no unknown-total order',{skip:!base||!process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE},async()=>{
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'Synthetic browser requires loopback');
  const {chromium}=createRequire(import.meta.url)(process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,channel:process.env.SFSTORE_TEST_BROWSER_CHANNEL||undefined,args:['--no-sandbox']});
  const context=await browser.newContext();
  const product=randomUUID(),quotation=randomUUID(),quoteKey='a'.repeat(64),quotes=[],orders=[];let available=false;
  try{
    await context.addInitScript(item=>{if(!localStorage.getItem('sfstore-cart'))localStorage.setItem('sfstore-cart',JSON.stringify({state:{items:[item],totalItems:1,subtotal:100},version:0}));},{productId:product,name:'Synthetic Product',slug:'synthetic',category:'perfumes',price:100,transferPrice:75,quantity:1,stock:5});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==new URL(base).origin)return route.abort();
      const fulfill=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
      if(url.pathname==='/api/checkout/session')return fulfill({ready:true});
      if(url.pathname==='/api/checkout/shipping')return fulfill({country:'AR',status:available?'available':'quotation_required',rates:available?[{carrier:'Andreani',fee:12.5,quoteKey}]:[]});
      if(url.pathname==='/api/checkout/quotation'){quotes.push(request.postDataJSON());return fulfill({id:quotation,status:'requested',createsOrder:false});}
      if(url.pathname==='/api/checkout'){orders.push(request.postDataJSON());return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Synthetic boundary: no real order created.'})});}
      return route.continue();
    });
    const page=await context.newPage();
    const fill=async()=>{
      await page.getByLabel('Nombre completo').fill('Synthetic Buyer');await page.getByLabel('Teléfono').fill('synthetic-phone');
      await page.getByRole('button',{name:/^Envío/}).click();await page.getByLabel('Transporte preferido').selectOption('Andreani');await page.getByLabel('Provincia',{exact:true}).selectOption('Córdoba');await page.getByLabel('Localidad',{exact:true}).fill('Synthetic City');await page.getByLabel('Dirección',{exact:true}).fill('Synthetic Address');await page.getByLabel('Código postal',{exact:true}).fill('5000');
    };
    await page.goto(base+'/checkout');await fill();await page.getByRole('button',{name:'Calcular envío',exact:true}).click();await page.getByText('No hay tarifa aprobada para este destino y transporte.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Preparar pedido por transferencia',exact:true}).isDisabled(),true);assert.equal(orders.length,0);
    await page.getByRole('button',{name:'Solicitar cotización',exact:true}).click();await page.getByText('Solicitud registrada:',{exact:false}).waitFor();assert.equal(quotes.length,1);assert.equal(quotes[0].customer.email,undefined);assert.equal(quotes[0].shipping.carrier,'Andreani');
    const local=await page.evaluate(()=>sessionStorage.getItem('sfstore-shipping-quotation-operation'));assert.doesNotMatch(local,/Synthetic|Address|phone/);
    await page.reload();await fill();await page.getByRole('button',{name:'Calcular envío',exact:true}).click();await page.getByText('No hay tarifa aprobada para este destino y transporte.',{exact:false}).waitFor();await page.getByRole('button',{name:'Solicitar cotización',exact:true}).click();await page.getByText('Solicitud registrada:',{exact:false}).waitFor();assert.equal(quotes[0].operationKey,quotes[1].operationKey);
    available=true;await page.getByRole('button',{name:'Calcular envío',exact:true}).click();await page.getByLabel('Tarifa disponible').selectOption(quoteKey);await page.getByRole('button',{name:'Preparar pedido por transferencia',exact:true}).click();await page.getByText('Synthetic boundary: no real order created.').waitFor();assert.equal(orders.length,1);assert.equal(orders[0].shipping.quoteKey,quoteKey);assert.equal(orders[0].shipping.carrier,'Andreani');assert.equal(orders[0].shipping.fee,undefined);assert.equal(orders[0].total,undefined);
    assert.equal(await page.getByText('Mercado Pago',{exact:false}).count(),0);
    for(const endpoint of ['/api/mercadopago/create-preference','/api/mercadopago/webhook'])for(const method of ['GET','POST']){const response=await page.request.fetch(base+endpoint,{method,data:method==='POST'?{forged:true}:undefined});assert.equal(response.status(),410);assert.equal((await response.json()).code,'AUTOMATIC_PAYMENTS_DISABLED');}
  }finally{await context.close();await browser.close();}
});
