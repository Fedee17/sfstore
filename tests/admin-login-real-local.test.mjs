import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Explicit opt-in. Local synthetic Auth users only; no orders, imports or inventory writes.
test('admin login with real local Supabase, official Turnstile test widget and protected routes', {
  skip: process.env.SFSTORE_REAL_LOCAL_ADMIN_LOGIN !== 'true', timeout: 180000,
}, async t => {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const base=process.env.SFSTORE_ADMIN_LOGIN_BASE;
  assert.equal(url,'http://127.0.0.1:54331');
  assert.equal(base,'http://127.0.0.1:3109');
  const email=process.env.SFSTORE_TEST_ADMIN_EMAIL,password=process.env.SFSTORE_TEST_ADMIN_PASSWORD;
  assert.ok(email.endsWith('@staging.invalid'));
  const {chromium}=createRequire(import.meta.url)(process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE);
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  const users=[];
  const newPage=async()=>{const context=await browser.newContext();return {context,page:await context.newPage()};};
  const fill=async(page,loginEmail=email,loginPassword=password)=>{
    await page.goto(base+'/admin/login');await page.locator('[name=email]').fill(loginEmail);await page.locator('[name=password]').fill(loginPassword);
    await page.waitForFunction(()=>document.querySelector('[name=captchaToken]')?.value?.length>0,{},{timeout:40000});
  };
  try {
    await t.test('anonymous page access is denied',async()=>{const {context,page}=await newPage();await page.goto(base+'/admin/productos/importar');await page.waitForURL(/\/admin\/login/);await context.close();});
    await t.test('invalid credentials fail, CAPTCHA renews and a valid retry authenticates',async()=>{
      const {context,page}=await newPage();await fill(page,email,'synthetic-invalid-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();
      await page.getByText('Email o contraseña incorrectos.',{exact:true}).waitFor();
      await page.waitForFunction(()=>document.querySelector('[name=captchaToken]')?.value?.length>0);
      await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/admin');
      await page.goto(base+'/admin/productos/importar');await page.getByRole('heading',{name:'Importar productos',exact:true}).waitFor();await context.close();
    });
    await t.test('valid credentials from a non-allowlisted buyer never authorize admin',async()=>{
      const buyerEmail='buyer-admin-captcha-'+randomUUID()+'@staging.invalid',buyerPassword=randomBytes(24).toString('hex');
      const created=await admin.auth.admin.createUser({email:buyerEmail,password:buyerPassword,email_confirm:true});assert.equal(created.error,null);users.push(created.data.user.id);
      const {context,page}=await newPage();await fill(page,buyerEmail,buyerPassword);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByText('El email autenticado no está incluido en ADMIN_ALLOWED_EMAILS.',{exact:true}).waitFor();
      await page.goto(base+'/admin/productos/importar');await page.waitForURL(/\/admin\/login/);await context.close();
    });
    await t.test('a real anonymous Auth session is denied, regardless of a valid CAPTCHA',async()=>{
      const cookies=[];const auth=createServerClient(url,anon,{cookies:{getAll:()=>cookies,setAll:items=>cookies.push(...items)}});
      const signed=await auth.auth.signInAnonymously({options:{captchaToken:'10000000-aaaa-bbbb-cccc-000000000001'}});assert.equal(signed.error,null);assert.equal(signed.data.user.is_anonymous,true);users.push(signed.data.user.id);
      const {context,page}=await newPage();await context.addCookies(cookies.map(x=>({name:x.name,value:x.value,url:base})));await page.goto(base+'/admin/productos/importar');await page.waitForURL(/\/admin\/login/);await context.close();
    });
    await t.test('synthetic widget callbacks clear expired/error tokens and direct missing-token submit fails on server',async()=>{
      const {context,page}=await newPage();
      await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>route.fulfill({contentType:'application/javascript',body:`window.turnstile={render:(element,options)=>{window.syntheticCaptchaOptions=options;window.syntheticCaptchaResets=0;return 'synthetic-widget';},reset:()=>{window.syntheticCaptchaResets++;},remove:()=>{}};`}));
      await page.goto(base+'/admin/login');await page.waitForFunction(()=>!!window.syntheticCaptchaOptions);
      const submit=page.getByRole('button',{name:'Entrar',exact:true});assert.equal(await submit.isDisabled(),true);
      await page.evaluate(()=>window.syntheticCaptchaOptions.callback('synthetic-widget-token'));await page.waitForFunction(()=>document.querySelector('[name=captchaToken]').value==='synthetic-widget-token');assert.equal(await submit.isEnabled(),true);
      await page.evaluate(()=>window.syntheticCaptchaOptions['expired-callback']());await page.getByText('La verificación venció. Renovala para ingresar.',{exact:true}).waitFor();assert.equal(await page.locator('[name=captchaToken]').inputValue(),'');assert.equal(await submit.isDisabled(),true);
      await page.getByRole('button',{name:'Renovar verificación',exact:true}).click();assert.equal(await page.evaluate(()=>window.syntheticCaptchaResets),1);
      await page.evaluate(()=>window.syntheticCaptchaOptions.callback('synthetic-widget-token'));await page.evaluate(()=>window.syntheticCaptchaOptions['error-callback']());await page.getByText('La verificación falló. Reintentá antes de ingresar.',{exact:true}).waitFor();assert.equal(await page.locator('[name=captchaToken]').inputValue(),'');
      await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);await submit.evaluate(button=>{button.disabled=false;button.removeAttribute('aria-disabled');});await submit.click();await page.getByText('Completá la verificación de seguridad antes de ingresar.',{exact:true}).waitFor();
      await page.goto(base+'/admin/productos/importar');await page.waitForURL(/\/admin\/login/);await context.close();
    });
    await t.test('real local Auth requires CAPTCHA but the always-pass test secret cannot certify invalid or expired rejection',async()=>{
      const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
      const absent=await auth.auth.signInWithPassword({email,password});assert.equal(absent.error?.code,'captcha_failed');
      const synthetic=await auth.auth.signInWithPassword({email,password,options:{captchaToken:'synthetic-invalid-expired-token'}});assert.equal(synthetic.error,null);await auth.auth.signOut();
      // Intentional evidence of official test-secret behavior, never a production bypass.
    });
  } finally {
    await browser.close();for(const id of users){const result=await admin.auth.admin.deleteUser(id);assert.equal(result.error,null);}
  }
});
