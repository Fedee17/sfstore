// Bulk price adjustment by percentage: list and approved special move together, rounded to the nearest $100,
// and the preview shows how much the rounding adds or takes away.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { BULK_PRICE_LIMIT, parsePercent, planBulkPrice, roundTo100 } from '../lib/admin/bulk-price.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = 'supabase/migrations/202611290003_bulk_price_adjustment.sql';
const row = (id, price, extra = {}) => ({ id, name: `P ${id}`, sku: null, slug: `p-${id}`, status: 'active', historical_identity: false, family_id: null,
  price, transfer_price: null, cash_price_approved_at: null, compare_at_price: null, ...extra });

test('the percentage accepts up to two decimals between -50% and +100%, never 0', () => {
  assert.equal(parsePercent('10'), 1000);
  assert.equal(parsePercent('-7,5'), -750);
  assert.equal(parsePercent('2.25'), 225);
  for (const bad of ['0', '', 'abc', '101', '-50.01', '1.234', undefined]) assert.equal(parsePercent(bad), null, String(bad));
  assert.equal(parsePercent('-50'), -5000);
  assert.equal(parsePercent('100'), 10000);
});

test('rounding goes to the nearest $100 in cents, halves up', () => {
  assert.equal(roundTo100(6423700), 6420000);
  assert.equal(roundTo100(6425000), 6430000);
  assert.equal(roundTo100(6426300), 6430000);
});

test('an approved special moves with the list and keeps its approval; the rounding is shown', () => {
  const plan = planBulkPrice([row('yara', 60000, { transfer_price: 45000, cash_price_approved_at: '2026-11-26T10:00:00+00:00' })], 700, new Set());
  const [c] = plan.change;
  assert.deepEqual(c.list, { fromCents: 6000000, exactCents: 6420000, toCents: 6420000, roundingCents: 0 });
  assert.deepEqual(c.special, { approved: true, fromCents: 4500000, exactCents: 4815000, toCents: 4820000, roundingCents: 5000 });
  assert.equal(plan.roundingCents, 5000);
});

test('without an approved special the cash price stays at the automatic 75%', () => {
  const plan = planBulkPrice([row('mate', 12345)], 1000, new Set());
  const [c] = plan.change;
  assert.deepEqual(c.list, { fromCents: 1234500, exactCents: 1357950, toCents: 1360000, roundingCents: 2050 });
  assert.deepEqual(c.special, { approved: false, fromCents: 925875, toCents: 1020000 });
});

test('a rounding down is reported as a discount', () => {
  const [c] = planBulkPrice([row('a', 10030)], 100, new Set()).change;
  assert.equal(c.list.exactCents, 1013030);
  assert.equal(c.list.toCents, 1010000);
  assert.equal(c.list.roundingCents, -3030);
});

test('every product that cannot be adjusted safely is skipped with its reason', () => {
  const plan = planBulkPrice([
    row('hist', 1000, { historical_identity: true }),
    row('fam', 1000, { family_id: 'f1' }),
    row('combo', 1000),
    row('zero', 0),
    row('tiny', 40),
    row('strike', 9000, { compare_at_price: 9500 }),
    row('near', 10000, { transfer_price: 10000, cash_price_approved_at: '2026-11-26T10:00:00+00:00' }),
  ], 1000, new Set(['combo']));
  assert.deepEqual(plan.skip.map(s => [s.row.id, s.reason]), [
    ['hist', 'Identidad histórica: no admite cambios'],
    ['fam', 'Variante de familia: el precio se ajusta en la familia'],
    ['combo', 'Combo de cargador: el precio sale de sus componentes'],
    ['zero', 'Sin precio de lista'],
    ['tiny', 'El precio quedaría en $0 al redondear'],
    ['strike', 'El precio tachado quedaría menor o igual a la lista'],
  ]);
  assert.deepEqual(plan.change.map(c => c.row.id), ['near']);
});

test('more than the limit is refused as a whole', () => {
  const rows = Array.from({ length: BULK_PRICE_LIMIT + 1 }, (_, i) => row(`p${i}`, 1000));
  assert.equal(planBulkPrice(rows, 1000, new Set()).tooMany, true);
});

test('the migration re-checks every row under lock and writes all or nothing', () => {
  const sql = read(migration);
  assert.match(sql, /create function public\.bulk_adjust_product_prices\(p_items jsonb\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /raise exception 'BULK_PRICE_CHANGED'/);
  assert.match(sql, /raise exception 'BULK_PRICE_INVALID'/);
  assert.match(sql, /mod\(v_price \* 100, 10000\) <> 0/);
  assert.match(sql, /cash_price_approved_at = clock_timestamp\(\)/);
  assert.match(sql, /family_id is not null/);
  assert.match(sql, /component_recipes/);
  assert.match(sql, /revoke all on function public\.bulk_adjust_product_prices\(jsonb\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.bulk_adjust_product_prices\(jsonb\) to service_role;/);
  assert.doesNotMatch(sql, /\bstock\b|compare_at_price\s*=/);
  const bytes = readFileSync(resolve(root, migration));
  const entry = JSON.parse(read('staging/migration-manifest.json')).applicationOrder.find(e => e.source === migration);
  assert.ok(entry, 'registered in the staging manifest');
  assert.equal(bytes.includes(13), false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256);
  assert.match(read('reports/bulk-price-adjustment-rollback.sql'), /drop function if exists public\.bulk_adjust_product_prices\(jsonb\);/);
});

test('the action re-plans after the session guard and sends what the preview showed', () => {
  const action = read('app/admin/productos/precios/actions.ts');
  const guard = action.indexOf('await requireAdminActionSession()');
  assert.ok(guard > 0 && guard < action.indexOf('getSupabaseAdminClient()'));
  assert.match(action, /planPriceFromRows\(/);
  assert.match(action, /sameSelection\(/);
  assert.match(action, /rpc\("bulk_adjust_product_prices"/);
  assert.match(action, /revalidateProducts\(/);
  const page = read('app/admin/productos/precios/page.tsx');
  assert.match(page, /await requireAdminSession\(\)/);
  assert.match(page, /Redondeo/);
  assert.match(page, /action=\{applyBulkPrice\}/);
  assert.match(read('app/admin/productos/page.tsx'), /href="\/admin\/productos\/precios"/);
});
