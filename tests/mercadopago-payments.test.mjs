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
});

test('Checkout API charges the stored financiado total in 2 or 3 installments only', () => {
  for (const installments of [2, 3]) {
    const { body, idempotencyKey } = mp.financedPayment(financiado, { ...card, installments });
    assert.equal(body.transaction_amount, 17700);
    assert.equal(body.installments, installments);
    assert.equal(body.external_reference, 'SF-000123');
    assert.match(idempotencyKey, new RegExp(`^SF-000123:${installments}:[0-9a-f]{24}$`));
    assert.notEqual(idempotencyKey, mp.financedPayment(financiado, { ...card, token: card.token + "x", installments }).idempotencyKey); // new token, new attempt
  }
  for (const installments of [1, 4, 6, 2.5, Number.NaN]) assert.throws(() => mp.financedPayment(financiado, { ...card, installments }), /cuotas/);
  assert.throws(() => mp.financedPayment(contado, card), /lista/);
  assert.throws(() => mp.financedPayment(financiado, { ...card, token: '"; drop' }));
  assert.throws(() => mp.financedPayment(financiado, { ...card, issuerId: 'abc' }));
  // The browser cannot choose the amount: extra fields are ignored by construction.
  assert.equal(mp.financedPayment(financiado, { ...card, transaction_amount: 1 }).body.transaction_amount, 17700);
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
});

function harness(order, payment) {
  const calls = { approve: [], review: [] };
  const deps = {
    fetchPayment: async id => ({ id: Number(id), ...payment }),
    loadOrder: async reference => (order && reference === order.reference ? order : null),
    approve: async input => { calls.approve.push(input); },
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
});

test('rejected or pending payments confirm nothing; malformed ids and mismatched responses fail closed', async () => {
  for (const status of ['rejected', 'pending', 'in_process', 'refunded']) {
    const { deps, calls } = harness(contado, approvedPayment({ status }));
    assert.equal(await mp.settleMercadoPagoPayment('700', deps), 'ignored');
    assert.equal(calls.approve.length + calls.review.length, 0);
  }
  const { deps } = harness(contado, approvedPayment());
  await assert.rejects(mp.settleMercadoPagoPayment('12a', deps));
  await assert.rejects(mp.settleMercadoPagoPayment('700', { ...deps, fetchPayment: async () => ({ id: 1, ...approvedPayment() }) }), /inconsistente/);
});
