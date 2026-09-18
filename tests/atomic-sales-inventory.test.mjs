import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(testDirectory, "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const migration = source(
  "supabase",
  "migrations",
  "202609170003_atomic_sales_inventory.sql",
);
const inventoryService = source("services", "inventory.ts");
const webhook = source("app", "api", "mercadopago", "webhook", "route.ts");
const orderActions = source("app", "admin", "pedidos", "actions.ts");
const inventoryPage = source("app", "admin", "inventario", "page.tsx");
const purchaseMigration = source(
  "supabase",
  "migrations",
  "202609170001_purchase_confirmation.sql",
);
const adjustmentMigration = source(
  "supabase",
  "migrations",
  "202609170002_inventory_audit_foundation.sql",
);

test("sale inventory runs in one service-role-only transaction", () => {
  assert.match(migration, /create or replace function apply_sale_inventory/i);
  assert.match(migration, /security invoker/i);
  assert.match(
    migration,
    /revoke all on function apply_sale_inventory\(uuid, uuid\)[\s\S]+public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function apply_sale_inventory\(uuid, uuid\)[\s\S]+service_role/i,
  );
});

test("the order and products are locked in deterministic order", () => {
  assert.match(migration, /from orders[\s\S]+for update/i);
  assert.match(
    migration,
    /join products product[\s\S]+order by product\.id[\s\S]+for update of product/i,
  );
});

test("all lines are validated before any product update", () => {
  const firstProductUpdate = migration.indexOf("update products");
  const stockValidation = migration.indexOf("v_product.stock < v_product.quantity");
  const missingValidation = migration.indexOf("SALE_INVENTORY_PRODUCT_MISSING");
  const noLinesValidation = migration.indexOf("SALE_INVENTORY_NO_LINES");

  assert.ok(firstProductUpdate > stockValidation);
  assert.ok(firstProductUpdate > missingValidation);
  assert.ok(firstProductUpdate > noLinesValidation);
  assert.match(migration, /if v_new_stock < 0/i);
});

test("a normal sale writes one positive auditable movement per aggregated product", () => {
  assert.match(migration, /group by product_id/i);
  assert.match(migration, /update products[\s\S]+set stock = v_new_stock/i);
  assert.match(migration, /insert into inventory_movements/i);
  assert.match(
    migration,
    /'sale',[\s\S]+v_product\.quantity,[\s\S]+v_product\.stock,[\s\S]+v_new_stock/i,
  );
  assert.match(migration, /'Venta confirmada',[\s\S]+p_created_by/i);
  assert.doesNotMatch(migration, /-v_product\.quantity/i);
});

test("exact stock is allowed while insufficient stock aborts before writes", () => {
  assert.match(migration, /v_product\.stock < v_product\.quantity/i);
  assert.doesNotMatch(migration, /v_product\.stock <= v_product\.quantity/i);
  assert.match(migration, /SALE_INVENTORY_STOCK_INSUFFICIENT/i);
  assert.ok(
    migration.indexOf("SALE_INVENTORY_STOCK_INSUFFICIENT") <
      migration.indexOf("update products"),
  );
});

test("missing products, empty orders and invalid quantities are distinct", () => {
  assert.match(migration, /SALE_INVENTORY_PRODUCT_MISSING/i);
  assert.match(migration, /SALE_INVENTORY_NO_LINES/i);
  assert.match(migration, /SALE_INVENTORY_INVALID_QUANTITY/i);
  assert.match(inventoryService, /code: "product_missing"/i);
  assert.match(inventoryService, /code: "no_lines"/i);
  assert.match(inventoryService, /code: "invalid_quantity"/i);
  assert.match(inventoryService, /code: "stock_insufficient"/i);
});

test("retries are idempotent by order lock, metadata and a unique movement key", () => {
  assert.match(
    migration,
    /inventory_movements_sale_order_product_unique[\s\S]+order_id, product_id[\s\S]+movement_type = 'sale'/i,
  );
  assert.match(
    migration,
    /stock_decrease_status'[\s\S]+completed[\s\S]+or exists[\s\S]+movement_type = 'sale'/i,
  );
  assert.match(migration, /'status', 'already_applied'/i);
  assert.match(migration, /'movements_created', 0/i);
  assert.match(inventoryService, /result\.status === "already_applied"/i);
});

test("the service delegates stock math and movement creation to one RPC", () => {
  const saleBlock = inventoryService.slice(
    inventoryService.indexOf("export async function decreaseStockForOrder"),
  );

  assert.match(saleBlock, /\.rpc\([\s\S]+"apply_sale_inventory"/i);
  assert.match(saleBlock, /p_order_id: orderId/i);
  assert.match(saleBlock, /p_created_by: createdBy/i);
  assert.doesNotMatch(saleBlock, /\.from\("products"\)/i);
  assert.doesNotMatch(saleBlock, /\.update\(\{ stock/i);
  assert.doesNotMatch(saleBlock, /\.from\("inventory_movements"\)[\s\S]+\.insert/i);
});

test("Mercado Pago retries keep using the idempotent inventory service", () => {
  assert.match(
    webhook,
    /paymentStatus === "approved"[\s\S]+decreaseStockForOrder\(order\.id\)/i,
  );
  assert.match(webhook, /stock_decrease: stockResult/i);
});

test("manual approval records the admin actor without changing its trigger rules", () => {
  assert.match(orderActions, /const user = await requireAdminActionSession\(\)/i);
  assert.match(
    orderActions,
    /paymentApprovedChanged \|\| statusConfirmedOrPaidChanged[\s\S]+decreaseStockForOrder\(orderId, user\.id\)/i,
  );
});

test("purchase and adjustment RPCs remain independent and unchanged", () => {
  assert.match(purchaseMigration, /create or replace function confirm_purchase/i);
  assert.match(adjustmentMigration, /create or replace function adjust_inventory_stock/i);
  assert.doesNotMatch(migration, /create or replace function confirm_purchase/i);
  assert.doesNotMatch(migration, /create or replace function adjust_inventory_stock/i);
});

test("the inventory history still exposes sale movements", () => {
  assert.match(inventoryService, /"purchase",[\s\S]+"sale",[\s\S]+"adjustment"/i);
  assert.match(inventoryPage, /INVENTORY_MOVEMENT_TYPES/i);
  assert.match(inventoryPage, /sale/i);
});
