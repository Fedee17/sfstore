import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { before, after, describe, test } from 'node:test';
import { Client } from 'pg';
import { hashStagingSql } from '../scripts/prepare-checkout-staging.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const manifest = JSON.parse(read('staging/migration-manifest.json'));
test('complete rebuild has unique versions, exact sources and all canonical migrations', () => {
  const entries = manifest.applicationOrder;
  const expected = ['supabase/rebuild', 'supabase/migrations']
    .flatMap(directory => readdirSync(resolve(root, directory)).filter(file => file.endsWith('.sql')).map(file => {
      const source = directory + '/' + file;
      const name = file === '202609180002_suppliers_admin.sql' ? '202609180003_suppliers_admin.sql' : file;
      return { source, stagingFile: 'staging/supabase/migrations/' + name };
    }))
    .sort((a, b) => a.stagingFile.localeCompare(b.stagingFile));
  assert.deepEqual(manifest.applicationOrder.map(({ source, stagingFile }) => ({ source, stagingFile })), expected);
  assert.equal(new Set(manifest.applicationOrder.map(entry => entry.source)).size, expected.length);
  assert.equal(new Set(entries.map(e => e.stagingFile.split('/').at(-1).split('_')[0])).size, entries.length);
  for (const e of entries) {
    assert.equal(read(e.source), read(e.stagingFile));
    assert.equal(hashStagingSql(read(e.source)), e.sourceSha256);
    assert.equal(e.sourceSha256, e.stagingSha256);
  }
  for (const file of readdirSync(resolve(root, 'supabase/migrations'))) {
    if (file.endsWith('.sql')) assert.ok(entries.some(e => e.source === `supabase/migrations/${file}`));
  }
  assert.match(entries[0].source, /rebuild\/202609100001_initial_schema/);
  assert.ok(read(entries[0].source).includes(read('supabase/schema.sql')));
  assert.equal(entries.at(-1).source, expected.at(-1).source);
});
test('purchase ACL precedes its first confirmation consumer; broad test defaults removed', () => {
  const order = manifest.applicationOrder.map(e => e.source.split('/').at(-1));
  assert.ok(order.indexOf('202609160002_purchase_explicit_permissions.sql') > order.indexOf('202609160001_purchase_draft_foundation.sql'));
  assert.ok(order.indexOf('202609160002_purchase_explicit_permissions.sql') < order.indexOf('202609170001_purchase_confirmation.sql'));
  for (const f of ['pay01-atomic-checkout.test.mjs', 'sec01-effective-permissions.test.mjs']) {
    assert.doesNotMatch(read(`tests/${f}`), /alter default privileges[^;]*grant all/i);
  }
  assert.match(read('staging/supabase/config.toml'), /major_version = 17/);
});

const docker = process.env.SFSTORE_TEST_DOCKER;
describe('empty PostgreSQL 17.6 / no automatic table, sequence or function grants', { skip: !docker, concurrency: false, timeout: 180000 }, () => {
  let container, db, immediatePurchase;
  const actor = randomUUID(), category = randomUUID(), product = randomUUID(), supplier = randomUUID();
  const cmd = args => {
    const r = spawnSync(docker, args, { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(r.status, 0, r.stderr || r.error?.message);
    return r.stdout.trim();
  };
  const q = async (sql, args) => (await db.query(sql, args)).rows;
  async function asRole(role, sql, args) {
    await q('begin');
    try { await q(`set local role ${role}`); return await q(sql, args); }
    finally { await q('rollback'); }
  }
  before(async () => {
    container = cmd(['run', '-d', '--rm', '--name', `sfstore-grants-${randomUUID().slice(0,8)}`, '--label', 'sfstore.synthetic=explicit-grants', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'postgres:17.6']);
    const port = Number(cmd(['port', container, '5432/tcp']).split(':').at(-1));
    for (let i = 0; i < 60; i++) {
      const client = new Client({host:'127.0.0.1', port, user:'postgres', database:'postgres'});
      try { await client.connect(); db = client; break; } catch { await client.end(); await delay(250); }
    }
    assert.ok(db);
    await q('create role anon; create role authenticated; create role service_role bypassrls; alter default privileges revoke execute on functions from public;');
    await q(read('tests/fixtures/storage-permissions.sql'));
    for (const e of manifest.applicationOrder) {
      try { await db.query(read(e.stagingFile)); }
      catch (error) { throw new Error(`REBUILD_FAILED:${e.source}:${error.message}`, {cause:error}); }
      if (e.source.endsWith('202609160002_purchase_explicit_permissions.sql')) {
        await q('set role service_role');
        try {
          await q("insert into categories(id,name,slug) values($1,'SYNTHETIC','synthetic-grants')", [category]);
          await q("insert into products(id,category_id,name,slug,short_description,price,stock) values($1,$2,'SYNTHETIC','synthetic-grants','SYNTHETIC',100,5)", [product,category]);
          await q("insert into suppliers(id,name,normalized_name) values($1,'SYNTHETIC','synthetic')", [supplier]);
          immediatePurchase = (await q("select save_purchase_draft(null,$1,'2026-10-23',0,'SYNTHETIC',$2,$3) id", [supplier,actor,JSON.stringify([{product_id:product,quantity:1,unit_purchase_cost:10}])]))[0].id;
          await q('select cancel_purchase_draft($1)', [immediatePurchase]);
        } finally { await q('reset role'); }
      }
    }
  });
  after(async () => { await db?.end(); if (container && /^[a-f0-9]{64}$/.test(container)) cmd(['stop','--time','3',container]); });
  test('all 37 steps apply with restrictive defaults; purchase RPC worked immediately', async () => {
    assert.ok(immediatePurchase);
    assert.equal((await q('show server_version_num'))[0].server_version_num, '170006');
    assert.equal((await q('select count(*)::int n from pg_class where relnamespace=\'public\'::regnamespace and relkind=\'r\''))[0].n, 39);
  });
  test('public table RLS, no public mutations or private columns', async () => {
    assert.equal((await q("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity"))[0].n,0);
    for (const role of ['anon','authenticated']) {
      const bad = await q("select relname from pg_class where relnamespace='public'::regnamespace and relkind in('r','v') and has_table_privilege($1,oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')",[role]);
      assert.deepEqual(bad, []);
      await assert.rejects(asRole(role,'select cost from products'), /permission denied/);
      for (const table of ['customers','orders','order_payments','purchases','component_recipes','component_combo_pricing','checkout_audit']) await assert.rejects(asRole(role,`select * from ${table}`), /permission denied/);
    }
  });
  test('both public invoker views work as anon/authenticated/service_role', async () => {
    for (const name of ['public_catalog_skus','public_component_offers']) {
      assert.ok((await q('select reloptions from pg_class where oid=$1::regclass',[name]))[0].reloptions.includes('security_invoker=true'));
      for (const role of ['anon','authenticated','service_role']) assert.ok(Array.isArray(await asRole(role,`select * from ${name}`)));
    }
  });
  test('all application function names deny public execution; service RPC grants explicit', async () => {
    const names = new Set();
    for (const e of manifest.applicationOrder) for (const m of read(e.source).matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_]+)\s*\(/gi)) names.add(m[1]);
    for (const role of ['anon','authenticated']) assert.deepEqual(await q("select proname from pg_proc where pronamespace='public'::regnamespace and proname=any($1) and has_function_privilege($2,oid,'EXECUTE')",[[...names],role]),[]);
    for (const signature of ['create_store_sale_atomic(uuid,uuid,text,text,jsonb,jsonb)','create_checkout_atomic(uuid,uuid,jsonb)','save_purchase_draft(uuid,uuid,date,numeric,text,uuid,jsonb)','configure_component_combo_price(uuid,uuid,uuid,numeric,numeric,boolean)']) assert.equal((await q("select has_function_privilege('service_role',$1,'EXECUTE') ok",[signature]))[0].ok,true);
  });
  test('sequence and service audit privileges remain narrow', async () => {
    for (const role of ['anon','authenticated']) assert.equal((await q("select has_sequence_privilege($1,'checkout_audit_id_seq','USAGE,SELECT,UPDATE') ok",[role]))[0].ok,false);
    assert.equal((await q("select has_sequence_privilege('service_role','checkout_audit_id_seq','USAGE') ok"))[0].ok,true);
    assert.equal((await q("select has_table_privilege('service_role','checkout_audit','UPDATE,DELETE,TRUNCATE') ok"))[0].ok,false);
    assert.deepEqual(await q("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and has_table_privilege('service_role',oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')"),[]);
  });
  test('future objects start private, including global PUBLIC function EXECUTE', async () => {
    await q('begin');
    try {
      await q('create table public.rebuild_future_probe(id uuid); create sequence public.rebuild_future_probe_seq; create function public.rebuild_future_probe_fn() returns integer language sql as $$select 1$$');
      for (const role of ['anon','authenticated','service_role']) {
        assert.equal((await q("select has_table_privilege($1,'rebuild_future_probe','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') ok",[role]))[0].ok,false);
        assert.equal((await q("select has_sequence_privilege($1,'rebuild_future_probe_seq','USAGE,SELECT,UPDATE') ok",[role]))[0].ok,false);
        assert.equal((await q("select has_function_privilege($1,'rebuild_future_probe_fn()','EXECUTE') ok",[role]))[0].ok,false);
      }
    } finally { await q('rollback'); }
  });
  test('production security postcheck passes without automatic grants', async () => {
    const results=await db.query(read('reports/catalog-component-security-postcheck-read-only.sql'));
    const check=results.find(r=>r.command==='SELECT').rows[0].security_postcheck;
    for(const value of Object.values(check)) if(typeof value==='boolean') assert.equal(value,true);
  });
  test('untrusted identities have no DDL or privileged membership; executor has no table access', async () => {
    for (const role of ['anon','authenticated']) {
      assert.equal((await q("select has_schema_privilege($1,'public','CREATE') ok",[role]))[0].ok,false);
      assert.deepEqual(await q('select rolname from pg_roles where (rolsuper or rolbypassrls) and pg_has_role($1,oid,\'MEMBER\')',[role]),[]);
    }
    assert.equal((await q("select has_function_privilege('sfstore_reservation_executor','sfstore_maintenance.run_checkout_expiration(uuid,integer)','EXECUTE') ok"))[0].ok,true);
    assert.deepEqual(await q("select relname from pg_class where relnamespace in('public'::regnamespace,'sfstore_maintenance'::regnamespace) and relkind='r' and has_table_privilege('sfstore_reservation_executor',oid,'SELECT,INSERT,UPDATE,DELETE')"),[]);
  });
  test('initial schema refuses a populated database and rolls back without data loss', async () => {
    const before = (await q('select count(*)::int n from products'))[0].n;
    await assert.rejects(db.query(read('supabase/rebuild/202609100001_initial_schema.sql')),/REBUILD_REQUIRES_EMPTY_PUBLIC/);
    await q('rollback');
    assert.equal((await q('select count(*)::int n from products'))[0].n,before);
  });
});
