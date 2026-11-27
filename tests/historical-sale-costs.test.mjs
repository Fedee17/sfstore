// Historical sales get the cost they had when sold (owner sheet, 27/11/2026): one guarded, reversible data migration.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = 'supabase/migrations/202611290005_historical_sale_costs.sql';
const sql = read(migration);
const values = [...sql.matchAll(/^  \((\d+), ([\d.]+), (\d+), ([\d.]+), (true|false)\)/gm)].map(m => ({ row: +m[1], total: +m[2], qty: +m[3], cost: +m[4], gift: m[5] === 'true' }));

test('every imported historical sale gets exactly one cost, never above its price', () => {
  assert.equal(values.length, 129);
  assert.equal(new Set(values.map(v => v.row)).size, 129);
  for (const v of values) assert.ok(v.cost * v.qty <= v.total && v.cost >= 0, `row ${v.row}`);
  assert.deepEqual(values.filter(v => v.gift).map(v => [v.row, v.cost]), [[121, 0]], 'only the gifted deodorant costs $0');
});

test('owner answers replace the unusable profits', () => {
  const byRow = Object.fromEntries(values.map(v => [v.row, v.cost]));
  assert.deepEqual([byRow[47], byRow[63], byRow[117], byRow[57]], [3500, 3500, 3500, 3500]);
  assert.equal(byRow[48], 3650, '$3.500 + $3.800 for two units');
});

test('only costs and cost metadata change, after a full preflight, with a postcheck and a rollback', () => {
  assert.match(sql, /raise exception 'HISTORICAL_COSTS_ROWS_DO_NOT_MATCH'/);
  assert.match(sql, /raise exception 'HISTORICAL_COSTS_BASE_CHANGED'/);
  assert.match(sql, /raise exception 'HISTORICAL_COSTS_POSTCHECK_FAILED'/);
  assert.match(sql, /t\.unit_cost_snapshot is not null or t\.policy is not null/);
  assert.match(sql, /select set_config\('sfstore\.historical_import', 'on', true\);/);
  const writes = [...sql.matchAll(/^update public\.(\w+)[^;]* set (\w+)/gm)].map(m => `${m[1]}.${m[2]}`);
  assert.deepEqual(writes, ['order_items.unit_cost_snapshot', 'orders.metadata']);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(insert into public|delete from)\b|paid_at|\bstock\b|total =/);
  const rollback = read('reports/historical-sale-costs-rollback.sql');
  assert.match(rollback, /set unit_cost_snapshot = null/);
  assert.match(rollback, /metadata->>'cost_source' = 'owner_sheet_profit_20261127'/);
  const bytes = readFileSync(resolve(root, migration));
  const entry = JSON.parse(read('staging/migration-manifest.json')).applicationOrder.find(e => e.source === migration);
  assert.ok(entry); assert.equal(bytes.includes(13), false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256);
  assert.equal(read('reports/historical-sale-costs-20261127.csv').trim().split('\n').length, 130);
});
