import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import * as mp from '../lib/payments/mercadopago.ts';

// Simulated Mercado Pago (no network, no credentials): the amount charged and confirmed is always the stored order's.
const B = BigInt;
const contado = { reference: 'SF-000123', mode: 'contado', totalCents: B(1530000), expiresAt: '2026-11-26T12:00:00.000-03:00', description: 'Pedido SF-000123' };
const financiado = { ...contado, mode: 'financiado', totalCents: B(1770000) };
const card = { token: 'tok_simulado_123', installments: 3, paymentMethodId: 'visa', payerEmail: 'comprador@example.test' };

test('payments stay off unless explicitly enabled with token and webhook secret', () => {
  assert.equal(mp.isMercadoPagoEnabled({}), false);
  assert.equal(mp.isMercadoPagoEnabled({ MERCADOPAGO_PAYMENTS_ENABLED: '1', MERCADO_PAGO_ACCESS_TOKEN: 'x' }), false);
  assert.equal(mp.isMercadoPagoEnabled({ MERCADOPAGO_PAYMENTS_ENABLED: '0', MERCADO_PAGO_ACCESS_TOKEN: 'x', MERCADO_PAGO_WEBHOOK_SECRET: 'y' }), false);
  assert.equal(mp.isMercadoPagoEnabled({ MERCADOPAGO_PAYMENTS_ENABLED: '1', MERCADO_PAGO_ACCESS_TOKEN: 'x', MERCADO_PAGO_WEBHOOK_SECRET: 'y' }), true);
});

test('Checkout Pro charges the stored contado total in exactly one installment', () => {
  const pref = mp.contadoPreference(contado, 'https://sfstore.example', '11111111-1111-4111-8111-111111111111');
  assert.equal(pref.items.length, 1);
  assert.equal(pref.items[0].unit_price, 15300);
  assert.equal(pref.payment_methods.installments, 1);
  assert.equal(pref.payment_methods.default_installments, 1);
  assert.equal(pref.external_reference, 'SF-000123');
  assert.equal(pref.binary_mode, true);
  assert.equal(pref.date_of_expiration, contado.expiresAt);
  assert.deepEqual(pref.payment_methods.excluded_payment_types, [{ id: 'ticket' }, { id: 'atm' }]);
  assert.throws(() => mp.contadoPreference(financiado, 'https://sfstore.example', '11111111-1111-4111-8111-111111111111'), /contado/);
  assert.throws(() => mp.contadoPreference(contado, 'http://sfstore.example', '11111111-1111-4111-8111-111111111111'), /https/);
  assert.throws(() => mp.contadoPreference({ ...contado, totalCents: B(0) }, 'https://sfstore.example'));
  assert.deepEqual(mp.expiredPreference('2026-11-26T12:00:00.000Z'), { expires: true, expiration_date_to: '2026-11-26T12:00:00.000Z' });
});

test('Checkout API (Orders API) charges the stored financiado total in 2 or 3 installments only', () => {
  for (const installments of [2, 3]) {
    const { body, idempotencyKey } = mp.financedOrder(financiado, { ...card, installments });
    assert.equal(body.type, 'online');
    assert.equal(body.processing_mode, 'automatic');
    assert.equal(body.total_amount, '17700.00');
    assert.deepEqual(body.transactions.payments, [{ amount: '17700.00', payment_method: { id: 'visa', type: 'credit_card', token: card.token, installments, statement_descriptor: 'SFSTORE' } }]);
    assert.equal(body.external_reference, 'SF-000123');
    assert.ok(idempotencyKey.length <= 128);
    assert.match(idempotencyKey, new RegExp(`^SF-000123:${installments}:[0-9a-f]{24}$`));
    assert.notEqual(idempotencyKey, mp.financedOrder(financiado, { ...card, token: card.token + 'x', installments }).idempotencyKey); // new token, new attempt
  }
  assert.equal(mp.financedOrder({ ...financiado, totalCents: B(1770005) }, card).body.total_amount, '17700.05');
  for (const installments of [1, 4, 6, 2.5, Number.NaN]) assert.throws(() => mp.financedOrder(financiado, { ...card, installments }), /cuotas/);
  assert.throws(() => mp.financedOrder(contado, card), /lista/);
  assert.throws(() => mp.financedOrder(financiado, { ...card, token: '"; drop' }));
  // The browser cannot choose the amount: extra fields are ignored by construction.
  assert.equal(mp.financedOrder(financiado, { ...card, total_amount: '1.00' }).body.total_amount, '17700.00');
});

test('webhook signatures are verified with the secret, the request id and a recent timestamp', () => {
  const secret = 'secreto-de-prueba', requestId = 'req-1', dataId = '123456789', now = 1795600000000;
  const sign = (ts, id = dataId, key = secret) => `ts=${ts},v1=${createHmac('sha256', key).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex')}`;
  const ts = String(now / 1000);
  assert.equal(mp.verifyWebhookSignature({ signature: sign(ts), requestId, dataId, secret, nowMs: now }), true);
  assert.equal(mp.verifyWebhookSignature({ signature: sign(ts, '987'), requestId, dataId, secret, nowMs: now }), false);
  assert.equal(mp.verifyWebhookSignature({ signature: sign(ts, dataId, 'otro'), requestId, dataId, secret, nowMs: now }), false);
  assert.equal(mp.verifyWebhookSignature({ signature: sign(String(now / 1000 - 3600)), requestId, dataId, secret, nowMs: now }), false);
  assert.equal(mp.verifyWebhookSignature({ signature: null, requestId, dataId, secret, nowMs: now }), false);
  assert.equal(mp.verifyWebhookSignature({ signature: sign(ts), requestId: null, dataId, secret, nowMs: now }), false);
  assert.equal(mp.verifyWebhookSignature({ signature: 'ts=1,v1=zz', requestId, dataId, secret, nowMs: now }), false);
  const order = 'ORDTST01M8BZ0SJDRK3F6AH3085GVRGV';
  assert.equal(mp.verifyWebhookSignature({ signature: sign(ts, order), requestId, dataId: 'ORDTST01M8BZ0SJDRK3F6AH3085GVRGW', secret, nowMs: now }), false);
  assert.equal(mp.verifyWebhookSignature({ signature: sign(ts, 'abc;request-id:x'), requestId, dataId: 'abc;request-id:x', secret, nowMs: now }), false);
});

test('Order signature verification preserves the case of the signed identifier', () => {
  const dataId = 'ORD01H00000000000000000000000';
  const requestId = 'req-1', secret = 'secreto-de-prueba', nowMs = 1795600000000;
  const sign = id => `ts=${nowMs},v1=${createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:${nowMs};`).digest('hex')}`;
  assert.equal(mp.verifyWebhookSignature({ signature: sign(dataId), requestId, dataId, secret, nowMs }), true);
  assert.equal(mp.verifyWebhookSignature({ signature: sign(dataId.toLowerCase()), requestId, dataId, secret, nowMs }), false);
});

function harness(order, payment) {
  const calls = { approve: [], review: [] };
  const deps = {
    fetchPayment: async id => ({ id: Number(id), ...payment }),
    loadOrder: async reference => (order && reference === order.reference ? order : null),
    approve: async input => { calls.approve.push(input); return 'approved'; },
    review: async input => { calls.review.push(input); },
  };
  return { deps, calls };
}
const approvedPayment = over => ({ status: 'approved', payment_type_id: 'account_money', installments: 1, transaction_amount: 15300, currency_id: 'ARS', external_reference: 'SF-000123', ...over });

test('an approved payment matching method, installments and amount confirms the order once', async () => {
  const { deps, calls } = harness(contado, approvedPayment());
  assert.equal(await mp.settleMercadoPagoPayment('555', deps), 'approved');
  assert.deepEqual(calls.approve, [{ reference: 'SF-000123', providerPaymentId: '555', amountCents: B(1530000), installments: 1, method: 'account_money' }]);
  const fin = harness(financiado, approvedPayment({ payment_type_id: 'credit_card', installments: 3, transaction_amount: 17700 }));
  assert.equal(await mp.settleMercadoPagoPayment('556', fin.deps), 'approved');
});

test('any difference between selected price, order and confirmed payment goes to review, never to approval', async () => {
  const cases = [
    [contado, approvedPayment({ transaction_amount: 15299.99 })], // underpaid
    [contado, approvedPayment({ transaction_amount: 17700 })], // list amount on a contado order
    [contado, approvedPayment({ payment_type_id: 'credit_card', installments: 3 })], // installments at the cash price
    [financiado, approvedPayment({ payment_type_id: 'credit_card', installments: 1, transaction_amount: 17700 })], // one payment at the list price
    [financiado, approvedPayment({ payment_type_id: 'credit_card', installments: 3, transaction_amount: 15300 })], // cash amount in installments
    [financiado, approvedPayment({ payment_type_id: 'debit_card', installments: 3, transaction_amount: 17700 })],
    [contado, approvedPayment({ currency_id: 'USD' })],
    [contado, approvedPayment({ payment_type_id: 'ticket' })],
  ];
  for (const [order, payment] of cases) {
    const { deps, calls } = harness(order, payment);
    assert.equal(await mp.settleMercadoPagoPayment('600', deps), 'review', JSON.stringify(payment));
    assert.equal(calls.approve.length, 0);
    assert.equal(calls.review.length, 1);
  }
  const orphan = harness(contado, approvedPayment({ external_reference: 'SF-999999' }));
  assert.equal(await mp.settleMercadoPagoPayment('601', orphan.deps), 'review');
  assert.equal(orphan.calls.review[0].reference, null);
  // The charged amount travels with the review so the administrator knows what a refund would return.
  const underpaid = harness(contado, approvedPayment({ transaction_amount: 15299.99 }));
  await mp.settleMercadoPagoPayment("602", underpaid.deps);
  assert.equal(underpaid.calls.review[0].amountCents, 1529999n);
});

test('rejected or pending payments confirm nothing; malformed ids and mismatched responses fail closed', async () => {
  for (const [status, outcome] of [['rejected', 'rejected'], ['pending', 'pending'], ['in_process', 'pending'], ['refunded', 'rejected'], ['cancelled', 'rejected']]) {
    const { deps, calls } = harness(contado, approvedPayment({ status }));
    assert.equal(await mp.settleMercadoPagoPayment('700', deps), outcome);
    assert.equal(calls.approve.length + calls.review.length, 0);
  }
  const { deps } = harness(contado, approvedPayment());
  await assert.rejects(mp.settleMercadoPagoPayment('12a', deps));
  await assert.rejects(mp.settleMercadoPagoPayment('700', { ...deps, fetchPayment: async () => ({ id: 1, ...approvedPayment() }) }), /inconsistente/);
});

// Orders API (GET /v1/orders/{id}): shapes taken from the Mercado Pago test environment on 26/11/2026.
const orderId = 'ORDTST01M8BZ0SJDRK3F6AH3085GVRGV';
const mpOrder = (over = {}, payment = {}) => ({ id: orderId, status: 'processed', status_detail: 'accredited', external_reference: 'SF-000123',
  total_amount: '17700.00', currency: 'ARS', ...over,
  transactions: { payments: [{ id: 'PAY01M8BZ0SJSVG219E2TWMZYH5CN', amount: '17700.00', paid_amount: '21189.00', status: 'processed', status_detail: 'accredited',
    payment_method: { id: 'master', type: 'credit_card', installments: 3 }, ...payment }] } });
function orderHarness(order, record) {
  const { deps, calls } = harness(order, {});
  return { calls, deps: { ...deps, fetchOrder: async () => record } };
}

test('an approved Orders API order confirms with the store amount, never the amount with Mercado Pago interest', async () => {
  const { deps, calls } = orderHarness(financiado, mpOrder());
  assert.equal(await mp.settleMercadoPagoOrder(orderId, deps), 'approved');
  assert.deepEqual(calls.approve, [{ reference: 'SF-000123', providerPaymentId: orderId, amountCents: B(1770000), installments: 3, method: 'credit_card' }]);
});

test('Orders API: pending and failed orders confirm nothing; mismatches and odd shapes go to review', async () => {
  for (const [over, outcome] of [[{ status: 'processing', status_detail: 'in_process' }, 'pending'], [{ status: 'action_required', status_detail: 'pending_challenge' }, 'pending'],
    [{ status: 'failed', status_detail: 'failed' }, 'rejected'], [{ status: 'canceled', status_detail: 'canceled' }, 'rejected'], [{ status: 'expired', status_detail: 'expired' }, 'rejected']]) {
    const { deps, calls } = orderHarness(financiado, mpOrder(over));
    assert.equal(await mp.settleMercadoPagoOrder(orderId, deps), outcome, JSON.stringify(over));
    assert.equal(calls.approve.length + calls.review.length, 0);
  }
  const reviews = [
    mpOrder({ total_amount: '15300.00' }, { amount: '15300.00' }), // cash amount in installments
    mpOrder({}, { payment_method: { id: 'master', type: 'credit_card', installments: 1 } }),
    mpOrder({}, { payment_method: { id: 'debmaster', type: 'debit_card', installments: 3 } }),
    mpOrder({ currency: 'USD' }),
    mpOrder({ total_amount: '35400.00' }), // total differs from its only transaction
    { ...mpOrder(), transactions: { payments: [] } },
    { ...mpOrder(), transactions: { payments: [...mpOrder().transactions.payments, ...mpOrder().transactions.payments] } },
    mpOrder({}, { status: 'failed' }), // order says processed but its transaction does not
  ];
  for (const record of reviews) {
    const { deps, calls } = orderHarness(financiado, record);
    assert.equal(await mp.settleMercadoPagoOrder(orderId, deps), 'review', JSON.stringify(record));
    assert.equal(calls.approve.length, 0);
  }
  const { deps } = orderHarness(financiado, mpOrder());
  await assert.rejects(mp.settleMercadoPagoOrder('ordtst01', deps), /inválida/);
  await assert.rejects(mp.settleMercadoPagoOrder('ORDTST01M8BZ0SJDRK3F6AH3085GVRGW', deps), /inconsistente/);
});
