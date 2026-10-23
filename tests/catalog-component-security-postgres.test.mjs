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
const migration = 'supabase/migrations/202610210001_public_catalog_component_security.sql';
const approvedHash = '35621d198d6e1fc6b1a5bf508fe35842cfd2aef1dd5badf41b0715aa69dd4b5e';
test('versioned security SQL is the exact reviewed LF artifact', () => {
  const bytes = readFileSync(resolve(root, migration));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), approvedHash);
  assert.equal(bytes.includes(13), false);
});

const docker = process.env.SFSTORE_TEST_DOCKER;
describe('versioned joint security / isolated PostgreSQL 17.6', { skip: !docker, concurrency: false, timeout: 180000 }, () => {
  let db, container, head, cc, lightning, recipe;
  const actor = randomUUID();
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
  const offers = role => asRole(role, 'select * from public_component_offers order by connector');
  before(async () => {
    container = cmd(['run', '-d', '--rm', '--name', `sfstore-security-${randomUUID().slice(0, 8)}`, '--label', 'sfstore.synthetic=joint-security', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'postgres:17.6']);
    const port = Number(cmd(['port', container, '5432/tcp']).split(':').at(-1));
    for (let i = 0; i < 80; i++) {
      const c = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
      try { await c.connect(); db = c; break; } catch { await c.end(); await delay(250); }
    }
    assert.ok(db);
    await q('create role anon; create role authenticated; create role service_role bypassrls');
    await q(read('tests/fixtures/storage-permissions.sql'));
    for (const entry of JSON.parse(read('staging/migration-manifest.json')).applicationOrder.filter(e=>e.source.split('/').at(-1)<'202610190001')) await q(read(entry.stagingFile));
    await q(read('supabase/migrations/202610190001_component_inventory.sql'));
    await q(read('supabase/migrations/202610200001_component_combo_pricing.sql'));
  });
  after(async () => { await db?.end(); if (container && /^[a-f0-9]{64}$/.test(container)) cmd(['stop', '--time', '3', container]); });

  test('applies exact versioned file after both originals; empty postcheck passes', async () => {
    await db.query(read(migration));
    const results = await db.query(read('reports/catalog-component-security-postcheck-read-only.sql'));
    const check = results.find(r => r.command === 'SELECT').rows[0].security_postcheck;
    for (const [key, value] of Object.entries(check)) if (typeof value === 'boolean') assert.equal(value, true, key);
    assert.equal(check.public_offer_count, 0);
  });
  test('existing authorized RPCs publish both connectors with approved prices', async () => {
    const category = randomUUID();
    await q("insert into categories(id,name,slug) values($1,'SYNTHETIC CHARGERS','mates')", [category]);
    const ids = [];
    for (const [name, stock, price, status] of [['SOURCE', 0, 0, 'draft'], ['Cabezal', 21, 22000, 'active'], ['C/C', 10, 15800, 'active'], ['Lightning', 10, 15800, 'active'], ['COMBO', 0, 30666.67, 'draft'], ['LEGACY', 0, 0, 'draft']]) {
      const id = randomUUID(); ids.push(id);
      await q("insert into products(id,category_id,name,slug,short_description,stock,price,cost,status) values($1::uuid,$2,$3,$1::text,'SYNTHETIC',$4,$5,100,$6)", [id, category, name, stock, price, status]);
    }
    [, head, cc, lightning] = ids;
    await q('set role service_role');
    try {
      recipe = (await q('select register_component_recipe($1,$2,$3,$4,$5,$6,$7) id', ['SYNTHETIC', ...ids]))[0].id;
      await q('select approve_component_prices($1,$2,$3,$4)', [randomUUID(), actor, recipe, JSON.stringify({ [head]: 22000, [cc]: 15800, [lightning]: 15800 })]);
      await q('select configure_component_combo_price($1,$2,$3,30666.67,23000,true)', [randomUUID(), actor, recipe]);
    } finally { await q('reset role'); }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const rows = await offers(role);
      assert.deepEqual(rows.map(r => r.connector), ['cc', 'lightning']);
      assert.ok(rows.every(r => r.combo_list_price === '30666.67' && r.combo_transfer_price === '23000.00' && r.available === 10));
      const physical = await asRole(role, 'select id,price from public_catalog_skus order by id');
      assert.equal(physical.length, 3);
      assert.deepEqual(physical.map(p => p.price).sort(), ['15800.00', '15800.00', '22000.00']);
    }
  });
  test('public roles cannot read private sources/costs, refresh or mutate projection', async () => {
    for (const role of ['anon', 'authenticated']) for (const sql of ['select * from component_recipes', 'select * from component_combo_pricing', 'select * from component_recipe_price_approvals', 'select * from component_combo_price_audit', 'select cost from products', 'delete from component_offer_publications', `select refresh_component_offer_publication('${recipe}')`]) await assert.rejects(asRole(role, sql), /permission denied/);
  });
  test('per-connector visibility and shared stock stay dynamic', async () => {
    await q('update products set web_visible=false where id=$1', [lightning]);
    assert.deepEqual((await offers('anon')).map(r => r.connector), ['cc']);
    assert.deepEqual((await asRole('anon', 'select connector from component_offer_publications')).map(r => r.connector), ['cc']);
    await q('update products set web_visible=true where id=$1', [lightning]);
    await q('update products set stock=1 where id=$1', [head]);
    assert.deepEqual((await offers('anon')).map(r => r.available), [1, 1]);
    await q('update products set commercial_blocked=true where id=$1', [head]);
    assert.equal((await offers('anon')).length, 0);
    assert.equal((await q('select count(*)::int n from inventory_movements'))[0].n, 0);
  });
  test('reapplication fails closed and leaves one projection policy', async () => {
    await assert.rejects(db.query(read(migration)), /CATALOG_SECURITY_PREFLIGHT_CHANGED/);
    await q('rollback');
    assert.equal((await q("select count(*)::int n from pg_policy where polrelid='component_offer_publications'::regclass"))[0].n, 1);
  });
});
