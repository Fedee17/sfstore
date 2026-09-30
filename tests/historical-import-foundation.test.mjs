import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const migration = source("supabase", "migrations", "202609300001_historical_import_foundation.sql");
const dryRun = source("scripts", "dry-run-historical-import.ts");
const reportScript = source("scripts", "build-historical-product-foundation.ts");
const currentProductsReport = source("reports", "current-products-required.csv");
const historicalProductsReport = source("reports", "historical-products-to-create.csv");
const snapshotModule = await import(pathToFileURL(join(root, "scripts", "snapshot-historical-import-invariants.ts")).href);

function functionBlock(name, nextName) {
  const start = migration.indexOf(`create or replace function ${name}`);
  const end = nextName ? migration.indexOf(`create or replace function ${nextName}`, start) : migration.length;
  assert.notEqual(start, -1, `${name} debe existir`);
  return migration.slice(start, end === -1 ? migration.length : end);
}

const purchaseImport = functionBlock("import_historical_purchase", "import_historical_sale");
const saleImport = functionBlock("import_historical_sale");

test("historical provenance is explicit and cannot claim an operational channel", () => {
  assert.match(migration, /channel in \('web', 'store', 'order', 'historical'\)/i);
  assert.match(migration, /historical_import boolean not null default false/i);
  assert.match(migration, /historical_occurred_on date/i);
  assert.match(migration, /affects_inventory boolean not null default true/i);
  assert.match(migration, /historical_import = true[\s\S]+affects_inventory = false/i);
});

test("historical imports have immutable batch and record provenance", () => {
  assert.match(migration, /create table historical_import_batches/i);
  assert.match(migration, /source_sha256 text not null unique/i);
  assert.match(migration, /create table historical_import_records/i);
  assert.match(migration, /historical_import_records_fingerprint_unique/i);
  assert.match(migration, /HISTORICAL_IMPORT_AUDIT_IMMUTABLE/i);
});

test("historical purchase accepts multiple items from one source row", () => {
  assert.match(purchaseImport, /p_items jsonb/i);
  assert.match(purchaseImport, /jsonb_to_recordset\(p_items\)/i);
  assert.match(purchaseImport, /insert into purchase_items/i);
  assert.match(purchaseImport, /'items', v_item_count/i);
});

test("historical purchase never updates product stock or cost", () => {
  assert.doesNotMatch(purchaseImport, /update products/i);
  assert.doesNotMatch(purchaseImport, /cost_source_purchase_item_id/i);
  assert.doesNotMatch(purchaseImport, /confirm_purchase/i);
  assert.doesNotMatch(purchaseImport, /insert into inventory_movements/i);
  assert.match(purchaseImport, /'historical'[\s\S]+false/i);
});

test("historical sale stores snapshots without inventory side effects", () => {
  assert.match(saleImport, /insert into orders/i);
  assert.match(saleImport, /insert into order_items/i);
  assert.doesNotMatch(saleImport, /apply_sale_inventory|complete_store_sale|deliver_order/i);
  assert.doesNotMatch(saleImport, /update products|insert into inventory_movements/i);
});

test("source totals are preserved independently from quantity times unit amount", () => {
  assert.match(purchaseImport, /effective_line_total[\s\S]+item\.source_total, 0, 0, item\.unit_cost, item\.source_total/i);
  assert.match(saleImport, /item\.unit_price, item\.quantity::integer, item\.source_total/i);
  assert.doesNotMatch(saleImport, /item\.unit_price \* item\.quantity/i);
});

test("payment rows require complete source evidence", () => {
  assert.match(saleImport, /HISTORICAL_PAYMENT_EVIDENCE_INCOMPLETE/i);
  assert.match(saleImport, /if p_payment_amount is not null then[\s\S]+insert into order_payments/i);
  assert.match(saleImport, /'payment_evidence', p_payment_amount is not null/i);
});

test("idempotency uses advisory locks and immutable fingerprints", () => {
  assert.match(purchaseImport, /pg_advisory_xact_lock/i);
  assert.match(saleImport, /pg_advisory_xact_lock/i);
  assert.match(purchaseImport, /'already_imported'/i);
  assert.match(saleImport, /'already_imported'/i);
  assert.match(migration, /fingerprint text not null check \(fingerprint ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
});

test("archived products are valid historical references", () => {
  assert.doesNotMatch(purchaseImport, /product\.status\s*=|status <> 'active'/i);
  assert.doesNotMatch(saleImport, /product\.status\s*=|status <> 'active'/i);
  assert.match(reportScript, /14 identidades y 17 aliases/i);
});

test("historical dates remain date values instead of UTC timestamps", () => {
  assert.match(migration, /historical_occurred_on date/i);
  assert.match(purchaseImport, /p_occurred_on date/i);
  assert.match(saleImport, /p_occurred_on date/i);
  assert.doesNotMatch(migration, /historical_occurred_on timestamptz/i);
});

test("historical RPCs and tables are service-role only", () => {
  assert.match(migration, /revoke all on table historical_import_batches, historical_import_records from public, anon, authenticated/i);
  for (const name of ["import_historical_purchase", "import_historical_sale"]) {
    assert.match(migration, new RegExp(`revoke all on function ${name}[\\s\\S]+public, anon, authenticated`, "i"));
    assert.match(migration, new RegExp(`grant execute on function ${name}[\\s\\S]+service_role`, "i"));
  }
});

test("the database rejects inventory movements linked to historical records", () => {
  assert.match(migration, /create trigger reject_historical_inventory_movements/i);
  assert.match(migration, /HISTORICAL_RECORD_CANNOT_AFFECT_INVENTORY/i);
  assert.match(migration, /new\.order_id[\s\S]+historical_import/i);
  assert.match(migration, /new\.purchase_id[\s\S]+historical_import/i);
});

test("historical orders purchases and their lines are immutable", () => {
  for (const marker of [
    "HISTORICAL_ORDER_IMMUTABLE", "HISTORICAL_ORDER_ITEM_IMMUTABLE",
    "HISTORICAL_PURCHASE_IMMUTABLE", "HISTORICAL_PURCHASE_ITEM_IMMUTABLE",
  ]) assert.match(migration, new RegExp(marker));
});

test("the operational inventory functions are not replaced by this migration", () => {
  assert.doesNotMatch(migration, /create or replace function apply_sale_inventory/i);
  assert.doesNotMatch(migration, /create or replace function confirm_purchase/i);
  assert.doesNotMatch(migration, /create or replace function complete_store_sale/i);
  assert.doesNotMatch(migration, /create or replace function deliver_order/i);
  assert.match(source("supabase", "migrations", "202609170001_purchase_confirmation.sql"), /update products set[\s\S]+cost = v_item\.effective_unit_cost/i);
  assert.match(source("supabase", "migrations", "202609170003_atomic_sales_inventory.sql"), /insert into inventory_movements[\s\S]+update products/i);
  assert.match(source("supabase", "migrations", "202609210001_orders_workflow.sql"), /select apply_sale_inventory\(p_order_id, p_delivered_by\)/i);
});

test("dry-run readiness extends review without changing human decisions", () => {
  for (const status of ["HISTORICAL_PRODUCT_READY", "CURRENT_PRODUCT_REQUIRED", "SOURCE_DATE_REQUIRED", "POSSIBLE_DUPLICATE", "TOTAL_REVIEW", "INVALID"]) {
    assert.match(dryRun, new RegExp(status));
  }
  assert.match(dryRun, /decision = "REVIEW";[\s\S]+reason = "HISTORICAL_PRODUCT_REQUIRED"/i);
});

test("snapshot comparison covers every required inventory invariant", () => {
  const before = {
    captured_at: "before", products_count: 2, stock_total: 3, products_hash: "a",
    inventory_movements_count: 1, inventory_movements_hash: "b",
  };
  assert.equal(snapshotModule.compareHistoricalImportInvariants(before, { ...before, captured_at: "after" }).unchanged, true);
  const changed = snapshotModule.compareHistoricalImportInvariants(before, { ...before, stock_total: 4 });
  assert.equal(changed.unchanged, false);
  assert.deepEqual(changed.changed, ["stock_total"]);
  assert.match(source("scripts", "snapshot-historical-import-invariants.ts"), /cost_source_purchase_item_id/);
});

test("foundation reports keep current and historical product work separate", () => {
  assert.equal(currentProductsReport.trim().split(/\r?\n/).length - 1, 5);
  assert.match(currentProductsReport, /ready_to_create/);
  assert.equal((currentProductsReport.match(/,false,/g) ?? []).length, 5);
  assert.equal(historicalProductsReport.trim().split(/\r?\n/).length - 1, 14);
  assert.match(historicalProductsReport, /ignite-v150[\s\S]+VAPE IGNATE  V150\|Vaper Ignite V150\|Ignite V150/i);
  assert.doesNotMatch(historicalProductsReport, /SFSTORE_control_emprendimiento_\.xlsx/i);
});
