import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(testDirectory, "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const migration = source("supabase", "migrations", "202609180002_store_sales_checkout.sql");
const inventoryMigration = source("supabase", "migrations", "202609170003_atomic_sales_inventory.sql");
const paymentMigration = source("supabase", "migrations", "202609180001_unified_sales_payments.sql");
const actions = source("app", "admin", "ventas", "actions.ts");
const listPage = source("app", "admin", "ventas", "page.tsx");
const detailPage = source("app", "admin", "ventas", "[id]", "page.tsx");
const newPage = source("app", "admin", "ventas", "nueva", "page.tsx");
const form = source("components", "admin", "sales", "store-sale-form.tsx");
const paymentForm = source("components", "admin", "sales", "store-sale-payment-form.tsx");
const service = source("services", "store-sales.ts");
const checkoutService = source("services", "orders.ts");
const webhook = source("app", "api", "mercadopago", "webhook", "route.ts");
const model = await import(pathToFileURL(join(root, "lib", "store-sales.ts")).href);

test("store sale mutations require an authorized admin", () => {
  assert.match(actions, /createStoreSaleAction[\s\S]+requireAdminActionSession\(\)/i);
  assert.match(actions, /addStoreSalePaymentAction[\s\S]+requireAdminActionSession\(\)/i);
});

test("new admin sales are persisted with channel store", () => {
  assert.match(migration, /insert into orders[\s\S]+'store'/i);
  assert.match(migration, /channel = 'store'/i);
});

test("a store sale without items is rejected", () => {
  assert.match(migration, /jsonb_array_length\(p_items\) = 0[\s\S]+STORE_SALE_NO_ITEMS/i);
});

test("invalid and non-integer quantities are rejected", () => {
  assert.match(migration, /quantity <= 0[\s\S]+quantity <> trunc\(quantity\)/i);
  assert.match(migration, /STORE_SALE_QUANTITY_INVALID/i);
});

test("quantity above current stock is rejected before insertion", () => {
  assert.match(migration, /v_line\.quantity > v_line\.stock[\s\S]+STORE_SALE_STOCK_INSUFFICIENT/i);
  assert.ok(migration.indexOf("STORE_SALE_STOCK_INSUFFICIENT") < migration.indexOf("insert into orders"));
});

test("order and snapshot items are created by one transactional RPC", () => {
  assert.match(migration, /create or replace function create_store_sale/i);
  assert.match(migration, /insert into orders/i);
  assert.match(migration, /insert into order_items/i);
  assert.match(service, /\.rpc\([\s\S]+"create_store_sale"/i);
});

test("a sale can remain pending without payments", () => {
  assert.match(migration, /'pending',[\s\S]+null,[\s\S]+'pending'/i);
  assert.match(actions, /let paymentStatus: OrderPaymentStatus = "pending"/i);
});

test("cash is accepted as a local payment method", () => {
  assert.match(actions, /"cash"/i);
  assert.match(form, /value="cash">Efectivo/i);
});

test("transfer is accepted as a local payment method", () => {
  assert.match(actions, /"transfer"/i);
  assert.match(form, /value="transfer">Transferencia/i);
});

test("multiple payment rows are submitted and processed in order", () => {
  assert.match(form, /setPayments\(\(current\) => \[\.\.\.current, newPayment\(\)\]\)/i);
  assert.match(actions, /for \(const \[index, payment\] of payments\.entries\(\)\)/i);
});

test("partial payments remain partial and warn that stock is untouched", () => {
  assert.match(actions, /paymentStatus === "partial"[\s\S]+stock todavia no fue descontado/i);
  assert.match(detailPage, /Pago parcial: el stock no fue descontado ni reservado/i);
});

test("paid sales call the completion service", () => {
  assert.match(actions, /if \(paymentStatus === "paid"\)[\s\S]+completeStoreSale/i);
  assert.match(actions, /if \(payment\.paymentStatus === "paid"\)[\s\S]+completeStoreSale/i);
});

test("overpayment is rejected in UI, action and payment RPC", () => {
  assert.match(form, /paid > total/i);
  assert.match(actions, /enteredPayments > Number\(sale\.total\)/i);
  assert.match(paymentMigration, /ORDER_PAYMENT_OVERPAYMENT/i);
});

test("partial payment recording cannot update stock or movements", () => {
  const paymentBlock = paymentMigration.slice(paymentMigration.indexOf("create or replace function record_order_payment"));
  assert.doesNotMatch(paymentBlock, /update products|insert into inventory_movements/i);
  assert.match(actions, /paymentStatus === "paid"/i);
});

test("paid completion delegates stock work to apply_sale_inventory", () => {
  assert.match(migration, /select apply_sale_inventory\(p_order_id, p_created_by\)/i);
  assert.doesNotMatch(service, /\.from\("products"\)[\s\S]+\.update/i);
});

test("sale inventory writes one auditable movement per order item", () => {
  assert.match(inventoryMigration, /for v_item in[\s\S]+from order_items[\s\S]+insert into inventory_movements/i);
  assert.match(inventoryMigration, /order_item_id,[\s\S]+movement_type/i);
});

test("double submit reuses the same order idempotently", () => {
  assert.match(migration, /orders_store_idempotency_key_unique/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /'operation', 'already_created'/i);
  assert.match(form, /const \[idempotencyKey\] = useState\(\(\) => crypto\.randomUUID\(\)\)/i);
});

test("duplicate payment references do not create duplicate entries", () => {
  assert.match(actions, /store:\$\{idempotencyKey\}:payment:\$\{index \+ 1\}/i);
  assert.match(paymentMigration, /order_payments_method_reference_unique/i);
  assert.match(paymentMigration, /v_operation := 'already_applied'/i);
});

test("the persisted payment count supplies the next idempotent payment key", () => {
  assert.match(detailPage, /paymentSequence=\{sale\.order_payments\.length \+ 1\}/i);
  assert.match(paymentForm, /name="paymentKey" value=\{String\(paymentSequence\)\}/i);
});

test("apply_sale_inventory remains idempotent", () => {
  assert.match(inventoryMigration, /'status', 'already_applied'/i);
  assert.match(inventoryMigration, /inventory_movements_sale_order_item_unique/i);
});

test("insufficient stock at completion aborts inventory atomically and is visible", () => {
  assert.match(inventoryMigration, /SALE_INVENTORY_STOCK_INSUFFICIENT/i);
  assert.ok(inventoryMigration.indexOf("SALE_INVENTORY_STOCK_INSUFFICIENT") < inventoryMigration.indexOf("update products"));
  assert.match(service, /El pago quedo registrado, pero ya no hay stock suficiente/i);
  assert.match(detailPage, /El pago esta completo, pero el stock no fue descontado/i);
});

test("existing web checkout remains explicitly channel web", () => {
  assert.match(checkoutService, /channel: "web"/i);
  assert.doesNotMatch(migration, /update orders[\s\S]+channel = 'store'/i);
});

test("Mercado Pago continues using the shared payment and inventory services", () => {
  assert.match(webhook, /addOrderPayment/i);
  assert.match(webhook, /decreaseStockForOrder/i);
  assert.doesNotMatch(migration, /create or replace function record_order_payment/i);
});

test("sales list and new sale routes require an admin session", () => {
  assert.match(listPage, /await requireAdminSession\(\)/i);
  assert.match(newPage, /await requireAdminSession\(\)/i);
  assert.match(listPage, /listStoreSales/i);
});

test("sale detail is protected and only exposes additional payment for unpaid sales", () => {
  assert.match(detailPage, /await requireAdminSession\(\)/i);
  assert.match(detailPage, /payment_status === "pending" \|\| sale\.payment_status === "partial"/i);
  assert.match(detailPage, /StoreSalePaymentForm/i);
  assert.match(paymentForm, /PendingSubmitButton/i);
});

test("store sale totals use one transfer-first snapshot price", () => {
  assert.equal(model.getStoreSaleUnitPrice({ price: 120, transfer_price: 100 }), 100);
  assert.equal(model.getStoreSaleUnitPrice({ price: 120, transfer_price: null }), 120);
  assert.equal(model.calculateStoreSaleTotal([{ quantity: 2, unitPrice: 100.005 }]), 200.01);
  assert.equal(model.calculateEnteredPayments([{ method: "cash", amount: 30 }, { method: "transfer", amount: 50 }]), 80);
});
