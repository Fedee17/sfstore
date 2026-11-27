// Historical sales count as received on their sale date (owner decision 27/11/2026): guarded and reversible.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildCommercialMonth } from '../lib/commercial-reporting/model.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = 'supabase/migrations/202611290006_historical_payment_dates.sql';
const sql = read(migration);

test('only the paid_at of the 129 imported, undated, approved payments changes, at noon of the sale date', () => {
  const code = sql.replace(/^--.*$/gm, '');
  assert.deepEqual([...code.matchAll(/^update public\.(\w+) \w+ set (\w+)/gm)].map(m => `${m[1]}.${m[2]}`), ['order_payments.paid_at']);
  assert.match(code, /\(o\.historical_occurred_on::timestamp \+ time '12:00'\) at time zone 'America\/Argentina\/Buenos_Aires'/);
  assert.match(code, /<> 129/);
  assert.match(code, /paid_at is not null\s+or status <> 'approved' or reference not like 'historical:%'/);
  assert.match(code, /raise exception 'HISTORICAL_PAYMENTS_POSTCHECK_FAILED'/);
  assert.doesNotMatch(code, /\b(insert into|delete from)\b|amount =|method =/);
  assert.match(read('reports/historical-payment-dates-rollback.sql'), /set paid_at = null/);
  const bytes = readFileSync(resolve(root, migration));
  const entry = JSON.parse(read('staging/migration-manifest.json')).applicationOrder.find(e => e.source === migration);
  assert.ok(entry); assert.equal(bytes.includes(13), false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256);
});

test('a historical payment dated at noon of its sale day counts as received that day in Argentina', () => {
  const policy = { version: 'synthetic', exclusionCoverage: 'reviewed_complete', excludedOrderIds: [], excludedPurchaseIds: [], excludedProductIds: [], excludedCategoryIds: [], sourceBatches: [], imputedPurchases: [] };
  const input = { orders: [{ id: 'h', channel: 'historical', status: 'historical', payment_status: 'paid', historical_import: true, historical_occurred_on: '2026-07-31', affects_inventory: false, created_at: '2026-09-30T12:00:00Z', subtotal: 100, discount: 0, shipping_cost: 0, total: 100, cost_snapshot_policy: null }],
    saleLines: [{ id: 'l', order_id: 'h', product_id: 'p', product_name: 'X', category_name: 'Y', quantity: 1, unit_price: 100, subtotal: 100, list_unit_price_snapshot: null, unit_cost_snapshot: null }],
    payments: [{ id: 'p', order_id: 'h', method: 'cash', store_payment_method: null, status: 'approved', amount: 100, paid_at: '2026-07-31T15:00:00+00:00' }],
    purchases: [], purchaseLines: [], provenance: [], products: [], batches: [] };
  const july = buildCommercialMonth(input, '2026-07', policy);
  assert.equal(july.totals.datedReceiptsCents, 10000);
  assert.equal(july.totals.undatedApprovedForSalesCents, 0);
});
