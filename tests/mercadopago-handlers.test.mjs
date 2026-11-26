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
const env = { MERCADOPAGO_PAYMENTS_ENABLED: '1', MERCADO_PAGO_ACCESS_TOKEN: 'synthetic-placeholder', MERCADO_PAGO_WEBHOOK_SECRET: 'secreto', NEXT_PUBLIC_SITE_URL: 'https://sfstore.example' };
const stored = { contado: { reference: 'SF-1', priceMode: 'contado', total: 15300, expiresAt: '2026-11-27T10:00:00Z' }, financiado: { reference: 'SF-1', priceMode: 'financiado', total: 17700, expiresAt: '2026-11-27T10:00:00Z' } };

function deps(mode, payment = {}, over = {}) {
  const calls = { rpc: [], preference: [], payment: [] };
  return {
    calls,
    env, nowMs: () => 1795600000000,
    authorizeBuyer: async () => buyer,
    rpc: async (name, args) => {
      calls.rpc.push([name, args]);
      if (name === 'checkout_mercadopago_order' || name === 'checkout_mercadopago_order_by_reference') return stored[mode];
      if (name === 'confirm_checkout_mercadopago_payment') return { status: 'approved' };
      return { status: 'review' };
    },
    createPreference: async body => { calls.preference.push(body); return { init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic' }; },
    createPayment: async request => { calls.payment.push(request); return { id: 777 }; },
    getPayment: async id => ({ id: Number(id), status: 'approved', payment_type_id: 'credit_card', installments: 3, transaction_amount: 17700, currency_id: 'ARS', external_reference: 'SF-1', ...payment }),
    ...over,
  };
}
const post = (body, headers = {}) => new Request('https://sfstore.example/api/mercadopago/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const rpcNames = d => d.calls.rpc.map(([name]) => name);

test('with payments disabled every handler answers 410 and touches nothing', async () => {
  for (const handle of [handlers.handleCreatePreference, handlers.handleCardPayment, handlers.handleWebhook]) {
    const d = deps('contado', {}, { env: {} });
    assert.equal((await handle(post({ orderId }), d)).status, 410);
    assert.equal(d.calls.rpc.length + d.calls.preference.length + d.calls.payment.length, 0);
  }
});

test('Checkout Pro uses the stored contado order only', async () => {
  const d = deps('contado');
  const response = await handlers.handleCreatePreference(post({ orderId, total: 1, priceMode: 'contado' }), d);
  assert.equal(response.status, 200);
  assert.match((await response.json()).url, /^https:\/\/www\.mercadopago\.com\.ar\//);
  assert.equal(d.calls.preference[0].items[0].unit_price, 15300);
  assert.equal(d.calls.preference[0].payment_methods.installments, 1);
  assert.deepEqual(d.calls.rpc[0], ['checkout_mercadopago_order', { p_buyer_id: buyer, p_order_id: orderId }]);
  assert.equal((await handlers.handleCreatePreference(post({ orderId }), deps('financiado'))).status, 409);
  assert.equal((await handlers.handleCreatePreference(post({ orderId: 'x' }), deps('contado'))).status, 400);
  assert.equal((await handlers.handleCreatePreference(post({ orderId }), deps('contado', {}, { authorizeBuyer: async () => null }))).status, 401);
  assert.equal((await handlers.handleCreatePreference(post({ orderId }), deps('contado', {}, { rpc: async () => null }))).status, 404);
});

test('Checkout API charges the stored list total in 2-3 installments and confirms only a matching payment', async () => {
  const card = { orderId, token: 'tok_simulado_123', installments: 3, paymentMethodId: 'visa', payerEmail: 'comprador@example.test', transaction_amount: 1 };
  const d = deps('financiado');
  const response = await handlers.handleCardPayment(post(card), d);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'approved' });
  assert.equal(d.calls.payment[0].body.transaction_amount, 17700);
  assert.match(d.calls.payment[0].idempotencyKey, /^SF-1:3:[0-9a-f]{24}$/);
  assert.deepEqual(rpcNames(d), ['checkout_mercadopago_order', 'checkout_mercadopago_order_by_reference', 'confirm_checkout_mercadopago_payment']);
  assert.equal(d.calls.rpc[2][1].p_amount, 17700);
  for (const installments of [1, 4, '3']) assert.equal((await handlers.handleCardPayment(post({ ...card, installments }), deps('financiado'))).status, 400);
  assert.equal((await handlers.handleCardPayment(post(card), deps('contado'))).status, 409);
  // Mercado Pago charged a different amount: the order is not confirmed, the payment is kept for review.
  const mismatch = deps('financiado', { transaction_amount: 15300 });
  assert.deepEqual(await (await handlers.handleCardPayment(post(card), mismatch)).json(), { status: 'review' });
  assert.ok(!rpcNames(mismatch).includes('confirm_checkout_mercadopago_payment'));
  assert.ok(rpcNames(mismatch).includes('review_checkout_mercadopago_payment'));
});

test('webhook: signature required, payment re-read from Mercado Pago, retry on failures', async () => {
  const sign = (id, ts = '1795600000') => ({ 'x-signature': `ts=${ts},v1=${createHmac('sha256', 'secreto').update(`id:${id};request-id:req-1;ts:${ts};`).digest('hex')}`, 'x-request-id': 'req-1' });
  const body = { type: 'payment', data: { id: '777' } };
  const ok = deps('financiado');
  assert.equal((await handlers.handleWebhook(post(body, sign('777')), ok)).status, 200);
  assert.ok(rpcNames(ok).includes('confirm_checkout_mercadopago_payment'));
  const forged = deps('financiado');
  assert.equal((await handlers.handleWebhook(post(body, sign('778')), forged)).status, 401);
  assert.equal((await handlers.handleWebhook(post(body), forged)).status, 401);
  assert.equal(forged.calls.rpc.length, 0);
  assert.equal((await handlers.handleWebhook(post({ type: 'merchant_order', data: { id: '777' } }, sign('777')), deps('financiado'))).status, 204);
  const outage = deps('financiado', {}, { getPayment: async () => { throw new Error('timeout'); } });
  assert.equal((await handlers.handleWebhook(post(body, sign('777')), outage)).status, 503);
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
