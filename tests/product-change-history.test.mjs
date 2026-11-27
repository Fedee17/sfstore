// Product change history: every price, status and visibility change on a product, from any write path.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { adminMoney } from '../lib/admin/money.ts';
import { buildProductHistory, PRODUCT_HISTORY_FIELDS, PRODUCT_HISTORY_LIMIT } from '../lib/admin/product-history.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = 'supabase/migrations/202611290001_product_change_history.sql';
const rollback = 'reports/product-change-history-rollback.sql';
const event = (id, at, field, from, to, source = 'app') => ({ id, changed_at: at, field, old_value: from, new_value: to, source });

test('one save is one entry; newest first; values read like the admin shows them', () => {
  const h = buildProductHistory([
    event(1, '2026-11-20T15:00:00Z', 'status', 'draft', 'active', 'database'),
    event(2, '2026-11-25T18:30:00Z', 'price', '10000.00', '12500.00'),
    event(3, '2026-11-25T18:30:00Z', 'transfer_price', null, '9375.00'),
    event(4, '2026-11-25T18:30:00Z', 'web_visible', 'false', 'true'),
    event(5, '2026-11-25T18:30:00Z', 'commercial_blocked', 'true', 'false'),
  ]);
  assert.equal(h.length, 2);
  assert.equal(h[0].source, 'Desde el admin o la tienda');
  assert.deepEqual(h[0].changes.map(c => [c.label, c.from, c.to]), [
    ['Precio lista', adminMoney('10000.00'), adminMoney('12500.00')],
    ['Precio especial transferencia/efectivo', 'Sin cargar', adminMoney('9375.00')],
    ['Visible en la web', 'No', 'Sí'],
    ['Bloqueo comercial', 'Bloqueado', 'Habilitado'],
  ]);
  assert.equal(h[1].source, 'Directo en la base de datos');
  assert.deepEqual(h[1].changes.map(c => [c.label, c.from, c.to]), [['Estado', 'Borrador', 'Activo']]);
  assert.match(h[0].when, /25\/11\/2026|25\/11\/26/);
});

test('unknown fields or sources are shown as such, never hidden', () => {
  const [entry] = buildProductHistory([event(1, '2026-11-25T18:30:00Z', 'mystery', 'a', 'b', 'other')]);
  assert.equal(entry.source, 'Origen desconocido');
  assert.deepEqual([entry.changes[0].label, entry.changes[0].from, entry.changes[0].to], ['mystery', 'a', 'b']);
});

test('the migration tracks exactly the history fields and writes no product data', () => {
  const sql = read(migration);
  for (const field of PRODUCT_HISTORY_FIELDS) assert.match(sql, new RegExp(`'${field}'`));
  assert.doesNotMatch(sql, /'stock'|\bstock\b\s*(,|\))/, 'stock already has its own audited movements');
  assert.doesNotMatch(sql, /^\s*(insert into|update|delete from) public\.products\b/im);
  assert.match(sql, /revoke all on public\.product_change_events from public, anon, authenticated, service_role;/);
  assert.match(sql, /grant select on public\.product_change_events to service_role;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*product_change_events/i);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = pg_catalog, public/);
  assert.ok(PRODUCT_HISTORY_LIMIT > 0);
});

test('the migration is the exact LF artifact registered in the staging manifest, with a rollback', () => {
  const bytes = readFileSync(resolve(root, migration));
  const entry = JSON.parse(read('staging/migration-manifest.json')).applicationOrder.find(e => e.source === migration);
  assert.ok(entry, 'registered in staging/migration-manifest.json');
  assert.equal(bytes.includes(13), false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256);
  assert.equal(entry.stagingSha256, entry.sourceSha256);
  const undo = read(rollback);
  assert.match(undo, /drop trigger if exists products_change_history on public\.products;/);
  assert.match(undo, /drop function if exists public\.record_product_changes\(\);/);
  assert.match(undo, /drop table if exists public\.product_change_events;/);
});

test('the editor shows the history and fails closed while the migration is pending', () => {
  const page = read('app/admin/productos/[id]/editar/page.tsx');
  assert.match(page, /<Suspense fallback=\{<ProductHistoryFallback \/>\}>\s*<ProductHistory productId=\{product\.id\} \/>\s*<\/Suspense>/);
  const service = read('services/product-history.ts');
  assert.match(service, /await requireAdminSession\(\);\s*const client = getSupabaseAdminClient\(\);/);
  assert.match(service, /\.limit\(PRODUCT_HISTORY_LIMIT\)/);
  const view = read('components/admin/products/product-history.tsx');
  assert.match(view, /No pudimos leer el historial/);
  assert.match(view, /Todavía no hay cambios registrados/);
});

const runtimePath = process.env.SFSTORE_TEST_PGLITE_MODULE;
describe('product change history / isolated PostgreSQL WASM', { skip: !runtimePath, concurrency: false }, () => {
  let db;
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const category = '11111111-1111-4111-8111-111111111111';
  before(async () => {
    const runtime = createRequire(join(runtimePath, 'package.json'));
    const { PGlite } = runtime('@electric-sql/pglite');
    const { pgcrypto } = runtime('@electric-sql/pglite/contrib/pgcrypto');
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(read('tests/fixtures/storage-permissions.sql'));
    for (const entry of JSON.parse(read('staging/migration-manifest.json')).applicationOrder) {
      if (entry.source === migration) continue;
      await db.exec(read(entry.source));
    }
    await db.exec(read('staging/supabase/seed.sql'));
    await db.exec(read(migration));
  });
  after(async () => { await db?.close(); });
  const product = async () => {
    const id = randomUUID();
    await q("insert into products(id,category_id,name,slug,short_description,price,stock,status) values($1::uuid,$2,'SYNTHETIC',$1::text,'Synthetic only',1000,1,'draft')", [id, category]);
    return id;
  };
  const events = id => q('select field,old_value,new_value,source from product_change_events where product_id=$1 order by field', [id]);

  test('records only tracked fields that really changed, grouped by transaction', async () => {
    const id = await product();
    assert.deepEqual(await events(id), []);
    await q("update products set price=1200, status='active', stock=5, name='SYNTHETIC 2' where id=$1", [id]);
    assert.deepEqual(await events(id), [
      { field: 'price', old_value: '1000.00', new_value: '1200.00', source: 'database' },
      { field: 'status', old_value: 'draft', new_value: 'active', source: 'database' },
    ]);
    await q('update products set price=1200 where id=$1', [id]);
    assert.equal((await events(id)).length, 2, 'a no-op write records nothing');
    const [{ n }] = await q('select count(distinct changed_at)::int n from product_change_events where product_id=$1', [id]);
    assert.equal(n, 1);
  });

  test('a write made by the app (service_role request) is labeled as such', async () => {
    const id = await product();
    await q('begin');
    await q(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    await q('update products set web_visible=false where id=$1', [id]);
    await q('commit');
    assert.deepEqual((await events(id)).map(e => e.source), ['app']);
  });

  test('public roles cannot read or write the history; the app can only read it', async () => {
    for (const role of ['anon', 'authenticated']) {
      await q('begin');
      await q(`set local role ${role}`);
      await assert.rejects(q('select * from product_change_events'), e => e.code === '42501');
      await q('rollback');
    }
    await q('begin');
    await q('set local role service_role');
    await q('select count(*) from product_change_events');
    await assert.rejects(q("insert into product_change_events(product_id,field,source) values(gen_random_uuid(),'price','app')"), e => e.code === '42501');
    await q('rollback');
  });

  test('the rollback removes everything and products keep saving', async () => {
    await db.exec(read(rollback));
    const id = await product();
    await q('update products set price=1500 where id=$1', [id]);
    assert.deepEqual(await q("select to_regclass('public.product_change_events') t"), [{ t: null }]);
  });
});
