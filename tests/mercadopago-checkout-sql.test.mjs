import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { Client } from 'pg';

// Synthetic PostgreSQL only. A local native cluster additionally exercises independent connections.
const root = resolve(import.meta.dirname, '..');
const runtimePath = process.env.SFSTORE_TEST_PGLITE_MODULE;
const port = Number(process.env.SFSTORE_TEST_MP_PG_PORT || 0);
const read = file => readFileSync(join(root, file), 'utf8');

const localClient = async () => {
  assert.ok(Number.isInteger(port) && port > 1024 && port <= 65535);
  const client = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'sfstore_mp_synthetic', ssl: false, connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
};

describe(`Mercado Pago checkout / isolated PostgreSQL ${port ? 'native' : 'WASM'}`, { skip: !runtimePath && !port, concurrency: false }, () => {
  let db;
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const one = async (sql, args = []) => (await q(sql, args))[0];
  const category = '11111111-1111-4111-8111-111111111111';
  before(async () => {
    if (port) {
      db = await localClient();
      db.exec = text => db.query(text);
      db.close = () => db.end();
      assert.equal((await one('select current_database() name')).name, 'sfstore_mp_synthetic');
      assert.equal((await one("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m','p')")).n, 0);
    } else {
      const runtime = createRequire(join(runtimePath, 'package.json'));
      const { PGlite } = runtime('@electric-sql/pglite');
      const { pgcrypto } = runtime('@electric-sql/pglite/contrib/pgcrypto');
      db = new PGlite({ extensions: { pgcrypto } });
    }
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(read('tests/fixtures/storage-permissions.sql'));
    for (const entry of JSON.parse(read('staging/migration-manifest.json')).applicationOrder) {
      try { await db.exec(read(entry.stagingFile)); } catch (error) { throw new Error(entry.source + ': ' + error.message); }
    }
    await db.exec(read('staging/supabase/seed.sql'));
  });
  after(async () => { await db?.close(); });

  // Approved stored cash price (admin calculator) unless cash is null: then the 75% rule applies.
  async function product({ price = 17700, cash = 15300, stock = 5 } = {}) {
    const id = randomUUID();
    await q(`insert into products(id,category_id,name,slug,short_description,price,transfer_price,cash_price_approved_at,stock,status)
      values($1::uuid,$2,'SYNTHETIC',$1::text,'Synthetic only',$3,$4,case when $4::numeric is null then null else clock_timestamp() end,$5,'active')`, [id, category, price, cash, stock]);
    return id;
  }
  const enable = (on, installments = on) => q('update checkout_payment_settings set mercadopago_enabled=$1, mercadopago_installments_enabled=$2', [on, installments]);
  const checkout = (items, extra = {}) => one('select create_checkout_atomic($1,$2,$3) result', [randomUUID(), randomUUID(),
    JSON.stringify({ customer: { fullName: 'Synthetic Buyer', phone: 'synthetic-only' }, shipping: { method: 'pickup' }, paymentMethod: 'transfer',
      items: (Array.isArray(items) ? items : [items]).map(productId => ({ productId, quantity: 1 })), ...extra })]).then(r => r.result);
  const confirm = (paymentId, reference, amount, installments, method, currency = 'ARS') =>
    one('select confirm_checkout_mercadopago_payment($1,$2,$3,$4,$5,$6) result', [paymentId, reference, amount, installments, method, currency]).then(r => r.result);

  test('disabled by default: transfer keeps working, Mercado Pago and financiado are refused', async () => {
    const item = await product();
    const transfer = await checkout(item);
    assert.equal(Number(transfer.total), 15300);
    assert.equal(transfer.priceMode, 'contado');
    await assert.rejects(checkout(item, { paymentMethod: 'mercadopago' }), /CHECKOUT_PAYMENT_METHOD_DISABLED/);
    await assert.rejects(checkout(item, { priceMode: 'financiado' }), /CHECKOUT_INVALID_REQUEST/);
    // Mercado Pago on, installments off (production default until SFSTORE finances them): one payment only.
    await enable(true, false);
    assert.equal((await checkout(item, { paymentMethod: 'mercadopago' })).priceMode, 'contado');
    await assert.rejects(checkout(item, { paymentMethod: 'mercadopago', priceMode: 'financiado' }), /CHECKOUT_PAYMENT_METHOD_DISABLED/);
  });

  test('server prices each mode from stored values: contado = saved cash (or 75% if none), financiado = list', async () => {
    await enable(true);
    const approved = await product({ cash: 15300, stock: 4 }), legacy = await product({ price: 20000, cash: null, stock: 4 });
    const contado = await checkout([approved, legacy], { paymentMethod: 'mercadopago' });
    const financiado = await checkout([approved, legacy], { paymentMethod: 'mercadopago', priceMode: 'financiado' });
    assert.equal(Number(contado.total), 15300 + 15000);
    assert.equal(Number(financiado.total), 17700 + 20000);
    assert.equal(financiado.priceMode, 'financiado');
    assert.equal((await one('select metadata->>$2 m from orders where id=$1', [financiado.id, 'price_mode'])).m, 'financiado');
    assert.equal((await one('select stock from products where id=$1', [approved])).stock, 2); // both orders reserve
  });

  test('an exact approved payment confirms once; duplicated notifications are replays', async () => {
    await enable(true);
    const item = await product({ stock: 3 });
    const contado = await checkout(item, { paymentMethod: 'mercadopago' });
    const financiado = await checkout(item, { paymentMethod: 'mercadopago', priceMode: 'financiado' });
    assert.equal((await confirm('9001', contado.orderNumber, 15300, 1, 'debit_card')).status, 'approved');
    assert.deepEqual(await one('select status,payment_status from orders where id=$1', [contado.id]), { status: 'confirmed', payment_status: 'paid' });
    assert.equal((await confirm('9001', contado.orderNumber, 15300, 1, 'debit_card')).replayed, true);
    assert.equal((await confirm('ORDTST01M8BZ0SJDRK3F6AH3085GVRGV', financiado.orderNumber, 17700, 3, 'credit_card')).status, 'approved'); // Orders API id
    await assert.rejects(confirm('ord-lower', financiado.orderNumber, 17700, 3, 'credit_card'), /MERCADOPAGO_PAYMENT_INVALID/);
    assert.equal((await one("select count(*)::int n from order_payments where order_id=$1 and status='approved'", [contado.id])).n, 1);
    assert.equal((await one("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='sale'", [contado.id])).n, 1);
  });

  test('every mismatch between mode, amount, installments, method, currency or reservation goes to review', async () => {
    await enable(true);
    const item = await product({ stock: 30 });
    const order = mode => checkout(item, { paymentMethod: 'mercadopago', ...(mode ? { priceMode: mode } : {}) });
    const cases = [
      [await order(), 15299.99, 1, 'account_money'],
      [await order(), 17700, 1, 'credit_card'],
      [await order(), 15300, 3, 'credit_card'],
      [await order('financiado'), 17700, 1, 'credit_card'],
      [await order('financiado'), 15300, 3, 'credit_card'],
      [await order('financiado'), 17700, 3, 'debit_card'],
      [await order('financiado'), 17700, 6, 'credit_card'],
    ];
    let id = 9100;
    for (const [o, amount, installments, method] of cases) {
      const result = await confirm(String(id++), o.orderNumber, amount, installments, method);
      assert.equal(result.status, 'review', JSON.stringify([amount, installments, method]));
      assert.equal(result.kind, 'review'); // payable order, different charge: inspect
      assert.deepEqual(await one('select status,payment_status from orders where id=$1', [o.id]), { status: 'pending', payment_status: 'pending' });
    }
    assert.equal((await confirm('9200', (await order()).orderNumber, 15300, 1, 'account_money', 'USD')).status, 'review');
    const twice = await order();
    assert.equal((await confirm('9300', twice.orderNumber, 15300, 1, 'account_money')).status, 'approved');
    const second = await confirm('9301', twice.orderNumber, 15300, 1, 'account_money'); // second charge: refund decision
    assert.deepEqual([second.status, second.kind], ['review', 'refund']);
    assert.equal((await one("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='sale'", [twice.id])).n, 1); // stock and sale untouched
    assert.equal((await one("select count(*)::int n from order_payments where order_id=$1", [twice.id])).n, 1);
    const late = await order();
    await q("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1", [late.id]);
    assert.equal((await confirm('9400', late.orderNumber, 15300, 1, 'account_money')).kind, 'refund');
    await assert.rejects(q("select transition_checkout_atomic($1,'expired')", [late.id]), /CHECKOUT_PAID_RESERVATION_PROTECTED/);
    const transfer = await checkout(item);
    assert.equal((await confirm('9500', transfer.orderNumber, Number(transfer.total), 1, 'account_money')).status, 'review');
    assert.equal((await confirm('9501', 'SF-unknown', 15300, 1, 'account_money')).status, 'review');
    assert.deepEqual(await one("select review_kind from checkout_mercadopago_payments where provider_payment_id='9501'"), { review_kind: 'refund' });
    // A mismatch reported by the application records what was charged (or nothing when unreadable) and confirms nothing.
    await q("select review_checkout_mercadopago_payment('ORDTST01REVIEWAMOUNT',$1,'El importe no coincide.',100)", [transfer.orderNumber]);
    await q("select review_checkout_mercadopago_payment('ORDTST01REVIEWNOAMOUNT',$1,'Sin datos.',null)", [transfer.orderNumber]);
    assert.deepEqual((await q("select amount, review_kind from checkout_mercadopago_payments where provider_payment_id like 'ORDTST01REVIEW%' order by provider_payment_id")),
      [{ amount: "100.00", review_kind: "review" }, { amount: null, review_kind: "review" }]);
    const financed = await order('financiado');
    const reservedStock = await one('select stock from products where id=$1', [item]);
    for (const [providerId, amount] of [['ORDREVIEWUNDERPAID', 17699.99], ['ORDREVIEWSURCHARGE', 21189]]) {
      await q("select review_checkout_mercadopago_payment($1,$2,'El importe pagado no coincide.',$3)", [providerId, financed.orderNumber, amount]);
    }
    assert.deepEqual(await one('select status,payment_status from orders where id=$1', [financed.id]), { status: 'pending', payment_status: 'pending' });
    assert.equal((await one("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='sale'", [financed.id])).n, 0);
    assert.deepEqual(await one('select stock from products where id=$1', [item]), reservedStock);
    await assert.rejects(q("insert into order_payments(order_id,method,amount,status,reference) values($1,'mercadopago',15300,'approved','mercadopago:forged')", [cases[0][0].id]), /CHECKOUT_MANUAL_PAYMENT_REQUIRED/);
  });

  test('an unpaid Mercado Pago order releases its reservation on expiry; disabling blocks new confirmations', async () => {
    await enable(true);
    const item = await product({ stock: 2 });
    const pending = await checkout(item, { paymentMethod: 'mercadopago' });
    assert.equal((await one('select stock from products where id=$1', [item])).stock, 1);
    await q("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1", [pending.id]);
    await q("select transition_checkout_atomic($1,'expired')", [pending.id]);
    assert.equal((await one('select stock from products where id=$1', [item])).stock, 2);
    const other = await checkout(item, { paymentMethod: 'mercadopago' });
    await enable(false);
    await assert.rejects(confirm('9600', other.orderNumber, 15300, 1, 'account_money'), /CHECKOUT_PAYMENT_METHOD_DISABLED/);
  });

  test('a paid order refuses new attempts, closes its links and keeps duplicates until an administrator records them', async () => {
    await enable(true);
    const item = await product({ stock: 3 });
    const order = await checkout(item, { paymentMethod: 'mercadopago' });
    const buyer = (await one('select buyer_id from checkout_operations where order_id=$1', [order.id])).buyer_id;
    const payable = () => one('select checkout_mercadopago_order($1,$2) r', [buyer, order.id]).then(r => r.r);
    assert.equal((await payable()).preferenceUrl, null);
    const pref = '3458578784-ecaacd13-b6ea-48da-a272-71280f1a69f5';
    await q('select record_checkout_mercadopago_preference($1,$2,$3)', [order.id, pref, 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=x']);
    assert.match((await payable()).preferenceUrl, /^https:/); // one open link per order is reused
    await assert.rejects(q('select record_checkout_mercadopago_preference($1,$2,$3)', [order.id, '3458578784-00000000-0000-4000-8000-000000000000', 'https://x']));
    assert.equal((await confirm('9700', order.orderNumber, 15300, 1, 'credit_card')).status, 'approved');
    await assert.rejects(payable(), /CHECKOUT_ALREADY_PAID/);
    assert.deepEqual((await q('select open_checkout_mercadopago_preferences($1) id', [order.id])).map(r => r.id), [pref]);
    await q('select expire_checkout_mercadopago_preference($1)', [pref]);
    assert.equal((await q('select open_checkout_mercadopago_preferences($1) id', [order.id])).length, 0);
    assert.equal((await confirm('9701', order.orderNumber, 15300, 1, 'credit_card')).kind, 'refund');
    const admin = randomUUID();
    await assert.rejects(q("select resolve_checkout_mercadopago_review('9701',$1,'x')", [admin]), /MERCADOPAGO_REVIEW_INVALID/);
    assert.equal((await one("select resolve_checkout_mercadopago_review('9701',$1,'Devuelto en Mercado Pago') r", [admin])).r.status, 'resolved');
    await assert.rejects(q("select resolve_checkout_mercadopago_review('9701',$1,'otra vez')", [admin]), /MERCADOPAGO_REVIEW_NOT_FOUND/);
    await assert.rejects(q("select resolve_checkout_mercadopago_review('9700',$1,'aprobado')", [admin]), /MERCADOPAGO_REVIEW_NOT_FOUND/); // approvals are not reviews
    assert.deepEqual(await one('select status,payment_status from orders where id=$1', [order.id]), { status: 'confirmed', payment_status: 'paid' });
    // Installments switched off after an order was created: no new financed attempt is accepted.
    const financed = await checkout(item, { paymentMethod: 'mercadopago', priceMode: 'financiado' });
    await enable(true, false);
    const financedBuyer = (await one('select buyer_id from checkout_operations where order_id=$1', [financed.id])).buyer_id;
    await assert.rejects(q('select checkout_mercadopago_order($1,$2)', [financedBuyer, financed.id]), /CHECKOUT_PAYMENT_METHOD_DISABLED/);
  });

  test('buyers and anon never reach the payment tables or functions', async () => {
    await db.exec('set role anon');
    try {
      await assert.rejects(q('select * from checkout_mercadopago_payments'));
      await assert.rejects(q('select * from checkout_payment_settings'));
      await assert.rejects(q('select * from checkout_mercadopago_preferences'));
      await assert.rejects(q("select resolve_checkout_mercadopago_review('1',gen_random_uuid(),'abc')"));
      await assert.rejects(q("select confirm_checkout_mercadopago_payment('1','x',1,1,'account_money','ARS')"));
      await assert.rejects(q('select * from checkout_mercadopago_card_attempts'));
      await assert.rejects(q('select claim_checkout_mercadopago_card_attempt(gen_random_uuid(),gen_random_uuid())'));
    } finally { await db.exec('reset role'); }
  });

  async function financedCheckout() {
    await enable(true);
    const item = await product({ stock: 2 });
    const order = await checkout(item, { paymentMethod: 'mercadopago', priceMode: 'financiado' });
    const buyer = (await one('select buyer_id from checkout_operations where order_id=$1', [order.id])).buyer_id;
    return { item, order, buyer };
  }

  const claim = (buyer, orderId, client = db) => client.query('select claim_checkout_mercadopago_card_attempt($1,$2) r', [buyer, orderId]).then(result => result.rows[0].r);
  const bind = (buyer, orderId, lease, providerId) => one('select bind_checkout_mercadopago_card_attempt($1,$2,$3,$4) r', [buyer, orderId, lease, providerId]).then(result => result.r);
  const ageLease = orderId => q("update checkout_mercadopago_card_attempts set lease_until=clock_timestamp()-interval '1 second' where order_id=$1", [orderId]);

  test('an expired unbound lease cannot authorize a charge, including after another submission', async () => {
    const { order, buyer } = await financedCheckout();
    const first = await claim(buyer, order.id);
    await assert.rejects(claim(randomUUID(), order.id), /CHECKOUT_NOT_FOUND/);
    assert.deepEqual(await claim(buyer, order.id), { busy: true });
    await ageLease(order.id);
    const second = await claim(buyer, order.id);
    assert.notEqual(second.attemptId, first.attemptId);
    assert.equal(second.providerOrderId, null);
    assert.equal(await bind(buyer, order.id, first.leaseId, 'ORDSTALEATTEMPT'), false);
    assert.equal(await bind(buyer, order.id, second.leaseId, 'ORDCURRENTATTEMPT'), true);
    assert.equal(await bind(buyer, order.id, second.leaseId, 'ORDINDEPENDENTCHARGE'), false);
    await ageLease(order.id);
    const recovery = await claim(buyer, order.id);
    assert.equal(recovery.attemptId, second.attemptId);
    assert.equal(recovery.providerOrderId, 'ORDCURRENTATTEMPT');
    assert.notEqual(recovery.leaseId, second.leaseId);
    await q('select release_checkout_mercadopago_card_attempt($1,$2,$3)', [order.id, second.leaseId, recovery.providerOrderId]);
    assert.deepEqual(await claim(buyer, order.id), { busy: true });
  });

  test('independent connections elect a single attempt and settle duplicate notifications exactly once', { skip: !port }, async () => {
    const { order, item, buyer } = await financedCheckout();
    const other = await localClient();
    const second = await localClient();
    try {
      await Promise.all([other.query('set role service_role'), second.query('set role service_role')]);
      const results = await Promise.all([claim(buyer, order.id, other), claim(buyer, order.id, second)]);
      assert.equal(results.filter(result => result.busy).length, 1);
      const elected = results.find(result => !result.busy);
      const providerId = 'ORDCONCURRENTATTEMPT';
      assert.equal(await bind(buyer, order.id, elected.leaseId, providerId), true);
      const settle = client => client.query('select confirm_checkout_mercadopago_payment($1,$2,17700,3,$3,$4) r', [providerId, order.orderNumber, 'credit_card', 'ARS']).then(result => result.rows[0].r);
      const settled = await Promise.all([settle(other), settle(second)]);
      assert.equal(settled.filter(result => result.replayed).length, 1);
      assert.ok(settled.every(result => result.status === 'approved'));
      assert.equal((await one("select count(*)::int n from order_payments where order_id=$1 and status='approved'", [order.id])).n, 1);
      assert.equal((await one("select count(*)::int n from inventory_movements where order_id=$1 and movement_type='sale'", [order.id])).n, 1);
      assert.equal((await one('select stock from products where id=$1', [item])).stock, 1);
      await assert.rejects(claim(buyer, order.id), /CHECKOUT_ALREADY_PAID/);
    } finally { await Promise.all([other.end(), second.end()]); }
  });
});
