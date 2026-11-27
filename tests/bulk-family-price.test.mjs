// Family prices by percentage: base price, variant overrides and approved variant specials move together,
// rounded to the nearest $100; a family is adjusted whole or not at all.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { BULK_FAMILY_LIMIT, familyFingerprint, planBulkFamilyPrice } from '../lib/admin/bulk-family-price.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = 'supabase/migrations/202611290004_bulk_family_price_adjustment.sql';
const variant = (id, price, extra = {}) => ({ id, name: `V ${id}`, sku: `SKU-${id}`, price, list_price_override: null, transfer_price: null,
  cash_price_approved_at: null, compare_at_price: null, historical_identity: false, ...extra });
const family = (id, base, variants, extra = {}) => ({ id, name: `F ${id}`, slug: `f-${id}`, base_price: base, revision: 3, variants, ...extra });

test('base, overrides and approved specials move by the same percentage, rounded to $100', () => {
  const plan = planBulkFamilyPrice([family('mates', 20000, [
    variant('a', 20000),
    variant('b', 25550, { list_price_override: 25550 }),
    variant('c', 20000, { transfer_price: 15000, cash_price_approved_at: '2026-11-26T10:00:00+00:00' }),
  ])], 1000);
  const [c] = plan.change;
  assert.deepEqual(c.base, { fromCents: 2000000, exactCents: 2200000, toCents: 2200000, roundingCents: 0 });
  assert.deepEqual(c.variants.map(v => [v.variant.id, v.list.toCents, v.inherits]), [['a', 2200000, true], ['b', 2810000, false], ['c', 2200000, true]]);
  assert.equal(c.variants[1].list.roundingCents, 2810000 - 2810500);
  assert.deepEqual(c.variants[2].special, { approved: true, fromCents: 1500000, exactCents: 1650000, toCents: 1650000, roundingCents: 0 });
  assert.equal(c.variants[0].special.approved, false);
  assert.equal(plan.roundingCents, -500);
});

test('a family is skipped whole, with its reason, when any variant cannot follow', () => {
  const plan = planBulkFamilyPrice([
    family('hist', 10000, [variant('h', 10000, { historical_identity: true })]),
    family('strike', 10000, [variant('s', 10000, { compare_at_price: 10500 })]),
    family('zero', 0, []),
    family('same', 100, [variant('x', 100)]),
    family('special', 10000, [variant('p', 10000, { transfer_price: 10000, cash_price_approved_at: '2026-11-26T10:00:00+00:00' })]),
  ], 1000);
  assert.deepEqual(plan.skip.map(s => [s.family.id, s.reason]), [
    ['hist', 'Tiene variantes históricas'],
    ['strike', 'Una variante quedaría con el precio tachado menor o igual a la lista'],
    ['zero', 'Sin precio base'],
    ['same', 'Con el redondeo el precio queda igual'],
  ]);
  assert.deepEqual(plan.change.map(c => c.family.id), ['special']);
});

test('the preview fingerprint covers the family revision and every variant price', () => {
  const f = family('mates', 20000, [variant('a', 20000)]);
  const same = familyFingerprint(f);
  assert.equal(familyFingerprint({ ...f }), same);
  assert.notEqual(familyFingerprint({ ...f, revision: 4 }), same);
  assert.notEqual(familyFingerprint({ ...f, variants: [variant('a', 20000, { list_price_override: 21000, price: 21000 })] }), same);
  assert.notEqual(familyFingerprint({ ...f, variants: [...f.variants, variant('b', 20000)] }), same);
  const many = Array.from({ length: BULK_FAMILY_LIMIT + 1 }, (_, i) => family(`f${i}`, 10000, []));
  assert.equal(planBulkFamilyPrice(many, 1000).tooMany, true);
});

test('the migration checks revision and every variant under lock, and writes all or nothing', () => {
  const sql = read(migration);
  assert.match(sql, /create function public\.bulk_adjust_family_prices\(p_items jsonb\)/);
  assert.match(sql, /from public\.product_families where id = .* for update/);
  assert.match(sql, /revision is distinct from/);
  assert.match(sql, /raise exception 'BULK_PRICE_CHANGED'/);
  assert.match(sql, /raise exception 'BULK_PRICE_INVALID'/);
  assert.match(sql, /update public\.product_families set base_price = /);
  assert.match(sql, /set list_price_override = v_override, price = v_override/);
  assert.match(sql, /cash_price_approved_at = clock_timestamp\(\)/);
  assert.match(sql, /grant execute on function public\.bulk_adjust_family_prices\(jsonb\) to service_role;/);
  assert.doesNotMatch(sql, /\bstock\b/);
  const bytes = readFileSync(resolve(root, migration));
  const entry = JSON.parse(read('staging/migration-manifest.json')).applicationOrder.find(e => e.source === migration);
  assert.ok(entry);
  assert.equal(bytes.includes(13), false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256);
  assert.match(read('reports/bulk-family-price-adjustment-rollback.sql'), /drop function if exists public\.bulk_adjust_family_prices\(jsonb\);/);
});

test('the families screen previews, re-checks and links from both price screens', () => {
  const action = read('app/admin/productos/familias/precios/actions.ts');
  const guard = action.indexOf('await requireAdminActionSession()');
  assert.ok(guard > 0 && guard < action.indexOf('getSupabaseAdminClient()'));
  assert.match(action, /familyFingerprint\(/);
  assert.match(action, /rpc\("bulk_adjust_family_prices"/);
  const page = read('app/admin/productos/familias/precios/page.tsx');
  assert.match(page, /await requireAdminSession\(\)/);
  assert.match(page, /action=\{applyBulkFamilyPrice\}/);
  assert.match(read('app/admin/productos/precios/page.tsx'), /href="\/admin\/productos\/familias\/precios"/);
});
