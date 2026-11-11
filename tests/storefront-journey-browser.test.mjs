import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {join} from 'node:path';

const base=process.env.SFSTORE_TEST_CHECKOUT_URL;
const runtime=process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE;
test('synthetic storefront: responsive Home, missing photos, exact SKU gallery, cart and checkout', {skip:!base||!runtime}, async()=>{
  const origin=new URL(base).origin;
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname));
  const {chromium}=createRequire(import.meta.url)(runtime);
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  const evidence=[];
  try {
    for(const viewport of [{width:320,height:844},{width:390,height:844},{width:768,height:1024},{width:1366,height:517},{width:1366,height:768}]){
      const context=await browser.newContext({viewport,reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[],writes=[];
      page.on('pageerror',error=>errors.push(error.message));
      await context.route('**/*',route=>{
        const request=route.request(),url=new URL(request.url());
        if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
        if(url.origin===origin||url.protocol==='data:')return route.continue();
        if(url.hostname==='xspvoicelbxlmtqoiolc.supabase.co'&&url.pathname.startsWith('/storage/v1/object/public/product-images/'))return route.continue();
        return route.abort();
      });
      const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${viewport.width}`);
      await page.goto(origin);
      const ritual=page.locator('#ritual-matero');await ritual.scrollIntoViewIfNeeded();
      assert.equal(await ritual.locator('[data-product-slug="journey-mate-4"]').count(),0);
      await page.waitForFunction(()=>!document.querySelector('#ritual-matero [data-product-slug="journey-mate-5"]'));
      assert.equal(await ritual.getByText('Imagen no disponible',{exact:true}).count(),0);
      assert.ok(await ritual.getByRole('button',{name:/Agregar .* al carrito/}).count()>0);
      assert.equal(await page.locator('a[href="/mates?categoria=bombillas"]').filter({hasText:'Ver complementos materos'}).count(),1);
      await noOverflow();
      if(process.env.SFSTORE_TEST_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.SFSTORE_TEST_SCREENSHOT_DIR,`journey-home-${viewport.width}x${viewport.height}.png`)});
      await page.goto(origin+'/mates');
      const family=page.locator('[data-product-slug="familia-p03-prueba"]');
      await family.getByRole('link',{name:'Elegir opción',exact:true}).click();
      await page.waitForLoadState('networkidle');
      await page.getByRole('button',{name:'Negro',exact:true}).click();
      await page.waitForFunction(()=>[...document.querySelectorAll('button[aria-pressed="true"]')].some(button=>button.textContent.includes('Negro')));
      const mainPhoto=page.locator('main > section img').first();
      const first=await mainPhoto.getAttribute('src');
      await page.getByRole('button',{name:/Ver imagen 2 de/}).click();
      assert.notEqual(await mainPhoto.getAttribute('src'),first);
      assert.match(decodeURIComponent(await page.locator('main > section').getByRole('link',{name:'Consultar por WhatsApp',exact:true}).getAttribute('href')),/Color: Negro.*SKU: PRUEBA-0/s);
      await page.getByRole('button',{name:'Verde · Agotado',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:/Agregar .* al carrito/}).isDisabled(),true);
      assert.match(decodeURIComponent(await page.getByRole('link',{name:'Consultar disponibilidad por WhatsApp',exact:true}).getAttribute('href')),/Color: Verde.*SKU: PRUEBA-4/s);
      await page.getByRole('button',{name:'Negro',exact:true}).click();
      assert.equal(await mainPhoto.getAttribute('src'),first);
      await page.getByRole('button',{name:/Agregar .* al carrito/}).click();
      await noOverflow();
      if(process.env.SFSTORE_TEST_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.SFSTORE_TEST_SCREENSHOT_DIR,`journey-family-${viewport.width}x${viewport.height}.png`)});
      await page.goto(origin+'/carrito');
      await page.getByText('Precios redondeados hacia arriba.',{exact:false}).waitFor();await noOverflow();
      await page.getByRole('link',{name:'Continuar con transferencia',exact:true}).click();
      await page.getByRole('button',{name:'Preparar pedido por transferencia',exact:true}).click();
      await page.waitForFunction(()=>document.activeElement?.id==='checkout-fullName');
      assert.equal(await page.locator('#checkout-fullName').getAttribute('aria-describedby'),'error-fullName');
      await noOverflow();
      if(process.env.SFSTORE_TEST_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.SFSTORE_TEST_SCREENSHOT_DIR,`journey-checkout-${viewport.width}x${viewport.height}.png`)});
      assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
      evidence.push({viewport,overflow:false,variantGallery:true,stockBlocked:true,cartPreserved:true,writes:0});
      await context.close();
    }
    for(const viewport of [{width:390,height:844},{width:1366,height:768}]){
      const context=await browser.newContext({viewport});
      const page=await context.newPage();
      await page.goto(origin);
      const carousel=page.locator('#productos [data-rotating-layout]');
      await carousel.waitFor();await carousel.scrollIntoViewIfNeeded();
      const selector='#productos [style*="--featured-index"]';
      const before=await page.locator(selector).getAttribute('style');
      await page.waitForFunction(({selector,before})=>document.querySelector(selector)?.getAttribute('style')!==before,{selector,before},{timeout:12000});
      if(viewport.width>=1024)assert.equal(await carousel.getByRole('button',{name:'Producto siguiente',exact:true}).count(),1);
      else assert.equal(await carousel.getByRole('button',{name:'Producto siguiente',exact:true}).count(),0);
      if(process.env.SFSTORE_TEST_SCREENSHOT_DIR)await page.screenshot({path:join(process.env.SFSTORE_TEST_SCREENSHOT_DIR,`journey-carousel-${viewport.width}.png`),animations:'disabled'});
      evidence.push({viewport,automaticRotation:true});await context.close();
    }
    console.log(JSON.stringify({storefrontJourney:evidence,productionConnected:false}));
  }finally{await browser.close();}
});
