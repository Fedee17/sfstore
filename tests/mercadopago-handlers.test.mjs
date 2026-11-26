import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// contract.ts uses TypeScript-only syntax: transpile the module graph like the other tests do.
const nodeRequire = createRequire(import.meta.url), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(id => id.startsWith('.') ? load(resolve(dirname(file), id)) : nodeRequire(id), exports);
  return exports;
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const handlers = load(resolve(root, 'lib/payments/mercadopago-handlers.ts'));
const { parseCheckoutRequest } = load(resolve(root, 'lib/checkout/contract.ts'));

// Simulated buyer, database and Mercado Pago: no network, no credentials, no real orders.
const buyer = '20000000-0000-4000-8000-000000000001';
const orderId = '30000000-0000-4000-8000-000000000001';
const mpOrderId = 'ORDTST01M8BZ0SJDRK3F6AH3085GVRGV';
const env = { MERCADOPAGO_PAYMENTS_ENABLED: '1', MERCADO_PAGO_ACCESS_TOKEN: 'synthetic-placeholder', MERCADO_PAGO_WEBHOOK_SECRET: 'secreto', NEXT_PUBLIC_SITE_URL: 'https://sfstore.example' };
const stored = { contado: { reference: 'SF-1', priceMode: 'contado', total: 15300, expiresAt: '2026-11-27T10:00:00Z', preferenceUrl: null }, financiado: { reference: 'SF-1', priceMode: 'financiado', total: 17700, expiresAt: '2026-11-27T10:00:00Z', preferenceUrl: null } };
const mpOrder = (over = {}) => ({ id: mpOrderId, status: 'processed', status_detail: 'accredited', external_reference: 'SF-1', total_amount: '17700.00', currency: 'ARS',
  transactions: { payments: [{ id: 'PAY01X', amount: '17700.00', status: 'processed', status_detail: 'accredited', payment_method: { id: 'visa', type: 'credit_card', installments: 3 } }] }, ...over });

function deps(mode, { payment = {}, order = {}, confirm = { status: 'approved', orderId }, open = [] } = {}, over = {}) {
  const calls = { rpc: [], preference: [], expired: [], order: [] };
  return {
    calls,
    env, nowMs: () => 1795600000000,
    authorizeBuyer: async () => buyer,
    rpc: async (name, args) => {
      calls.rpc.push([name, args]);
      if (name === 'checkout_mercadopago_order' || name === 'checkout_mercadopago_order_by_reference') return stored[mode];
      if (name === 'confirm_checkout_mercadopago_payment') return confirm;
      if (name === 'open_checkout_mercadopago_preferences') return open;
      return { status: 'review' };
    },
    createPreference: async body => { calls.preference.push(body); return { id: '3458578784-ecaacd13-b6ea-48da-a272-71280f1a69f5', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic' }; },
    expirePreference: async (id, body) => { calls.expired.push([id, body]); },
    createOrder: async request => { calls.order.push(request); return mpOrder(order); },
    getOrder: async id => mpOrder({ id, ...order }),
    getPayment: async id => ({ id: Number(id), status: 'approved', payment_type_id: 'account_money', installments: 1, transaction_amount: 15300, currency_id: 'ARS', external_reference: 'SF-1', ...payment }),
    ...over,
  };
}
const post = (body, headers = {}, query = '') => new Request(`https://sfstore.example/api/mercadopago/x${query}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const sign = (id, ts = '1795600000000') => ({ 'x-signature': `ts=${ts},v1=${createHmac('sha256', 'secreto').update(`id:${id};request-id:req-1;ts:${ts};`).digest('hex')}`, 'x-request-id': 'req-1' });
const rpcNames = d => d.calls.rpc.map(([name]) => name);
const refusing = code => ({ rpc: async () => { throw new Error(code); } });

test('with payments disabled every handler answers 410 and touches nothing', async () => {
  for (const handle of [handlers.handleCreatePreference, handlers.handleCardPayment, handlers.handleWebhook]) {
    const d = deps('contado', {}, { env: {} });
    assert.equal((await handle(post({ orderId }), d)).status, 410);
    assert.equal(d.calls.rpc.length + d.calls.preference.length + d.calls.order.length, 0);
  }
});

test('payments off with the webhook secret loaded: signature checked, nothing read or settled', async () => {
  const touched = [];
  const off = deps('contado', {}, { env: { MERCADO_PAGO_ACCESS_TOKEN: 'synthetic-placeholder', MERCADO_PAGO_WEBHOOK_SECRET: 'secreto' },
    getPayment: async () => { touched.push('payment'); }, getOrder: async () => { touched.push('order'); } });
  assert.equal((await handlers.handleWebhook(post({ type: 'payment', data: { id: '777' } }), off)).status, 401);
  assert.equal((await handlers.handleWebhook(post({ type: 'payment', data: { id: '777' } }, sign('778')), off)).status, 401);
  const valid = await handlers.handleWebhook(post({ type: 'payment', data: { id: '777' } }, sign('777')), off);
  assert.equal(valid.status, 503);
  assert.equal((await valid.json()).code, 'AUTOMATIC_PAYMENTS_DISABLED');
  assert.equal((await handlers.handleWebhook(post({ type: 'order', data: { id: mpOrderId } }, sign(mpOrderId.toLowerCase())), off)).status, 503);
  for (const handle of [handlers.handleCreatePreference, handlers.handleCardPayment]) assert.equal((await handle(post({ orderId }), off)).status, 410);
  assert.deepEqual(touched, []);
  assert.equal(off.calls.rpc.length + off.calls.preference.length + off.calls.order.length + off.calls.expired.length, 0);
});

test('signed Order URLs use the lowercase ID in the manifest and the uppercase resource ID for lookup', async () => {
  const id = 'ORD01M28P44G5FG8RJPM579EH56FV';
  const signedId = id.toLowerCase();
  const body = { type: 'order', data: { id } };
  const headers = sign(signedId);
  const order = deps('financiado', {}, { getOrder: async receivedId => {
    assert.equal(receivedId, id);
    return mpOrder({ id });
  } });
  for (const urlId of [id, signedId, `Ord${id.slice(3)}`]) {
    const response = await handlers.handleWebhook(post(body, headers, `?data.id=${urlId}&type=order`), order);
    assert.equal(response.status, 200, urlId);
  }
  assert.equal(order.calls.rpc.filter(([name]) => name === 'confirm_checkout_mercadopago_payment').length, 3);
});

for (const [type, id] of [['payment', '777'], ['order', mpOrderId.toLowerCase()]]) {
  test(`${type} webhooks reject invalid or expired signatures and malformed URL IDs while payments are off`, async () => {
    const off = deps('contado', {}, { env: { MERCADO_PAGO_WEBHOOK_SECRET: env.MERCADO_PAGO_WEBHOOK_SECRET } });
    const body = { type, data: { id } };
    const notify = (urlId, headers) => handlers.handleWebhook(
      post(body, headers, `?data.id=${encodeURIComponent(urlId)}&type=${type}`), off,
    );
    const valid = await notify(id, sign(id));
    assert.equal(valid.status, 503);
    assert.equal((await valid.json()).code, 'AUTOMATIC_PAYMENTS_DISABLED');

    const malformed = `${id};`;
    for (const [urlId, headers] of [[id, sign('888')], [id, sign(id, '1795599699999')], [malformed, sign(malformed)],
      [id, { ...sign(id), 'x-request-id': 'other-request' }]]) {
      const rejected = await notify(urlId, headers);
      assert.equal(rejected.status, 401);
      assert.equal((await rejected.json()).code, 'WEBHOOK_SIGNATURE_INVALID');
    }
    assert.deepEqual(off.calls.rpc, []);
  });
}

test('Checkout Pro uses the stored contado order only and reuses its open link', async () => {
  const d = deps('contado');
  const response = await handlers.handleCreatePreference(post({ orderId, total: 1, priceMode: 'contado' }), d);
  assert.equal(response.status, 200);
  assert.match((await response.json()).url, /^https:\/\/www\.mercadopago\.com\.ar\//);
  assert.equal(d.calls.preference[0].items[0].unit_price, 15300);
  assert.equal(d.calls.preference[0].payment_methods.installments, 1);
  assert.deepEqual(d.calls.rpc[0], ['checkout_mercadopago_order', { p_buyer_id: buyer, p_order_id: orderId }]);
  assert.deepEqual(d.calls.rpc[1], ['record_checkout_mercadopago_preference', { p_order_id: orderId, p_preference_id: '3458578784-ecaacd13-b6ea-48da-a272-71280f1a69f5', p_init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic' }]);
  const reuse = deps('contado', {}, { rpc: async () => ({ ...stored.contado, preferenceUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=open' }) });
  assert.match((await (await handlers.handleCreatePreference(post({ orderId }), reuse)).json()).url, /pref_id=open$/);
  assert.equal(reuse.calls.preference.length, 0);
  assert.equal((await handlers.handleCreatePreference(post({ orderId }), deps('financiado'))).status, 409);
  assert.equal((await handlers.handleCreatePreference(post({ orderId: 'x' }), deps('contado'))).status, 400);
  assert.equal((await handlers.handleCreatePreference(post({ orderId }), deps('contado', {}, { authorizeBuyer: async () => null }))).status, 401);
  assert.equal((await handlers.handleCreatePreference(post({ orderId }), deps('contado', {}, { rpc: async () => null }))).status, 404);
});

test('a paid, expired or disabled order never starts another payment attempt', async () => {
  for (const [code, status] of [['CHECKOUT_ALREADY_PAID', 409], ['CHECKOUT_EXPIRED', 409], ['CHECKOUT_PAYMENT_METHOD_DISABLED', 410], ['CHECKOUT_NOT_FOUND', 404], ['connection reset', 503]]) {
    for (const handle of [handlers.handleCreatePreference, handlers.handleCardPayment]) {
      const d = deps('contado', {}, refusing(code));
      const response = await handle(post({ orderId, token: 'tok_simulado_123', installments: 3, paymentMethodId: 'visa', payerEmail: 'a@b.cd' }), d);
      assert.equal(response.status, status, code);
      if (code === 'CHECKOUT_ALREADY_PAID') assert.equal((await response.json()).code, 'CHECKOUT_ALREADY_PAID');
      assert.equal(d.calls.preference.length + d.calls.order.length, 0);
    }
  }
});

test('Checkout API (Orders API) charges the stored list total in 2-3 installments and confirms only a matching order', async () => {
  const card = { orderId, token: 'tok_simulado_123', installments: 3, paymentMethodId: 'visa', payerEmail: 'comprador@example.test', total_amount: '1.00', issuerId: '3' };
  const d = deps('financiado');
  const response = await handlers.handleCardPayment(post(card), d);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'approved' });
  assert.equal(d.calls.order[0].body.total_amount, '17700.00');
  assert.equal(d.calls.order[0].body.transactions.payments[0].payment_method.installments, 3);
  assert.match(d.calls.order[0].idempotencyKey, /^SF-1:3:[0-9a-f]{24}$/);
  assert.deepEqual(rpcNames(d), ['checkout_mercadopago_order', 'checkout_mercadopago_order_by_reference', 'confirm_checkout_mercadopago_payment', 'open_checkout_mercadopago_preferences']);
  assert.deepEqual(d.calls.rpc[2][1], { p_provider_payment_id: mpOrderId, p_reference: 'SF-1', p_amount: 17700, p_installments: 3, p_method: 'credit_card', p_currency: 'ARS' });
  for (const installments of [1, 4, '3']) assert.equal((await handlers.handleCardPayment(post({ ...card, installments }), deps('financiado'))).status, 400);
  assert.equal((await handlers.handleCardPayment(post(card), deps('contado'))).status, 409);
  // Pending and rejected cards confirm nothing and tell the buyer which one happened.
  for (const [order, status] of [[{ status: 'processing', status_detail: 'in_process' }, 'pending'], [{ status: 'failed', status_detail: 'failed' }, 'rejected']]) {
    const other = deps('financiado', { order });
    assert.deepEqual(await (await handlers.handleCardPayment(post(card), other)).json(), { status });
    assert.ok(!rpcNames(other).includes('confirm_checkout_mercadopago_payment'));
  }
  // Mercado Pago reports a different amount: the order is not confirmed, the charge is kept for review.
  const mismatch = deps('financiado', { order: { total_amount: '15300.00', transactions: { payments: [{ id: 'PAY01X', amount: '15300.00', status: 'processed', status_detail: 'accredited', payment_method: { id: 'visa', type: 'credit_card', installments: 3 } }] } } });
  assert.deepEqual(await (await handlers.handleCardPayment(post(card), mismatch)).json(), { status: 'review' });
  assert.ok(!rpcNames(mismatch).includes('confirm_checkout_mercadopago_payment'));
  assert.ok(rpcNames(mismatch).includes('review_checkout_mercadopago_payment'));
});

test('a confirmed or duplicated charge closes every open Checkout Pro link of its order', async () => {
  const pref = '3458578784-ecaacd13-b6ea-48da-a272-71280f1a69f5';
  const sign = (id, ts = '1795600000') => ({ 'x-signature': `ts=${ts},v1=${createHmac('sha256', 'secreto').update(`id:${id};request-id:req-1;ts:${ts};`).digest('hex')}`, 'x-request-id': 'req-1' });
  const paid = deps('contado', { open: [pref] });
  assert.equal((await handlers.handleWebhook(post({ type: 'payment', data: { id: '777' } }, sign('777')), paid)).status, 200);
  assert.deepEqual(paid.calls.expired, [[pref, { expires: true, expiration_date_to: new Date(1795600000000).toISOString() }]]);
  assert.ok(rpcNames(paid).includes('expire_checkout_mercadopago_preference'));
  const duplicate = deps('contado', { open: [pref], confirm: { status: 'review', orderId, kind: 'refund' } });
  assert.equal((await handlers.handleWebhook(post({ type: 'payment', data: { id: '778' } }, sign('778')), duplicate)).status, 200);
  assert.equal(duplicate.calls.expired.length, 1);
  // Mercado Pago refuses to close the link: the webhook fails so Mercado Pago retries (confirmation is a replay).
  const outage = deps('contado', { open: [pref] }, { expirePreference: async () => { throw new Error('MERCADOPAGO_HTTP_500'); } });
  assert.equal((await handlers.handleWebhook(post({ type: 'payment', data: { id: '777' } }, sign('777')), outage)).status, 503);
});

test('webhook: signature required, charge re-read from Mercado Pago for both topics, retry on failures', async () => {
  const body = { type: 'payment', data: { id: '777' } };
  const ok = deps('contado');
  assert.equal((await handlers.handleWebhook(post(body, sign('777')), ok)).status, 200);
  assert.ok(rpcNames(ok).includes('confirm_checkout_mercadopago_payment'));
  const order = deps('financiado');
  assert.equal((await handlers.handleWebhook(post({ type: 'order', action: 'order.processed', data: { id: mpOrderId } }, sign(mpOrderId.toLowerCase())), order)).status, 200);
  assert.equal(order.calls.rpc.find(([name]) => name === 'confirm_checkout_mercadopago_payment')[1].p_provider_payment_id, mpOrderId);
  const forged = deps('financiado');
  assert.equal((await handlers.handleWebhook(post(body, sign('778')), forged)).status, 401);
  assert.equal((await handlers.handleWebhook(post(body), forged)).status, 401);
  assert.equal((await handlers.handleWebhook(post({ type: 'order', data: { id: mpOrderId } }, sign('ordtst01m8bz0sjdrk3f6ah3085gvrgw')), forged)).status, 401);
  assert.equal(forged.calls.rpc.length, 0);
  assert.equal((await handlers.handleWebhook(post({ type: 'merchant_order', data: { id: '777' } }, sign('777')), deps('financiado'))).status, 204);
  const outage = deps('financiado', {}, { getPayment: async () => { throw new Error('timeout'); }, getOrder: async () => { throw new Error('timeout'); } });
  assert.equal((await handlers.handleWebhook(post(body, sign('777')), outage)).status, 503);
  assert.equal((await handlers.handleWebhook(post({ type: 'order', data: { id: mpOrderId } }, sign(mpOrderId.toLowerCase())), outage)).status, 503);
});

test('checkout contract: Mercado Pago and installments only when enabled, installments only with Mercado Pago', () => {
  const base = { operationKey: orderId, customer: { fullName: 'SYNTHETIC', phone: 'TEST' }, shipping: { method: 'pickup' }, paymentMethod: 'transfer', items: [{ productId: buyer, quantity: 1 }] };
  assert.equal(parseCheckoutRequest(base).paymentMethod, 'transfer');
  assert.equal(parseCheckoutRequest({ ...base, priceMode: 'contado' }).priceMode, 'contado');
  assert.throws(() => parseCheckoutRequest({ ...base, paymentMethod: 'mercadopago' }));
  assert.equal(parseCheckoutRequest({ ...base, paymentMethod: 'mercadopago' }, { mercadopago: true }).paymentMethod, 'mercadopago');
  assert.equal(parseCheckoutRequest({ ...base, paymentMethod: 'mercadopago', priceMode: 'financiado' }, { mercadopago: true }).priceMode, 'financiado');
  for (const input of [{ ...base, priceMode: 'financiado' }, { ...base, priceMode: 'cuotas' }, { ...base, priceMode: 3 }, { ...base, paymentMethod: 'mercadopago', priceMode: 'financiado', total: 1 }]) {
    assert.throws(() => parseCheckoutRequest(input, { mercadopago: true }));
  }
});
