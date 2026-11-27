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
const attemptId = '40000000-0000-4000-8000-000000000001';
const leaseId = '50000000-0000-4000-8000-000000000001';
const env = { MERCADOPAGO_PAYMENTS_ENABLED: '1', MERCADO_PAGO_ACCESS_TOKEN: 'synthetic-placeholder', MERCADO_PAGO_WEBHOOK_SECRET: 'secreto', NEXT_PUBLIC_SITE_URL: 'https://sfstore.example' };
const stored = { contado: { reference: 'SF-1', priceMode: 'contado', total: 15300, expiresAt: '2026-11-27T10:00:00Z', preferenceUrl: null }, financiado: { reference: 'SF-1', priceMode: 'financiado', total: 17700, expiresAt: '2026-11-27T10:00:00Z', preferenceUrl: null } };
const mpOrder = (over = {}) => ({ id: mpOrderId, status: 'processed', status_detail: 'accredited', external_reference: 'SF-1', total_amount: '17700.00', currency: 'ARS',
  transactions: { payments: [{ id: 'PAY01X', amount: '17700.00', paid_amount: '17700.00', status: 'processed', status_detail: 'accredited', payment_method: { id: 'visa', type: 'credit_card', installments: 3 } }] }, ...over });
const unprocessedOrder = () => {
  const order = mpOrder({ status: 'created', status_detail: 'created', processing_mode: 'manual' });
  Object.assign(order.transactions.payments[0], { status: 'created', status_detail: 'created', paid_amount: '0.00' });
  return order;
};

function deps(mode, { payment = {}, order = {}, confirm = { status: 'approved', orderId }, open = [] } = {}, over = {}) {
  const calls = { rpc: [], preference: [], expired: [], order: [], process: [] };
  let claimed = false;
  return {
    calls,
    env, nowMs: () => 1795600000000,
    authorizeBuyer: async () => buyer,
    rpc: async (name, args) => {
      calls.rpc.push([name, args]);
      if (name === 'checkout_mercadopago_order' || name === 'checkout_mercadopago_order_by_reference') return stored[mode];
      if (name === 'claim_checkout_mercadopago_card_attempt') {
        if (claimed) return { busy: true };
        claimed = true;
        return { attemptId, leaseId, providerOrderId: null };
      }
      if (name === 'bind_checkout_mercadopago_card_attempt') return true;
      if (name === 'release_checkout_mercadopago_card_attempt') return null;
      if (name === 'confirm_checkout_mercadopago_payment') return confirm;
      if (name === 'open_checkout_mercadopago_preferences') return open;
      return { status: 'review' };
    },
    createPreference: async body => { calls.preference.push(body); return { id: '3458578784-ecaacd13-b6ea-48da-a272-71280f1a69f5', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic' }; },
    expirePreference: async (id, body) => { calls.expired.push([id, body]); },
    createOrder: async request => { calls.order.push(request); return unprocessedOrder(); },
    processOrder: async (id, key) => { calls.process.push([id, key]); },
    getOrder: async id => {
      const result = mpOrder({ id, ...order });
      if (['failed', 'canceled', 'expired'].includes(result.status) && !order.transactions) {
        Object.assign(result.transactions.payments[0], { status: result.status, paid_amount: '0.00' });
      }
      return result;
    },
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
  assert.equal((await handlers.handleWebhook(post({ type: 'order', data: { id: mpOrderId } }, sign(mpOrderId)), off)).status, 503);
  for (const handle of [handlers.handleCreatePreference, handlers.handleCardPayment]) assert.equal((await handle(post({ orderId }), off)).status, 410);
  assert.deepEqual(touched, []);
  assert.equal(off.calls.rpc.length + off.calls.preference.length + off.calls.order.length + off.calls.expired.length, 0);
});

test('Order with payments disabled requires the signature to match the case of the URL ID', async () => {
  const id = 'ORD01H00000000000000000000000';
  const off = deps('contado', {}, { env: { MERCADO_PAGO_WEBHOOK_SECRET: env.MERCADO_PAGO_WEBHOOK_SECRET } });
  const body = { type: 'order', data: { id } };
  for (const urlId of [id, id.toLowerCase(), `Ord${id.slice(3)}`]) {
    const query = `?data.id=${urlId}&type=order`;
    const valid = await handlers.handleWebhook(post(body, sign(urlId), query), off);
    assert.equal(valid.status, 503, urlId);
    assert.equal((await valid.json()).code, 'AUTOMATIC_PAYMENTS_DISABLED');

    const otherCase = urlId === id ? id.toLowerCase() : id;
    const invalid = await handlers.handleWebhook(post(body, sign(otherCase), query), off);
    assert.equal(invalid.status, 401, urlId);
    assert.equal((await invalid.json()).code, 'WEBHOOK_SIGNATURE_INVALID');
  }
  assert.deepEqual(off.calls.rpc, []);
});

test('signed Order URLs preserve the received ID for verification and use the uppercase resource ID for lookup', async () => {
  const id = 'ORD01M28P44G5FG8RJPM579EH56FV';
  const body = { type: 'order', data: { id } };
  const order = deps('financiado', {}, { getOrder: async receivedId => {
    assert.equal(receivedId, id);
    return mpOrder({ id });
  } });
  for (const urlId of [id, id.toLowerCase(), `Ord${id.slice(3)}`]) {
    const response = await handlers.handleWebhook(post(body, sign(urlId), `?data.id=${urlId}&type=order`), order);
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
  assert.equal(d.calls.order[0].idempotencyKey, `create-${attemptId}`);
  assert.deepEqual(d.calls.process, [[mpOrderId, `process-${attemptId}`]]);
  assert.deepEqual(rpcNames(d), ['checkout_mercadopago_order', 'claim_checkout_mercadopago_card_attempt', 'bind_checkout_mercadopago_card_attempt', 'checkout_mercadopago_order_by_reference', 'confirm_checkout_mercadopago_payment', 'open_checkout_mercadopago_preferences']);
  assert.deepEqual(d.calls.rpc[4][1], { p_provider_payment_id: mpOrderId, p_reference: 'SF-1', p_amount: 17700, p_installments: 3, p_method: 'credit_card', p_currency: 'ARS' });
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

test('two concurrent card submissions can process only one provider order', async () => {
  const card = { orderId, token: 'synthetic_token_first', installments: 3, paymentMethodId: 'visa', payerEmail: 'buyer@example.test' };
  const d = deps('financiado');
  const results = await Promise.all([
    handlers.handleCardPayment(post(card), d),
    handlers.handleCardPayment(post({ ...card, token: 'synthetic_token_second' }), d),
  ]);
  assert.equal(d.calls.order.length, 1);
  assert.equal(d.calls.process.length, 1);
  const statuses = await Promise.all(results.map(async result => (await result.json()).status));
  assert.deepEqual(statuses.sort(), ['approved', 'pending']);
});

test('a lost process response recovers through GET and never creates another provider order', async () => {
  const card = { orderId, token: 'synthetic_token_first', installments: 3, paymentMethodId: 'visa', payerEmail: 'buyer@example.test' };
  const d = deps('financiado');
  const baseRpc = d.rpc;
  let bound = null, complete = false;
  d.rpc = async (name, args) => {
    if (name === 'claim_checkout_mercadopago_card_attempt') return { attemptId, leaseId, providerOrderId: bound };
    if (name === 'bind_checkout_mercadopago_card_attempt') bound = args.p_provider_order_id;
    return baseRpc(name, args);
  };
  d.processOrder = async (...args) => { d.calls.process.push(args); throw new Error('network reset'); };
  d.getOrder = async () => { if (!complete) throw new Error('network reset'); return mpOrder(); };
  assert.equal((await (await handlers.handleCardPayment(post(card), d)).json()).status, 'pending');
  complete = true;
  assert.equal((await (await handlers.handleCardPayment(post({ ...card, token: 'synthetic_token_second' }), d)).json()).status, 'approved');
  assert.equal(d.calls.order.length, 1);
  assert.deepEqual(d.calls.process, [[mpOrderId, `process-${attemptId}`]]);
});

test('a retry of an unprocessed bound provider order reuses its original process key', async () => {
  const d = deps('financiado');
  const baseRpc = d.rpc;
  d.rpc = (name, args) => name === 'claim_checkout_mercadopago_card_attempt'
    ? Promise.resolve({ attemptId, leaseId, providerOrderId: mpOrderId }) : baseRpc(name, args);
  d.getOrder = async () => d.calls.process.length === 2 ? mpOrder() : unprocessedOrder();
  const card = { orderId, token: 'unrelated_synthetic_token', installments: 2, paymentMethodId: 'master', payerEmail: 'buyer@example.test' };
  assert.equal((await (await handlers.handleCardPayment(post(card), d)).json()).status, 'pending');
  assert.equal((await (await handlers.handleCardPayment(post(card), d)).json()).status, 'approved');
  assert.equal(d.calls.order.length, 0);
  assert.deepEqual(d.calls.process, Array(2).fill([mpOrderId, `process-${attemptId}`]));
});

test('an expired lease or an altered provider order never reaches processing', async () => {
  const card = { orderId, token: 'synthetic_token_first', installments: 3, paymentMethodId: 'visa', payerEmail: 'buyer@example.test' };
  for (const [newOrder, canBind] of [[unprocessedOrder(), false], [{ ...unprocessedOrder(), total_amount: '1.00' }, true], [mpOrder({ external_reference: 'SF-other' }), true]]) {
    const d = deps('financiado');
    const baseRpc = d.rpc;
    d.rpc = (name, args) => name === 'bind_checkout_mercadopago_card_attempt' ? Promise.resolve(canBind) : baseRpc(name, args);
    d.createOrder = async () => newOrder;
    assert.equal((await (await handlers.handleCardPayment(post(card), d)).json()).status, 'pending');
    assert.equal(d.calls.process.length, 0);
  }
});

test('only a terminal unpaid provider order releases a bound attempt for another card', async () => {
  const card = { orderId, token: 'synthetic_token_first', installments: 3, paymentMethodId: 'visa', payerEmail: 'buyer@example.test' };
  for (const [status, outcome, released] of [['failed', 'rejected', true], ['processing', 'pending', false], ['refunded', 'review', false]]) {
    const d = deps('financiado', { order: { status } });
    assert.equal((await (await handlers.handleCardPayment(post(card), d)).json()).status, outcome);
    assert.equal(rpcNames(d).includes('release_checkout_mercadopago_card_attempt'), released);
  }
});

test('a failed manual order creation can never reach process', async () => {
  const d = deps('financiado', {}, { createOrder: async () => { throw new Error('provider timeout'); } });
  const card = { orderId, token: 'synthetic_token_first', installments: 3, paymentMethodId: 'visa', payerEmail: 'buyer@example.test' };
  assert.equal((await handlers.handleCardPayment(post(card), d)).status, 503);
  assert.equal(d.calls.process.length, 0);
  assert.ok(!rpcNames(d).includes('bind_checkout_mercadopago_card_attempt'));
});

test('the server adapter processes the stored remote ID with the fixed key and resolves currency for that exact order', async () => {
  const calls = [];
  const order = mpOrder({ currency: undefined, created_date: '2026-11-26T13:00:00Z' });
  const paths = [
    order,
    { data: [{ id: 'ORDANOTHERORDER', external_reference: order.external_reference, currency: 'USD' },
      { id: order.id, external_reference: order.external_reference, currency: 'ARS' }] },
    { id: order.id },
  ];
  const fetch = async (url, init) => {
    calls.push([new URL(url), init]);
    return Response.json(paths.shift());
  };
  const service = ts.transpileModule(readFileSync(resolve(root, 'services/mercadopago-server.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'process', 'fetch', service)(() => ({}), exports, { env }, fetch);
  const adapter = exports.mercadoPagoDeps();
  assert.equal((await adapter.getOrder(order.id)).currency, 'ARS');
  await adapter.processOrder(order.id, `process-${attemptId}`);
  assert.equal(calls[1][0].pathname, '/v1/orders');
  assert.equal(calls[1][0].searchParams.get('external_reference'), order.external_reference);
  assert.equal(calls[2][0].pathname, `/v1/orders/${order.id}/process`);
  assert.equal(calls[2][1].method, 'POST');
  assert.equal(calls[2][1].headers['X-Idempotency-Key'], `process-${attemptId}`);
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
  assert.equal((await handlers.handleWebhook(post({ type: 'order', action: 'order.processed', data: { id: mpOrderId } }, sign(mpOrderId)), order)).status, 200);
  assert.equal(order.calls.rpc.find(([name]) => name === 'confirm_checkout_mercadopago_payment')[1].p_provider_payment_id, mpOrderId);
  const forged = deps('financiado');
  assert.equal((await handlers.handleWebhook(post(body, sign('778')), forged)).status, 401);
  assert.equal((await handlers.handleWebhook(post(body), forged)).status, 401);
  assert.equal((await handlers.handleWebhook(post({ type: 'order', data: { id: mpOrderId } }, sign('ORDTST01M8BZ0SJDRK3F6AH3085GVRGW')), forged)).status, 401);
  assert.equal(forged.calls.rpc.length, 0);
  assert.equal((await handlers.handleWebhook(post({ type: 'merchant_order', data: { id: '777' } }, sign('777')), deps('financiado'))).status, 204);
  const outage = deps('financiado', {}, { getPayment: async () => { throw new Error('timeout'); }, getOrder: async () => { throw new Error('timeout'); } });
  assert.equal((await handlers.handleWebhook(post(body, sign('777')), outage)).status, 503);
  assert.equal((await handlers.handleWebhook(post({ type: 'order', data: { id: mpOrderId } }, sign(mpOrderId)), outage)).status, 503);
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
