import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(testDirectory, "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const migration = source(
  "supabase",
  "migrations",
  "202609180001_unified_sales_payments.sql",
);
const paymentService = source("services", "order-payments.ts");
const checkoutService = source("services", "orders.ts");
const webhook = source("app", "api", "mercadopago", "webhook", "route.ts");
const inventoryService = source("services", "inventory.ts");
const adminOrders = source("services", "admin.ts");
const adminActions = source("app", "admin", "pedidos", "actions.ts");
const paymentModel = await import(
  pathToFileURL(join(root, "lib", "order-payments.ts")).href
);

test("existing checkout orders remain web orders", () => {
  assert.match(migration, /channel text not null default 'web'/i);
  assert.match(checkoutService, /channel: "web"/i);
  assert.match(adminOrders, /channel,/i);
});

test("only supported sales channels pass the database constraint", () => {
  assert.match(
    migration,
    /orders_channel_check[\s\S]+channel in \('web', 'store', 'order'\)/i,
  );
  assert.doesNotMatch(migration, /channel in \([^)]*'invalid'/i);
});

test("future store sales do not require checkout-only relations", () => {
  assert.match(migration, /customer_id drop not null/i);
  assert.match(migration, /payment_method drop not null/i);
  assert.match(migration, /shipping_method drop not null/i);
});

test("payment ledger supports cash, transfer, card, Mercado Pago and other", () => {
  assert.match(migration, /create table if not exists order_payments/i);

  for (const method of ["cash", "transfer", "card", "mercadopago", "other"]) {
    assert.match(migration, new RegExp(`'${method}'`));
    assert.ok(paymentModel.ORDER_PAYMENT_METHODS.includes(method));
  }

  assert.match(migration, /amount numeric\(12, 2\) not null check \(amount > 0\)/i);
});

test("multiple approved payments produce the correct total and remaining amount", () => {
  assert.deepEqual(
    paymentModel.calculateOrderPaymentSummary(80_000, [
      { amount: 30_000, status: "approved" },
      { amount: 50_000, status: "approved" },
    ]),
    { totalPaid: 80_000, remainingAmount: 0, paymentStatus: "paid" },
  );
});

test("pending, partial, paid and refunded summaries are distinct", () => {
  assert.equal(
    paymentModel.calculateOrderPaymentSummary(100, []).paymentStatus,
    "pending",
  );
  assert.equal(
    paymentModel.calculateOrderPaymentSummary(100, [
      { amount: 40, status: "approved" },
    ]).paymentStatus,
    "partial",
  );
  assert.equal(
    paymentModel.calculateOrderPaymentSummary(100, [
      { amount: 100, status: "approved" },
    ]).paymentStatus,
    "paid",
  );
  assert.equal(
    paymentModel.calculateOrderPaymentSummary(100, [
      { amount: 100, status: "refunded" },
    ]).paymentStatus,
    "refunded",
  );
});

test("rejected and pending entries do not count as paid", () => {
  assert.deepEqual(
    paymentModel.calculateOrderPaymentSummary(100, [
      { amount: 80, status: "pending" },
      { amount: 20, status: "rejected" },
    ]),
    { totalPaid: 0, remainingAmount: 100, paymentStatus: "pending" },
  );
});

test("money calculations are normalized to database precision", () => {
  assert.equal(paymentModel.normalizePaymentAmount(10.005), 10.01);
  assert.equal(paymentModel.normalizePaymentAmount(10.004), 10);
  assert.throws(
    () => paymentModel.normalizePaymentAmount(Number.NaN),
    /no es valido/i,
  );
});

test("overpayment is rejected by the transactional RPC unless explicitly allowed", () => {
  assert.match(
    migration,
    /if not p_allow_overpayment and v_total_paid > v_order\.total[\s\S]+ORDER_PAYMENT_OVERPAYMENT/i,
  );
  assert.match(paymentService, /ORDER_PAYMENT_OVERPAYMENT/i);
});

test("recording a payment and payment status is one service-role-only transaction", () => {
  assert.match(migration, /create or replace function record_order_payment/i);
  assert.match(migration, /from orders[\s\S]+for update/i);
  assert.match(migration, /insert into order_payments/i);
  assert.match(migration, /update orders[\s\S]+payment_status/i);
  assert.match(migration, /security invoker/i);
  assert.match(
    migration,
    /revoke all on function record_order_payment\([\s\S]+public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function record_order_payment\([\s\S]+service_role/i,
  );
});

test("the payment table is not available to browser roles", () => {
  assert.match(migration, /alter table order_payments enable row level security/i);
  assert.match(
    migration,
    /revoke all on table order_payments from public, anon, authenticated/i,
  );
});

test("the server service lists, summarizes and records payments", () => {
  assert.match(paymentService, /export async function listOrderPayments/i);
  assert.match(paymentService, /export async function getOrderPaymentSummary/i);
  assert.match(paymentService, /export async function addOrderPayment/i);
  assert.match(paymentService, /\.rpc\([\s\S]+"record_order_payment"/i);
});

test("Mercado Pago records an idempotent referenced ledger entry", () => {
  assert.match(
    migration,
    /unique index if not exists order_payments_method_reference_unique[\s\S]+method, reference/i,
  );
  assert.match(webhook, /addOrderPayment\(\{[\s\S]+method: "mercadopago"/i);
  assert.match(webhook, /reference: String\(payment\.id \?\? paymentId\)/i);
  assert.match(webhook, /payment_operation: paymentResult\.operation/i);
});

test("a duplicate external reference updates or reuses one payment instead of inserting another", () => {
  assert.match(
    migration,
    /where method = p_method[\s\S]+reference = v_reference[\s\S]+for update/i,
  );
  assert.match(migration, /v_operation := 'already_applied'/i);
  assert.match(migration, /v_operation := 'updated'/i);
});

test("Mercado Pago only applies sale inventory after the aggregate payment is paid", () => {
  assert.match(
    webhook,
    /statusUpdate\.entryStatus === "approved"[\s\S]+paymentResult\.paymentStatus === "paid"[\s\S]+decreaseStockForOrder\(order\.id\)/i,
  );
  assert.match(webhook, /stock_decrease: stockResult/i);
});

test("recording a payment does not modify products, stock or inventory movements", () => {
  const paymentFunction = migration.slice(
    migration.indexOf("create or replace function record_order_payment"),
  );
  const addPaymentService = paymentService.slice(
    paymentService.indexOf("export async function addOrderPayment"),
  );

  assert.doesNotMatch(paymentFunction, /update products|insert into inventory_movements/i);
  assert.doesNotMatch(addPaymentService, /products|inventory_movements|stock/i);
  assert.match(inventoryService, /"apply_sale_inventory"/i);
});

test("the existing atomic sale inventory RPC remains independent", () => {
  assert.doesNotMatch(migration, /create or replace function apply_sale_inventory/i);
  assert.match(inventoryService, /export async function decreaseStockForOrder/i);
  assert.match(inventoryService, /"apply_sale_inventory"/i);
});

test("legacy checkout payment selection remains available during the transition", () => {
  assert.match(checkoutService, /export type PaymentMethod = "transfer" \| "mercadopago"/i);
  assert.match(checkoutService, /payment_method: payload\.paymentMethod/i);
  assert.match(
    migration,
    /Legacy checkout payment selection\. New payment truth lives in order_payments/i,
  );
});

test("admin orders understand canonical payment states without losing legacy states", () => {
  for (const status of [
    "pending",
    "partial",
    "paid",
    "approved",
    "rejected",
    "refunded",
  ]) {
    assert.match(adminActions, new RegExp(`"${status}"`));
  }

  assert.match(adminOrders, /order\.payment_status === "paid"/i);
});

test("the migration does not implement reservations or a local-sale UI", () => {
  assert.doesNotMatch(migration, /reservation|release|cash_register|register_closure/i);
  assert.doesNotMatch(paymentService, /reservation|cash_register|register_closure/i);
});
