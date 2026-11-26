import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

// Migration 202611270001 (Mercado Pago checkout) on an isolated PostgreSQL (WASM). Synthetic data only, no network.
const root = resolve(import.meta.dirname, '..');
const runtimePath = process.env.SFSTORE_TEST_PGLITE_MODULE;
const read = file => readFileSync(join(root, file), 'utf8');

describe('Mercado Pago checkout / isolated PostgreSQL WASM', { skip: !runtimePath, concurrency: false }, () => {
  let db;
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const one = async (sql, args = []) => (await q(sql, args))[0];
  const category = '11111111-1111-4111-8111-111111111111';
  before(async () => {
    const runtime = createRequire(join(runtimePath, 'package.json'));
    const { PGlite } = runtime('@electric-sql/pglite');
    const { pgcrypto } = runtime('@electric-sql/pglite/contrib/pgcrypto');
    db = new PGlite({ extensions: { pgcrypto } });
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
  const enable = on => q('update checkout_payment_settings set mercadopago_enabled=$1', [on]);
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
    assert.equal((await confirm('9002', financiado.orderNumber, 17700, 3, 'credit_card')).status, 'approved');
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
      assert.equal((await confirm(String(id++), o.orderNumber, amount, installments, method)).status, 'review', JSON.stringify([amount, installments, method]));
      assert.deepEqual(await one('select status,payment_status from orders where id=$1', [o.id]), { status: 'pending', payment_status: 'pending' });
    }
    assert.equal((await confirm('9200', (await order()).orderNumber, 15300, 1, 'account_money', 'USD')).status, 'review');
    const twice = await order();
    assert.equal((await confirm('9300', twice.orderNumber, 15300, 1, 'account_money')).status, 'approved');
    assert.equal((await confirm('9301', twice.orderNumber, 15300, 1, 'account_money')).status, 'review'); // second charge: refund decision
    const late = await order();
    await q("update checkout_operations set expires_at=clock_timestamp()-interval '1 second' where order_id=$1", [late.id]);
    assert.equal((await confirm('9400', late.orderNumber, 15300, 1, 'account_money')).status, 'review');
    await assert.rejects(q("select transition_checkout_atomic($1,'expired')", [late.id]), /CHECKOUT_PAID_RESERVATION_PROTECTED/);
    const transfer = await checkout(item);
    assert.equal((await confirm('9500', transfer.orderNumber, Number(transfer.total), 1, 'account_money')).status, 'review');
    assert.equal((await confirm('9501', 'SF-unknown', 15300, 1, 'account_money')).status, 'review');
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

  test('buyers and anon never reach the payment tables or functions', async () => {
    await db.exec('set role anon');
    try {
      await assert.rejects(q('select * from checkout_mercadopago_payments'));
      await assert.rejects(q('select * from checkout_payment_settings'));
      await assert.rejects(q("select confirm_checkout_mercadopago_payment('1','x',1,1,'account_money','ARS')"));
    } finally { await db.exec('reset role'); }
  });
});
