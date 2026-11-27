// Bulk status change with preview: the same plan decides the preview and the write.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { BULK_STATUS_LIMIT, parseBulkTarget, planBulkStatus, sameSelection } from '../lib/admin/bulk-status.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const row = (id, status, extra = {}) => ({ id, name: `P ${id}`, sku: `SKU-${id}`, slug: `p-${id}`, status, historical_identity: false, ...extra });

test('only valid targets are accepted', () => {
  assert.equal(parseBulkTarget('draft'), 'draft');
  assert.equal(parseBulkTarget('archived'), 'archived');
  assert.equal(parseBulkTarget('active'), 'active');
  assert.equal(parseBulkTarget('deleted'), null);
  assert.equal(parseBulkTarget(undefined), null);
});

test('the plan changes eligible products and explains every skip', () => {
  const plan = planBulkStatus([
    row('a', 'active'),
    row('b', 'draft'),
    row('c', 'draft'),
    row('d', 'active', { historical_identity: true }),
    row('e', 'active'),
  ], 'draft', new Set(['e']));
  assert.deepEqual(plan.change.map(r => r.id), ['a']);
  assert.deepEqual(plan.skip.map(s => [s.row.id, s.reason]), [
    ['b', 'Ya está en Borrador'],
    ['c', 'Ya está en Borrador'],
    ['d', 'Identidad histórica: no admite cambios'],
    ['e', 'Combo de cargador: se administra en Cargadores'],
  ]);
  assert.equal(plan.tooMany, false);
});

test('an unknown identity is never treated as operational', () => {
  const plan = planBulkStatus([row('x', 'active', { historical_identity: null })], 'draft', new Set());
  assert.deepEqual(plan.change, []);
  assert.equal(plan.skip[0].reason, 'Identidad histórica: no admite cambios');
});

test('more than the limit is refused as a whole, never cut silently', () => {
  const rows = Array.from({ length: BULK_STATUS_LIMIT + 1 }, (_, i) => row(`p${i}`, 'active'));
  const plan = planBulkStatus(rows, 'archived', new Set());
  assert.equal(plan.tooMany, true);
  assert.equal(plan.change.length, BULK_STATUS_LIMIT + 1);
});

test('the confirmed selection must match the fresh plan exactly', () => {
  assert.equal(sameSelection(['a', 'b'], ['b', 'a']), true);
  assert.equal(sameSelection(['a', 'b'], ['a']), false);
  assert.equal(sameSelection(['a', 'a'], ['a']), false);
});

test('the write re-plans after the session guard and uses one guarded statement', () => {
  const action = read('app/admin/productos/masivo/actions.ts');
  assert.match(action, /"use server"/);
  const guard = action.indexOf('await requireAdminActionSession()');
  assert.ok(guard > 0 && guard < action.indexOf('getSupabaseAdminClient()'), 'session guard before the privileged client');
  assert.match(action, /planFromRows\(/);
  assert.match(read('services/bulk-status.ts'), /return planBulkStatus\(rows, target, await presentationIdsAmong/);
  assert.match(action, /sameSelection\(/);
  assert.match(action, /\.update\(\{ status: target \}\)\s*\.in\("id", ids\)\s*\.eq\("historical_identity", false\)\s*\.neq\("status", target\)/);
  assert.match(action, /revalidateProducts\(/);
  assert.doesNotMatch(action, /price|stock|category_id:/, 'status only');
});

test('the preview page lists what changes and what is skipped before any write', () => {
  const page = read('app/admin/productos/masivo/page.tsx');
  assert.match(page, /await requireAdminSession\(\)/);
  assert.match(page, /planFromRows\(/);
  assert.match(page, /Se van a cambiar/);
  assert.match(page, /No se cambian/);
  assert.match(page, /action=\{applyBulkStatus\}/);
  assert.match(read('app/admin/productos/page.tsx'), /href="\/admin\/productos\/masivo"/);
});
