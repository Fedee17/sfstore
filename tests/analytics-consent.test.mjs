import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createAnalytics, analyticsItem, safeEvent, publicRoute } from '../lib/analytics/client.ts';

const id = '10000000-0000-4000-8000-000000000001';
const product = { id, category: 'accesorios', price: 30666.67, quantity: 2 };
function harness(saved = null, enabled = true) {
  const commands = []; let loads = 0, stops = 0;
  const engine = createAnalytics({ enabled, origin: 'https://sfstore.example', readConsent: () => saved, saveConsent: v => { saved = v; },
    load: () => { loads++; return (...args) => commands.push(args); }, stop: () => { stops++; } });
  engine.initialize(); engine.route('/accesorios', '/accesorios');
  return { engine, commands, events: () => commands.filter(c => c[0] === 'event'), loads: () => loads, stops: () => stops };
}
test('unknown and rejected consent cause no loader, requests, buffered actions or identifiers', () => {
  for (const saved of [null, 'rejected', 'tampered']) {
    const h = harness(saved); h.engine.emit('add_to_cart', { items: [analyticsItem(product)] });
    assert.equal(h.loads(), 0); assert.equal(h.commands.length, 0);
    h.engine.choose('accepted'); assert.deepEqual(h.events().map(c => c[1]), ['page_view']);
  }
});
test('missing configuration fails closed even with previously accepted consent', () => {
  const h = harness('accepted', false); h.engine.emit('begin_checkout', { items: [analyticsItem(product)] });
  assert.equal(h.loads(), 0); assert.equal(h.engine.active(), false);
});
test('consented visits deduplicate strict-mode effects and filters never inflate page visits', () => {
  const h = harness('accepted'); h.engine.route('/accesorios', '/accesorios');
  h.engine.initialize(); h.engine.route('/accesorios', '/accesorios');
  h.engine.route('/accesorios', '/accesorios?private=not-sent');
  assert.equal(h.events().length, 1);
  h.engine.route('/buscar', '/buscar?buscar=private@example.com');
  h.engine.emit('catalog_search', { result_count: 0, search_term: 'private@example.com' }, 'results');
  h.engine.emit('catalog_search', { result_count: 0 }, 'results');
  assert.deepEqual(h.events().map(c => c[1]), ['page_view', 'page_view', 'catalog_search']);
  assert.doesNotMatch(JSON.stringify(h.commands), /private|buscar=|search_term/);
});
test('private routes and unknown paths disable collection; sanitized product and receipt URLs have no IDs or query', () => {
  const h = harness('accepted'); h.engine.route('/admin/pedidos/private', '/admin/pedidos/private');
  assert.equal(h.engine.emit('contact_click', { surface: 'help' }), false);
  const before = h.events().length;
  h.engine.route('/api/private', '/api/private'); assert.equal(h.events().length, before);
  h.engine.route('/producto/private@example.com', '/producto/private@example.com?x=secret');
  assert.equal(h.events().at(-1)[2].page_location, 'https://sfstore.example/producto/[slug]');
  h.engine.route('/checkout/exito', '/checkout/exito?order=secret');
  assert.equal(h.events().at(-1)[2].page_location, 'https://sfstore.example/checkout/exito');
  assert.doesNotMatch(JSON.stringify(h.commands), /secret|example.com|pedidos/);
});
test('revoking consent stops subsequent actions and reacceptance never replays actions', () => {
  const h = harness('accepted'); h.engine.choose('rejected'); const count = h.events().length;
  h.engine.emit('add_to_cart', { items: [analyticsItem(product)] });
  h.engine.route('/carrito', '/carrito'); assert.equal(h.events().length, count); assert.ok(h.stops() > 0);
  h.engine.choose('accepted'); assert.equal(h.events().at(-1)[1], 'page_view');
  assert.ok(!h.events().some(c => c[1] === 'add_to_cart'));
});
test('allowlist removes names, variant text, images, messages, bank data and raw order objects', () => {
  const input = { ...product, name: 'private@example.com', variantLabel: 'private', sku: 'private', image: 'private', familyId: id };
  const item = analyticsItem(input);
  const payload = safeEvent('add_to_cart', { items: [{ ...item, item_name: 'private', email: 'private' }], email: 'private', value: 999, location: 'private' });
  assert.doesNotMatch(JSON.stringify(payload), /private|item_name|email|location|value/);
  assert.equal(payload.currency, 'ARS'); assert.equal(payload.price_basis, 'list');
  assert.equal(payload.items[0].quantity, 2); assert.equal(payload.items[0].price, 30666.67);
  assert.equal(payload.items[0].family_id, id);
});
test('two virtual connectors retain separate public identities without sending recipes or physical components', () => {
  for (const connector of ['cc', 'lightning']) {
    const row = analyticsItem({ ...product, id: `${id}:${connector}`, combo: { presentationId: id, connector, head: { cost: 100 } } });
    assert.equal(row.item_variant, connector); assert.equal(row.item_id, id);
    assert.doesNotMatch(JSON.stringify(row), /cost|head|recipe/);
  }
  assert.equal(analyticsItem({ ...product, id: 'private@example.com' }), null);
});
test('unknown events, purchase, missing items and malformed metrics fail closed', () => {
  for (const name of ['purchase', 'sign_up', 'arbitrary']) assert.equal(safeEvent(name, {}), null);
  assert.equal(safeEvent('begin_checkout', { items: [] }), null);
  assert.equal(analyticsItem({ ...product, quantity: -1 }), null);
  assert.equal(safeEvent('add_to_cart', { items: [{ ...analyticsItem(product), quantity: 0 }] }), null);
  assert.deepEqual(safeEvent('catalog_search', { result_count: -1, category: 'private' }), {});
  const order = safeEvent('order_pending_transfer', { id, orderNumber: 'private', state: 'paid', value: 35000, email: 'private' });
  assert.deepEqual(order, { payment_state: 'pending', value: 35000, currency: 'ARS' });
});
test('one view per identity, new SKU views and returning visits are distinct', () => {
  const h = harness('accepted'); const params = { items: [analyticsItem(product)] };
  assert.equal(h.engine.emit('view_item', params, id), true);
  assert.equal(h.engine.emit('view_item', params, id), false);
  h.engine.route('/carrito', '/carrito'); h.engine.route('/accesorios', '/accesorios');
  assert.equal(h.engine.emit('view_item', params, id), true);
});

function browserModule(previousSession = new Map(), envOverrides = {}) {
  const cookies = [], scripts = [], commands = [], local = new Map(), session = previousSession;
  const storage = map => ({ getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k), key: i => [...map.keys()][i], get length() { return map.size; } });
  const window = { location: { origin: 'http://127.0.0.1:3153', hostname: '127.0.0.1', pathname: '/checkout' } };
  const document = { get cookie() { return '_ga=synthetic; sfstore-cart=keep'; }, set cookie(v) { cookies.push(v); },
    getElementById: () => scripts.find(s => !s.removed), createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: s => scripts.push(s) } };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../lib/analytics/client.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports','process','window','document','localStorage','sessionStorage','crypto',code)(exports, { env: { NEXT_PUBLIC_GA4_MEASUREMENT_ID:'G-SYNTHETIC', NEXT_PUBLIC_GA4_SITE_ORIGIN:window.location.origin, ...envOverrides } }, window, document, storage(local), storage(session), globalThis.crypto);
  return { ...exports, window, scripts, cookies, local, session, commands };
}
test('real browser adapter inserts no script before consent, sets no-referrer and private defaults before loading', () => {
  const b = browserModule(), engine = b.getAnalytics(); engine.initialize(); engine.route('/checkout', '/checkout');
  assert.equal(b.scripts.length, 0); assert.equal(b.window.dataLayer.length, 0);
  engine.choose('accepted'); assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].referrerPolicy, 'no-referrer');
  const queue = b.window.dataLayer.map(args => [...args]);
  assert.deepEqual(queue[0], ['consent','default',{ analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied' }]);
  const config = queue.find(c => c[0] === 'config')[2];
  assert.equal(config.send_page_view, false); assert.equal(config.allow_google_signals, false); assert.equal(config.ignore_referrer, true);
  engine.choose('rejected'); assert.equal(b.window['ga-disable-G-SYNTHETIC'], true); assert.equal(b.scripts[0].removed, true);
  assert.ok(b.cookies.some(c => c.startsWith('_ga=;'))); assert.ok(b.cookies.every(c => !c.includes('sfstore-cart')));
});
test('order retry after reload uses only a local digest, exact server amount, and no purchase event', async () => {
  const b = browserModule(), engine = b.getAnalytics(); engine.initialize(); engine.route('/checkout','/checkout'); engine.choose('accepted');
  await b.trackCreatedOrder(id, 23000); await b.trackCreatedOrder(id, 23000);
  const queue = b.window.dataLayer.map(args => [...args]), orders = queue.filter(c => c[0] === 'event' && c[1] === 'order_pending_transfer');
  assert.equal(orders.length, 1); assert.equal(orders[0][2].value, 23000);
  assert.doesNotMatch(JSON.stringify(queue), new RegExp(id));
  assert.equal(b.session.size, 1); assert.match([...b.session.keys()][0], /^sfstore-analytics-order-[0-9a-f]{64}$/);
  const reloaded = browserModule(b.session), next = reloaded.getAnalytics();
  next.initialize(); next.route('/checkout', '/checkout'); next.choose('accepted');
  await reloaded.trackCreatedOrder(id, 23000);
  assert.ok(!reloaded.window.dataLayer.some(args => args[0] === 'event' && args[1] === 'order_pending_transfer'));
  engine.choose('rejected'); assert.equal(b.session.size, 0);
});
test('route sanitizer rejects private/unknown routes and strips all query and fragment data', () => {
  assert.equal(publicRoute('/checkout/exito?order=private#proof'), '/checkout/exito');
  for (const path of ['/admin','/admin/login','/api/checkout','/anything']) assert.equal(publicRoute(path), null);
});
test('the actual adapter never loads on previews, invalid IDs or missing configuration', () => {
  for (const env of [{ NEXT_PUBLIC_GA4_SITE_ORIGIN:'https://sfstore.example' }, { NEXT_PUBLIC_GA4_MEASUREMENT_ID:'' }, { NEXT_PUBLIC_GA4_MEASUREMENT_ID:'not-a-measurement-id' }]) {
    const b = browserModule(new Map(), env), engine = b.getAnalytics();
    engine.initialize(); engine.route('/checkout','/checkout'); engine.choose('accepted');
    assert.equal(engine.enabled(), false); assert.equal(b.scripts.length, 0); assert.equal(b.window.dataLayer, undefined);
  }
});
