import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  assertHistoricalImportReady,
  buildHistoricalImportPlan,
  executeHistoricalImportPlan,
} = await import(pathToFileURL(join(root, "lib", "historical-import", "import-plan.ts")).href);

const fingerprint = (character) => character.repeat(64);
const row = (overrides = {}) => ({
  source_sheet: "Control de ventas",
  source_row: "1",
  split_line: "",
  record_type: "sale",
  source_product_name: "Producto",
  matched_product_id: "00000000-0000-4000-8000-000000000001",
  matched_product_name: "Producto",
  date: "2026-01-01",
  source_quantity: "1",
  source_total: "100",
  quantity: "1",
  unit_amount: "100",
  total: "100",
  decision: "INSERT",
  readiness_status: "READY",
  reason: "Aprobada",
  fingerprint: fingerprint("a"),
  ...overrides,
});

function gateway() {
  const imported = new Set();
  const calls = { batch: 0, sales: 0, purchases: 0 };
  return {
    calls,
    imported,
    api: {
      async alreadyImported(type, value) { return imported.has(`${type}:${value}`); },
      async getOrCreateBatch() { calls.batch += 1; return "batch"; },
      async importSale(_batch, operation) { calls.sales += 1; imported.add(`sale:${operation.fingerprint}`); return "imported"; },
      async importPurchase(_batch, operation) { calls.purchases += 1; imported.add(`purchase:${operation.fingerprint}`); return "imported"; },
    },
  };
}

test("dry-run performs no writes", async () => {
  const plan = buildHistoricalImportPlan([row()], new Map());
  const mock = gateway();
  const result = await executeHistoricalImportPlan(plan, mock.api, false);
  assert.equal(result.writes, 0);
  assert.deepEqual(mock.calls, { batch: 0, sales: 0, purchases: 0 });
});

test("REVIEW and INVALID block apply readiness", () => {
  for (const decision of ["REVIEW", "INVALID", ""]) {
    const plan = buildHistoricalImportPlan([row({ decision })], new Map());
    assert.throws(() => assertHistoricalImportReady(plan, 0), /bloqueos/);
  }
  assert.throws(() => assertHistoricalImportReady(buildHistoricalImportPlan([], new Map()), 1), /mappings pendientes/);
});

test("OMIT never becomes an operation", () => {
  const plan = buildHistoricalImportPlan([row({ decision: "OMIT", reason: "DAMAGED_PRODUCT_NOT_SALE" })], new Map());
  assert.equal(plan.omitted.length, 1);
  assert.equal(plan.sales.length + plan.purchases.length, 0);
});

test("already imported fingerprints are skipped and a second run is idempotent", async () => {
  const plan = buildHistoricalImportPlan([row()], new Map());
  const mock = gateway();
  const first = await executeHistoricalImportPlan(plan, mock.api, true);
  const second = await executeHistoricalImportPlan(plan, mock.api, true);
  assert.equal(first.imported, 1);
  assert.equal(second.imported, 0);
  assert.equal(second.skipped, 1);
  assert.equal(mock.calls.sales, 1);
  assert.equal(mock.calls.batch, 1);
});

test("approved purchase split becomes one purchase with multiple items", () => {
  const rows = [
    row({ source_sheet: "Control de compras", source_row: "58", split_line: "1", record_type: "purchase", fingerprint: fingerprint("b"), unit_amount: "50", total: "100", quantity: "2" }),
    row({ source_sheet: "Control de compras", source_row: "58", split_line: "2", record_type: "purchase", fingerprint: fingerprint("c"), matched_product_id: "00000000-0000-4000-8000-000000000002", unit_amount: "50", total: "50" }),
  ];
  const plan = buildHistoricalImportPlan(rows, new Map());
  assert.equal(plan.purchases.length, 1);
  assert.equal(plan.purchases[0].items.length, 2);
  assert.equal(plan.purchases[0].items.reduce((sum, item) => sum + item.source_total, 0), 150);
});

test("source total is preserved when it differs from quantity times unit price", () => {
  const plan = buildHistoricalImportPlan([row({ unit_amount: "77500", total: "74787.5" })], new Map());
  assert.equal(plan.sales[0].items[0].unit_price, 77500);
  assert.equal(plan.sales[0].items[0].source_total, 74787.5);
});

test("artificial purchase date keeps an explicit note", () => {
  const plan = buildHistoricalImportPlan([row({ source_sheet: "Control de compras", source_row: "154", record_type: "purchase", date: "2026-04-18" })], new Map());
  assert.equal(plan.purchases[0].occurredOn, "2026-04-18");
  assert.match(plan.purchases[0].notes, /fecha no existía en la fuente/i);
});

test("confirmed payment is included and absent evidence creates no payment", () => {
  const paid = buildHistoricalImportPlan([row()], new Map([[1, { paymentMethod: "transfer", paymentAmount: 100, notes: "Pago completo." }]]));
  assert.equal(paid.sales[0].paymentMethod, "transfer");
  assert.equal(paid.sales[0].paymentAmount, 100);
  const unknown = buildHistoricalImportPlan([row()], new Map());
  assert.equal(unknown.sales[0].paymentMethod, null);
  assert.equal(unknown.sales[0].paymentAmount, null);
});

test("executor only writes through historical RPCs and audit batch", () => {
  const script = readFileSync(join(root, "scripts", "import-historical-data.ts"), "utf8");
  assert.match(script, /rpc\("import_historical_sale"/);
  assert.match(script, /rpc\("import_historical_purchase"/);
  assert.doesNotMatch(script, /apply_sale_inventory|complete_store_sale|deliver_order|confirm_purchase/);
  assert.doesNotMatch(script, /from\("products"\)|from\("inventory_movements"\)/);
});
