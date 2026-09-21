import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const migration = source("supabase", "migrations", "202609210002_store_sale_custom_unit_price.sql");
const form = source("components", "admin", "sales", "store-sale-form.tsx");
const actions = source("app", "admin", "ventas", "actions.ts");
const service = source("services", "store-sales.ts");
const detail = source("app", "admin", "ventas", "[id]", "page.tsx");
const inventoryMigration = source("supabase", "migrations", "202609170003_atomic_sales_inventory.sql");
const checkout = source("services", "orders.ts");
const model = await import(pathToFileURL(join(root, "lib", "store-sales.ts")).href);

test("initial unit price keeps transfer-first catalog policy", () => {
  assert.equal(model.getStoreSaleUnitPrice({ price: 12000, transfer_price: 10500 }), 10500);
  assert.equal(model.getStoreSaleUnitPrice({ price: 12000, transfer_price: null }), 12000);
  assert.match(form, /getStoreSaleUnitPrice\(product\)\.toFixed\(2\)/i);
});

test("unit price is editable and submitted for every sale line", () => {
  assert.match(form, /name="unitPrice"/i);
  assert.match(form, /value=\{line\.unitPrice\}/i);
  assert.match(form, /updateUnitPrice/i);
});

test("custom price and quantity calculate the visible subtotal", () => {
  assert.equal(model.calculateStoreSaleTotal([{ quantity: 2, unitPrice: 10500 }]), 21000);
  assert.match(form, /unitPrice \* line\.quantity/i);
});

test("multiple custom-priced lines calculate one normalized total", () => {
  assert.equal(model.calculateStoreSaleTotal([
    { quantity: 2, unitPrice: 10500 },
    { quantity: 1, unitPrice: 11300.25 },
  ]), 32300.25);
});

test("parallel form arrays must align before reaching the service", () => {
  assert.match(actions, /getAll\("productId"\)/i);
  assert.match(actions, /getAll\("quantity"\)/i);
  assert.match(actions, /getAll\("unitPrice"\)/i);
  assert.match(actions, /productIds\.length !== unitPrices\.length/i);
  assert.match(actions, /unitPrice: unitPrices\[index\]/i);
});

test("money parser accepts two decimals exactly", () => {
  assert.equal(model.parseStoreSaleUnitPrice("10500"), 10500);
  assert.equal(model.parseStoreSaleUnitPrice("10500,25"), 10500.25);
  assert.equal(model.parseStoreSaleUnitPrice("10500.2"), 10500.2);
});

test("money parser rejects zero, negatives and invalid values", () => {
  for (const value of ["0", "-1", "NaN", "Infinity", "", "abc"]) {
    assert.throws(() => model.parseStoreSaleUnitPrice(value));
  }
});

test("money parser rejects excess precision and numeric overflow", () => {
  assert.throws(() => model.parseStoreSaleUnitPrice("10500.001"), /2 decimales/i);
  assert.throws(() => model.parseStoreSaleUnitPrice("10000000000.00"), /maximo/i);
});

test("service sends the validated custom unit price to the RPC", () => {
  assert.match(service, /unitPrice: number/i);
  assert.match(service, /unit_price: item\.unitPrice/i);
});

test("RPC validates custom price independently from catalog prices", () => {
  assert.match(migration, /unit_price is null[\s\S]+unit_price <= 0/i);
  assert.match(migration, /unit_price <> round\(unit_price, 2\)/i);
  assert.match(migration, /STORE_SALE_PRICE_INVALID/i);
  assert.doesNotMatch(migration, /coalesce\(product\.transfer_price, product\.price\)/i);
});

test("RPC recalculates line subtotals and order total server-side", () => {
  assert.match(migration, /v_total := v_total \+ round\(v_line\.unit_price \* v_line\.quantity, 2\)/i);
  assert.match(migration, /round\(item\.unit_price \* item\.quantity, 2\)/i);
  assert.doesNotMatch(actions, /formData\.get\("total"\)|formData\.getAll\("subtotal"\)/i);
});

test("catalog prices and costs are never modified", () => {
  const implementation = [migration, actions, service].join("\n");
  assert.doesNotMatch(implementation, /update\s+products[\s\S]+(?:price|transfer_price|cost)/i);
  assert.doesNotMatch(service, /\.from\("products"\)[\s\S]+\.update/i);
});

test("historical detail reads snapshot price and subtotal from order items", () => {
  assert.match(detail, /item\.unit_price/i);
  assert.match(detail, /item\.subtotal/i);
  assert.doesNotMatch(detail, /getStoreSaleUnitPrice|product\.price|product\.transfer_price/i);
});

test("payments and overpayment use the RPC-returned custom total", () => {
  assert.match(actions, /enteredPayments > Number\(sale\.total\)/i);
  assert.match(form, /paid > total/i);
  assert.match(form, /remaining.*total - paid/i);
});

test("stock still changes only after aggregate payment is paid", () => {
  assert.match(actions, /if \(paymentStatus === "paid"\)[\s\S]+completeStoreSale/i);
  assert.doesNotMatch(migration, /update products|insert into inventory_movements/i);
  assert.match(inventoryMigration, /create or replace function apply_sale_inventory/i);
});

test("sale inventory remains idempotent", () => {
  assert.match(inventoryMigration, /'status', 'already_applied'/i);
  assert.match(inventoryMigration, /inventory_movements_sale_order_item_unique/i);
});

test("search matches name fragments and SKU", () => {
  const product = { name: "Mate Imperial virola alpaca", sku: "MAT-900" };
  assert.equal(model.matchesStoreSaleProduct(product, "Imperial virola"), true);
  assert.equal(model.matchesStoreSaleProduct(product, "MAT-900"), true);
});

test("search ignores accents and case", () => {
  assert.equal(model.matchesStoreSaleProduct({ name: "Edición Cinceláda", sku: null }, "EDICION CINCELADA"), true);
});

test("product loading intentionally exposes only active products without stock filtering", () => {
  assert.match(service, /\.eq\("status", "active"\)/i);
  assert.doesNotMatch(service, /\.gt\("stock"|\.gte\("stock"/i);
});

test("existing store-sale details remain snapshot-readable", () => {
  assert.match(service, /order_items \([\s\S]+unit_price, quantity, subtotal/i);
  assert.match(detail, /Precio/i);
});

test("web checkout remains unchanged", () => {
  assert.match(checkout, /channel: "web"/i);
  assert.doesNotMatch(migration, /channel\s*=\s*'web'|update orders[\s\S]+channel/i);
});

test("customer order channel is not modified by this migration", () => {
  assert.doesNotMatch(migration, /channel\s*=\s*'order'|save_customer_order|deliver_order/i);
});

test("replacement RPC remains invoker-security and service-role only", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function create_store_sale[\s\S]+public, anon, authenticated/i);
  assert.match(migration, /grant execute on function create_store_sale[\s\S]+service_role/i);
});
