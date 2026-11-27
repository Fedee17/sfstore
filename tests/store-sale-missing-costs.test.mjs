// Six store-sale lines without cost get the product's current cost (owner decision 27/11/2026): guarded and reversible.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = 'supabase/migrations/202611290007_store_sale_missing_costs.sql';
const sql = read(migration);
const lines = [...sql.matchAll(/^  \('([0-9a-f-]{36})', '([0-9a-f-]{36})', ([\d.]+), ([\d.]+)\)/gm)].map(m => ({ order: m[1], product: m[2], subtotal: +m[3], cost: +m[4] }));

test('exactly the six approved lines, with the approved costs, each below its price', () => {
  assert.equal(lines.length, 6);
  assert.equal(new Set(lines.map(l => l.order)).size, 5);
  assert.deepEqual(lines.map(l => l.cost), [78432.9, 58500, 54500, 3340.89, 3650, 54000]);
  for (const l of lines) assert.ok(l.cost > 0 && l.cost < l.subtotal);
});

test('only costs and cost metadata change, after a preflight, with a postcheck and a rollback', () => {
  const code = sql.replace(/^--.*$/gm, '');
  assert.deepEqual([...code.matchAll(/^update public\.(\w+) \w+ set (\w+)/gm)].map(m => `${m[1]}.${m[2]}`), ['order_items.unit_cost_snapshot', 'orders.metadata']);
  for (const guard of ['MISSING_COSTS_LINES_DO_NOT_MATCH', 'MISSING_COSTS_BASE_CHANGED', 'MISSING_COSTS_OTHER_LINES_WITHOUT_COST', 'MISSING_COSTS_POSTCHECK_FAILED']) assert.match(code, new RegExp(guard));
  assert.match(code, /'cost_policy_before_owner_fix', coalesce\(o\.metadata->>'cost_snapshot_policy', 'none'\)/);
  assert.doesNotMatch(code, /\b(insert into public|delete from)\b|paid_at|\bstock\b|total =/);
  const rollback = read('reports/store-sale-missing-costs-rollback.sql');
  assert.match(rollback, /set unit_cost_snapshot = null/);
  assert.match(rollback, /cost_policy_before_owner_fix/);
  const bytes = readFileSync(resolve(root, migration));
  const entry = JSON.parse(read('staging/migration-manifest.json')).applicationOrder.find(e => e.source === migration);
  assert.ok(entry); assert.equal(bytes.includes(13), false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256);
});
