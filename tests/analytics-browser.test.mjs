import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const base = process.env.SFSTORE_TEST_ANALYTICS_URL;
const modulePath = process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE;

// Run only against: node tests/fixtures/mobile-navigation-preview.mjs --analytics
test('P06 real browser: consent, private payloads, views, SKU actions, order retry and withdrawal', { skip: !base || !modulePath, timeout: 180000 }, async () => {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  const { chromium } = createRequire(import.meta.url)(modulePath);
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const fakeTag = `
    const originalPush = window.dataLayer.push.bind(window.dataLayer);
    const capture = command => {
      const args = Array.from(command);
      if(args[0] === 'event') navigator.sendBeacon('https://www.google-analytics.com/g/collect', JSON.stringify(args));
    };
    window.dataLayer.forEach(capture);
    window.dataLayer.push = function(command) { capture(command); return originalPush(command); };
  `;
  await mkdir('staging/runtime/p06-local', { recursive: true });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
      const context = await browser.newContext({ viewport });
      const google = [], events = [], orders = [], errors = [];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === 'www.googletagmanager.com') {
          google.push(url.toString());
          return route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeTag });
        }
        if (url.hostname === 'www.google-analytics.com') {
          events.push(JSON.parse(request.postData()));
          return route.fulfill({ status: 204, body: '' });
        }
        if (url.origin !== base) return route.abort(); // No real analytics, photos or remote services.
        if (url.pathname === '/api/checkout/session') return route.fulfill({ json: { ready: true } });
        if (url.pathname === '/api/checkout') {
          orders.push(request.postDataJSON());
          return route.fulfill({ json: { id: '10000000-0000-4000-8000-000000009999', orderNumber: 'SYNTHETIC', total: 70000, subtotal: 93333.34, discount: 23333.34, shippingCost: 0, state: 'pending', expiresAt: '2030-01-01T00:00:00Z' } });
        }
        return route.continue();
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      const consent = page.getByRole('region', { name: 'Preferencias de medición' });
      await page.goto(base + '/accesorios'); await consent.getByRole('button', { name: 'Rechazar medición' }).waitFor();
      await consent.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `staging/runtime/p06-local/consent-prompt-${viewport.width}.png`, fullPage: false });
      await consent.getByRole('button', { name: 'Rechazar medición' }).click();
      assert.equal(google.length, 0); assert.equal(events.length, 0);
      await page.reload(); await consent.getByRole('button', { name: /Preferencias de medición/ }).waitFor();
      assert.equal(google.length, 0);
      await consent.getByRole('button', { name: /Preferencias de medición/ }).click();
      const firstEvent = page.waitForResponse(response => response.url().includes('/g/collect'));
      await consent.getByRole('button', { name: 'Aceptar medición' }).click();
      await page.waitForFunction(() => document.querySelector('#sfstore-ga4'));
      await firstEvent;
      assert.equal(google.length, 1);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => window.dataLayer?.some(a => a[0] === 'event' && a[1] === 'view_item_list'));
      // Consent is not replaying a pre-consent impression: only now is the card visible.
      const visibleListEvents = events.filter(e => e[1] === 'view_item_list');
      assert.ok(visibleListEvents.length > 0);
      assert.ok(visibleListEvents.every(e => e[2].items.length === 1));
      await page.getByRole('link', { name: 'Consultar por WhatsApp', exact: true }).first().click();
      await page.waitForFunction(() => window.dataLayer?.some(a => a[0] === 'event' && a[1] === 'contact_click'));
      await page.goto(base + '/buscar?buscar=private-person@example.invalid');
      await page.getByRole('heading', { name: /No encontramos/ }).waitFor();
      await page.waitForFunction(() => window.dataLayer?.some(a => a[0] === 'event' && a[1] === 'catalog_search'));
      assert.doesNotMatch(JSON.stringify(events), /private-person|buscar=|search_term/);
      await page.goto(base + '/producto/termo-familiar-prueba');
      await page.getByRole('button', { name: 'Negro', exact: true }).click();
      await page.getByRole('button', { name: 'Negro', exact: true }).click();
      const add = page.getByRole('button', { name: /^Agregar .* al carrito$/ });
      await add.click(); await add.click(); assert.equal(await add.isDisabled(), true);
      await page.waitForFunction(() => window.dataLayer?.filter(a => a[0] === 'event' && a[1] === 'add_to_cart').length === 2);
      const choices = events.filter(e => e[1] === 'select_item_variant'); assert.equal(choices.length, 1);
      assert.equal(choices[0][2].items[0].item_id, '10000000-0000-4000-8000-000000000008');
      await page.goto(base + '/carrito');
      await page.getByText('Color: Negro', { exact: false }).first().waitFor();
      await page.goto(base + '/checkout?private=not-analytics');
      const submit = page.getByRole('button', { name: 'Preparar pedido por transferencia', exact: true });
      await submit.click(); assert.equal(orders.length, 0);
      await page.getByLabel('Nombre completo').fill('Comprador SINTETICO');
      await page.getByLabel(/^Teléfono/).fill('1198765432');
      await page.getByLabel('Email (opcional)').fill('synthetic@example.invalid');
      // Hold navigation locally to verify successful creation/retry without a real receipt service.
      await page.route('**/checkout/exito?*', route => route.fulfill({ contentType:'text/html', body:'<h1>Recibo sintético</h1>' }));
      await submit.click();
      await page.waitForURL('**/checkout/exito?*');
      assert.equal(orders.length, 1);
      const created = events.filter(e => e[1] === 'order_pending_transfer');
      assert.equal(created.length, 1); assert.equal(created[0][2].value, 70000);
      assert.ok(!events.some(e => e[1] === 'purchase'));
      assert.doesNotMatch(JSON.stringify(events), /SINTETICO|synthetic@example|1198765432|000000009999|operationKey|private=|not-analytics/);
      await page.goto(base + '/ayuda');
      await consent.getByRole('button', { name: /Preferencias de medición/ }).click();
      await consent.getByRole('button', { name: 'Rechazar medición' }).click();
      await page.waitForFunction(() => window['ga-disable-G-SYNTHETIC'] === true);
      const count = events.length;
      await page.goto(base + '/accesorios');
      await page.getByRole('heading', { name: 'Accesorios', exact: true }).waitFor();
      assert.equal(events.length, count);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `staging/runtime/p06-local/consent-${viewport.width}.png`, fullPage: true });
      console.log(JSON.stringify({ viewport: viewport.width, mockGoogleLoads: google.length, sanitizedEvents: events.length, syntheticOrders: orders.length, productionRequests: 0 }));
      await context.close();
    }
  } finally { await browser.close(); }
});
