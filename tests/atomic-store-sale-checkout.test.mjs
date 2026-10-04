import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const migration = source(
  "supabase",
  "migrations",
  "202610030001_atomic_store_sale_checkout.sql",
);
const createMigration = source(
  "supabase",
  "migrations",
  "202609210002_store_sale_custom_unit_price.sql",
);
const inventoryMigration = source(
  "supabase",
  "migrations",
  "202609170003_atomic_sales_inventory.sql",
);
const actions = source("app", "admin", "ventas", "actions.ts");
const service = source("services", "store-sales.ts");
const form = source(
  "components",
  "admin",
  "sales",
  "store-sale-form.tsx",
);
const paymentForm = source(
  "components",
  "admin",
  "sales",
  "store-sale-payment-form.tsx",
);
const model = await import(
  pathToFileURL(join(root, "lib", "store-sales.ts")).href
);

function functionBlock(name, nextName) {
  const start = migration.indexOf(`create or replace function ${name}`);
  const end = nextName
    ? migration.indexOf(`create or replace function ${nextName}`)
    : migration.indexOf("revoke all on function", start);
  assert.ok(start >= 0, `${name} is missing`);
  assert.ok(end > start, `${name} has no closing boundary`);
  return migration.slice(start, end);
}

const createBlock = functionBlock(
  "create_store_sale_atomic",
  "record_store_sale_payment_atomic",
);
const paymentBlock = functionBlock("record_store_sale_payment_atomic");

test("one RPC owns order items initial payments and paid inventory", () => {
  assert.match(createBlock, /select public\.create_store_sale\(/i);
  assert.match(createBlock, /select public\.record_order_payment\(/i);
  assert.match(
    createBlock,
    /if v_payment_status = 'paid' then[\s\S]+select public\.complete_store_sale\(/i,
  );
  assert.doesNotMatch(createBlock, /exception\s+when/i);
});

test("the server action performs exactly one database operation per submit", () => {
  const createAction = actions.slice(
    actions.indexOf("export async function createStoreSaleAction"),
    actions.indexOf("export async function addStoreSalePaymentAction"),
  );
  const addPaymentAction = actions.slice(
    actions.indexOf("export async function addStoreSalePaymentAction"),
  );

  assert.match(createAction, /await createStoreSale\(/i);
  assert.doesNotMatch(createAction, /for \(const \[index, payment\]/i);
  assert.doesNotMatch(createAction, /completeStoreSale|addStoreSalePayment/i);
  assert.match(addPaymentAction, /await addStoreSalePayment\(/i);
  assert.doesNotMatch(addPaymentAction, /completeStoreSale/i);
});

test("service calls only the atomic store-sale RPCs", () => {
  assert.match(service, /"create_store_sale_atomic"/i);
  assert.match(service, /p_payments: input\.payments/i);
  assert.match(service, /"record_store_sale_payment_atomic"/i);
  assert.match(service, /p_created_by: input\.createdBy/i);
  assert.doesNotMatch(service, /addOrderPayment\(/i);
});

test("simple and multi-item sales keep server-calculated custom totals", () => {
  assert.match(createMigration, /v_total := v_total \+ round\(v_line\.unit_price \* v_line\.quantity, 2\)/i);
  assert.match(createMigration, /insert into order_items[\s\S]+round\(item\.unit_price \* item\.quantity, 2\)/i);
  assert.doesNotMatch(actions, /formData\.get\("total"\)|formData\.getAll\("subtotal"\)/i);
});

test("products must exist be active operational and have sufficient stock", () => {
  assert.match(createBlock, /product\.historical_identity[\s\S]+STORE_SALE_PRODUCT_HISTORICAL/i);
  assert.match(createMigration, /v_line\.status <> 'active'[\s\S]+STORE_SALE_PRODUCT_INACTIVE/i);
  assert.match(createMigration, /v_locked_count <> v_item_count[\s\S]+STORE_SALE_PRODUCT_NOT_FOUND/i);
  assert.match(createMigration, /v_line\.quantity > v_line\.stock[\s\S]+STORE_SALE_STOCK_INSUFFICIENT/i);
});

test("quantities and custom prices are validated by the database", () => {
  assert.match(createMigration, /quantity <= 0[\s\S]+quantity <> trunc\(quantity\)/i);
  assert.match(createMigration, /unit_price <= 0[\s\S]+unit_price <> round\(unit_price, 2\)/i);
  assert.match(createMigration, /unit_price > 9999999999\.99/i);
});

test("single and split payments are validated before persistence completes", () => {
  assert.match(createBlock, /jsonb_typeof\(p_payments\) <> 'array'/i);
  assert.match(createBlock, /'cash', 'transfer', 'card', 'other'/i);
  assert.match(createBlock, /v_payment_amount <= 0/i);
  assert.match(createBlock, /v_payment_amount <> round\(v_payment_amount, 2\)/i);
  assert.match(createBlock, /from jsonb_array_elements\(p_payments\) with ordinality/i);
  assert.match(createBlock, /order by ordinality/i);
});

test("overpayment or any intermediate payment error rolls back the outer RPC", () => {
  assert.match(createBlock, /select public\.record_order_payment\([\s\S]+false/i);
  assert.doesNotMatch(createBlock, /begin[\s\S]+exception\s+when[\s\S]+continue/i);
  assert.match(service, /ORDER_PAYMENT_OVERPAYMENT/i);
});

test("partial payment remains partial and never calls inventory", () => {
  assert.match(createBlock, /v_payment_status := v_payment_result ->> 'payment_status'/i);
  assert.match(
    createBlock,
    /if v_payment_status = 'paid' then[\s\S]+complete_store_sale/i,
  );
  assert.doesNotMatch(createBlock, /if v_payment_status = 'partial' then[\s\S]+complete_store_sale/i);
});

test("a later final payment and inventory complete in one transaction", () => {
  assert.match(paymentBlock, /select public\.record_order_payment\(/i);
  assert.match(
    paymentBlock,
    /if v_payment_result ->> 'payment_status' = 'paid' then[\s\S]+select public\.complete_store_sale\(/i,
  );
  assert.doesNotMatch(paymentBlock, /exception\s+when/i);
});

test("stock failure cannot retain the payment or partial movements", () => {
  assert.match(inventoryMigration, /SALE_INVENTORY_STOCK_INSUFFICIENT/i);
  assert.ok(
    inventoryMigration.indexOf("SALE_INVENTORY_STOCK_INSUFFICIENT") <
      inventoryMigration.indexOf("insert into inventory_movements"),
  );
  assert.match(service, /No hay stock suficiente\. El pago no fue registrado\./i);
  assert.match(service, /No hay stock suficiente\. No se registro la venta ni sus pagos\./i);
});

test("paid creation locks products exclusively before the legacy shared lock", () => {
  assert.match(
    createBlock,
    /from public\.products product[\s\S]+order by product\.id[\s\S]+for update of product[\s\S]+select public\.create_store_sale\(/i,
  );
});

test("exact stock is accepted and each order item has one movement", () => {
  assert.match(inventoryMigration, /if v_product\.stock < v_product\.quantity then/i);
  assert.match(inventoryMigration, /inventory_movements_sale_order_item_unique/i);
  assert.match(inventoryMigration, /order_item_id,[\s\S]+v_item\.id/i);
});

test("create retries use a lock and an immutable request fingerprint", () => {
  assert.match(createBlock, /pg_advisory_xact_lock/i);
  assert.match(createBlock, /store_sale_request_fingerprint/i);
  assert.match(createBlock, /STORE_SALE_IDEMPOTENCY_CONFLICT/i);
  assert.match(createBlock, /'operation', 'already_created'/i);
  assert.match(form, /crypto\.randomUUID\(\)/i);
});

test("payment retries reject changed data and reapply inventory idempotently", () => {
  assert.match(paymentBlock, /pg_advisory_xact_lock\(hashtextextended\(p_order_id::text, 0\)\)/i);
  assert.match(paymentBlock, /pg_advisory_xact_lock\(hashtextextended\(v_reference, 0\)\)/i);
  assert.match(paymentBlock, /v_existing_payment\.amount <> round\(p_amount, 2\)/i);
  assert.match(paymentBlock, /STORE_SALE_PAYMENT_REFERENCE_CONFLICT/i);
  assert.match(inventoryMigration, /'status', 'already_applied'/i);
  assert.match(paymentForm, /name="paymentKey"/i);
});

test("atomic RPCs are invoker-security and service-role only", () => {
  assert.match(createBlock, /security invoker/i);
  assert.match(paymentBlock, /security invoker/i);
  assert.match(createBlock, /set search_path = pg_catalog, public/i);
  assert.match(paymentBlock, /set search_path = pg_catalog, public/i);
  assert.match(
    migration,
    /revoke all on function create_store_sale_atomic[\s\S]+public, anon, authenticated[\s\S]+grant execute[\s\S]+service_role/i,
  );
  assert.match(
    migration,
    /revoke all on function record_store_sale_payment_atomic[\s\S]+public, anon, authenticated[\s\S]+grant execute[\s\S]+service_role/i,
  );
});

test("payment parser preserves numeric precision and rejects unsafe values", () => {
  assert.equal(model.parseStoreSalePaymentAmount("100"), 100);
  assert.equal(model.parseStoreSalePaymentAmount("100,25"), 100.25);
  for (const value of ["", "0", "-1", "10.001", "NaN", "10000000000.00"]) {
    assert.throws(() => model.parseStoreSalePaymentAmount(value));
  }
});

test("success and failure always return visible action state while pending is form-scoped", () => {
  assert.match(actions, /status: "success"/i);
  assert.match(actions, /status: "error"/i);
  assert.match(form, /PendingSubmitButton[\s\S]+pendingLabel="Registrando\.\.\."/i);
  assert.match(paymentForm, /PendingSubmitButton[\s\S]+pendingLabel="Registrando\.\.\."/i);
});

