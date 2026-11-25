import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

// Migration 202611260001 (stored cash prices) and its rollback on an isolated PostgreSQL (WASM). Synthetic data only.
const root = resolve(import.meta.dirname, '..');
const runtimePath = process.env.SFSTORE_TEST_PGLITE_MODULE;
const read = file => readFileSync(join(root, file), 'utf8');
const migration = read('supabase/migrations/202611260001_stored_cash_prices.sql');
const rollback = read('reports/stored-cash-prices-rollback.sql');

test('the migration adds no payment method, keeps combos on 25% and the rollback restores the 75% rule', () => {
  assert.doesNotMatch(migration, /checkout_mercadopago|paymentMethod|priceMode/);
  assert.doesNotMatch(migration, /update public\.products set (price|transfer_price|stock)/i);
  assert.match(migration, /round\(p_list \* 0\.75, 2\)/);
  assert.match(rollback, /'final:=case when p_discounted then round\(p\.price\*0\.75,2\) else p\.price end;'/);
});

describe('stored cash prices / isolated PostgreSQL WASM', { skip: !runtimePath, concurrency: false }, () => {
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
    const manifest = JSON.parse(read('staging/migration-manifest.json'));
    for (const entry of manifest.applicationOrder) {
      if (entry.source.endsWith('202611260001_stored_cash_prices.sql')) continue;
      try { await db.exec(read(entry.stagingFile)); } catch (error) { throw new Error(entry.source + ': ' + error.message); }
    }
    await db.exec(read('staging/supabase/seed.sql'));
  });
  after(async () => { await db?.close(); });

  async function product({ price = 17700, cash = null, stock = 5 } = {}) {
    const id = randomUUID();
    await q("insert into products(id,category_id,name,slug,short_description,price,transfer_price,stock,status) values($1::uuid,$2,'SYNTHETIC',$1::text,'Synthetic only',$3,$4,$5,'active')", [id, category, price, cash, stock]);
    return id;
  }
  const checkout = item => one('select create_checkout_atomic($1,$2,$3) result', [randomUUID(), randomUUID(),
    JSON.stringify({ customer: { fullName: 'Synthetic Buyer', phone: 'synthetic-only' }, shipping: { method: 'pickup' }, paymentMethod: 'transfer', items: [{ productId: item, quantity: 1 }] })]).then(r => Number(r.result.total));
  const cash = async id => Number((await one('select catalog_cash_price($1) value', [id])).value);
  const save = async (id, changes) => {
    const version = (await one('select get_product_save_version($1) v', [id])).v;
    const product = { category_id: category, name: 'SYNTHETIC', slug: id, short_description: 'Synthetic only', description: null,
      price: 17700, transfer_price: null, compare_at_price: null, cost: null, sku: null, featured: false, status: 'active', ...changes };
    return one('select update_product_atomic($1,$2,$3,$4) result', [randomUUID(), id, version, JSON.stringify({ product, attributes: [], images: [] })]);
  };

  test('existing products keep exactly 75% of list, whatever their legacy stored value', async () => {
    const legacy = await product({ cash: 15300 }), empty = await product({ cash: null });
    await db.exec(migration);
    for (const id of [legacy, empty]) {
      assert.equal(await checkout(id), 13275);
      assert.equal(await cash(id), 13275);
    }
    assert.equal(Number((await one('select cash_price from public_catalog_cash_prices where id=$1', [legacy])).cash_price), 13275);
  });

  test('an admin calculator save charges the saved cash price; a later list change without approval returns to 75%', async () => {
    const id = await product({ cash: 15300 });
    await save(id, { price: 64500, transfer_price: 56100, cash_price_approved: true });
    assert.ok((await one('select cash_price_approved_at from products where id=$1', [id])).cash_price_approved_at);
    assert.equal(await checkout(id), 56100);
    assert.equal(await cash(id), 56100);
    await save(id, { price: 64500, transfer_price: 56100 }); // legacy form, prices untouched: approval kept
    assert.equal(await cash(id), 56100);
    await q('update products set price=70000 where id=$1', [id]); // import, sheet sync, quick action
    assert.equal((await one('select cash_price_approved_at from products where id=$1', [id])).cash_price_approved_at, null);
    assert.equal(await cash(id), 52500);
    assert.equal(await checkout(id), 52500);
  });

  test('invalid approvals are refused and leave the product unchanged', async () => {
    const id = await product();
    await assert.rejects(save(id, { price: 17700, transfer_price: 18000, cash_price_approved: true }), /products_approved_cash_price_valid/);
    await assert.rejects(save(id, { price: 17700, transfer_price: null, cash_price_approved: true }), /products_approved_cash_price_valid/);
    await assert.rejects(save(id, { price: 17700, transfer_price: 15000, cash_price_approved: false }), /PRODUCT_INVALID_FIELDS/);
    assert.equal(await cash(id), 13275);
  });

  test('store sales charge the same cash price as the web', async () => {
    const id = await product({ cash: 15300 });
    await save(id, { price: 17700, transfer_price: 15300, cash_price_approved: true });
    const lines = (await one("select resolve_commercial_lines($1::jsonb,true,'store') r", [JSON.stringify([{ productId: id, quantity: 1 }])])).r;
    assert.equal(Number(lines[0].unitPrice), 15300);
    const list = (await one("select resolve_commercial_lines($1::jsonb,false,'store') r", [JSON.stringify([{ productId: id, quantity: 1 }])])).r;
    assert.equal(Number(list[0].unitPrice), 17700);
  });

  test('anon reads the public cash price but never transfer_price', async () => {
    const id = await product({ cash: 15300 });
    await db.exec('set role anon');
    try {
      await assert.rejects(q('select transfer_price from products limit 1'));
      assert.equal(Number((await one('select cash_price from public_catalog_cash_prices where id=$1', [id])).cash_price), 13275);
    } finally { await db.exec('reset role'); }
  });

  test('the rollback restores 75% for every product, approved ones included', async () => {
    const id = await product({ cash: 15300 });
    await save(id, { price: 17700, transfer_price: 15300, cash_price_approved: true });
    await db.exec(rollback);
    assert.equal(await checkout(id), 13275);
    assert.equal(await one("select to_regclass('public.public_catalog_cash_prices') v").then(r => r.v), null);
    await save(id, { price: 17700, transfer_price: 15300 });
    await assert.rejects(save(id, { price: 17700, transfer_price: 15300, cash_price_approved: true }), /PRODUCT_INVALID_FIELDS/);
  });
});
