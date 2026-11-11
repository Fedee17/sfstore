import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';
import { Client } from 'pg';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = 'supabase/migrations/202611110001_revoke_public_transfer_price.sql';
const manifest = JSON.parse(read('staging/migration-manifest.json')).applicationOrder;

test('SEC-02 SQL is the exact LF artifact registered in the staging manifest', () => {
  const bytes = readFileSync(resolve(root, migration));
  const entry = manifest.find(e => e.source === migration);
  assert.ok(entry, 'migration must be registered in staging/migration-manifest.json');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256);
  assert.equal(bytes.includes(13), false);
});

test('SEC-02 only revokes transfer_price and never touches stock, sku or price', () => {
  const sql = read(migration);
  assert.match(sql, /revoke select \(transfer_price\) on public\.products from anon, authenticated;/);
  assert.doesNotMatch(sql, /grant /i);
  assert.doesNotMatch(sql, /revoke select \((?:[^)]*\b(?:stock|sku|price)\b)[^)]*\)/);
});

const docker = process.env.SFSTORE_TEST_DOCKER;
describe('SEC-02 public transfer price / isolated PostgreSQL 17.6', { skip: !docker, concurrency: false, timeout: 180000 }, () => {
  let db, container;
  const cmd = args => {
    const r = spawnSync(docker, args, { encoding: 'utf8', windowsHide: true, timeout: 90000 });
    assert.equal(r.status, 0, r.stderr || r.error?.message);
    return r.stdout.trim();
  };
  const q = async (text, values = []) => (await db.query(text, values)).rows;
  async function asRole(role, text) {
    await q('begin');
    try { await q(`set local role ${role}`); return await q(text); }
    finally { await q('rollback'); }
  }
  async function denied(role, text) {
    await assert.rejects(asRole(role, text), error => error.code === '42501');
  }
  before(async () => {
    container = cmd(['run', '-d', '--rm', '--name', `sfstore-sec02-${randomUUID().slice(0, 8)}`, '--label', 'sfstore.synthetic=sec02', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'postgres:17.6']);
    const port = Number(cmd(['port', container, '5432/tcp']).split(':').at(-1));
    for (let i = 0; i < 80; i++) {
      const c = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
      try { await c.connect(); db = c; break; } catch { await c.end(); await delay(250); }
    }
    assert.ok(db);
    await q('create role anon; create role authenticated; create role service_role bypassrls');
    await q(read('tests/fixtures/storage-permissions.sql'));
    for (const entry of manifest.filter(e => e.source.split('/').at(-1) < '202611110001')) await q(read(entry.stagingFile));
  });
  after(async () => { await db?.end(); if (container && /^[a-f0-9]{64}$/.test(container)) cmd(['stop', '--time', '3', container]); });

  test('before SEC-02 the public roles can still read transfer_price (documents the gap)', async () => {
    for (const role of ['anon', 'authenticated']) await asRole(role, 'select transfer_price from products');
  });
  test('applies the versioned file once; public catalog keeps working and transfer_price is private', async () => {
    await db.query(read(migration));
    const category = randomUUID(), product = randomUUID();
    await q("insert into categories(id,name,slug) values($1,'SYNTHETIC','mates')", [category]);
    await q("insert into products(id,category_id,name,slug,short_description,stock,price,transfer_price,cost,status,sku) values($1::uuid,$2,'Synthetic mate',$1::text,'SYNTHETIC',3,10000,7500,100,'active','SYN-1')", [product, category]);
    for (const role of ['anon', 'authenticated']) {
      await denied(role, 'select transfer_price from products');
      await denied(role, 'select * from products');
      const rows = await asRole(role, 'select id, price, stock, sku from products');
      assert.deepEqual(rows, [{ id: product, price: '10000.00', stock: 3, sku: 'SYN-1' }]);
      const catalog = await asRole(role, 'select id, price, stock, sku from public_catalog_skus');
      assert.deepEqual(catalog, [{ id: product, price: '10000.00', stock: 3, sku: 'SYN-1' }]);
      assert.deepEqual(await asRole(role, 'select count(*)::int n from public_component_offers'), [{ n: 0 }]);
    }
    assert.deepEqual(await asRole('service_role', 'select transfer_price from products'), [{ transfer_price: '7500.00' }]);
  });
  test('re-applying the file is idempotent', async () => {
    await db.query(read(migration));
    await denied('anon', 'select transfer_price from products');
  });
});
