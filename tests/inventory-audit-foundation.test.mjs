import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...parts) => readFileSync(join(root, ...parts), "utf8");
const migration = source("supabase", "migrations", "202609170002_inventory_audit_foundation.sql");
const actions = source("app", "admin", "productos", "actions.ts");
const service = source("services", "inventory.ts");
const page = source("app", "admin", "inventario", "page.tsx");
const adjustmentForm = source("components", "admin", "products", "inventory-adjustment-form.tsx");
const productForm = source("components", "admin", "products", "product-form.tsx");
const productPage = source("app", "admin", "productos", "page.tsx");
const navigation = source("components", "admin", "admin-nav.tsx");
const purchaseMigration = source("supabase", "migrations", "202609170001_purchase_confirmation.sql");
const saleMigration = source("supabase", "migrations", "202609170003_atomic_sales_inventory.sql");

test("adjustment RPC is service-role only and uses invoker security", () => {
  assert.match(migration, /create or replace function adjust_inventory_stock/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function adjust_inventory_stock[\s\S]+public, anon, authenticated/i);
  assert.match(migration, /grant execute on function adjust_inventory_stock[\s\S]+service_role/i);
});

test("adjustment RPC locks and validates the product plus all input", () => {
  assert.match(migration, /from products[\s\S]+where id = p_product_id[\s\S]+for update/i);
  assert.match(migration, /if not found[\s\S]+El producto no existe/i);
  assert.match(migration, /p_new_stock < 0/i);
  assert.match(migration, /p_new_stock <> trunc\(p_new_stock\)/i);
  assert.match(migration, /v_reason = ''[\s\S]+motivo del ajuste es obligatorio/i);
});

test("increases and decreases store a positive adjustment magnitude", () => {
  assert.match(migration, /abs\(v_new_stock::bigint - v_product\.stock::bigint\)/i);
  assert.match(migration, /'adjustment',[\s\S]+v_quantity,[\s\S]+v_product\.stock,[\s\S]+v_new_stock/i);
});

test("stock update and movement insert happen inside the same RPC transaction", () => {
  assert.match(migration, /update products[\s\S]+set stock = v_new_stock[\s\S]+insert into inventory_movements/i);
  assert.doesNotMatch(actions, /\.from\("products"\)[\s\S]{0,120}\.update\(\{\s*stock/i);
  assert.match(actions, /adjustInventoryStock\(/);
});

test("no-change is idempotent and creates no movement", () => {
  const noChangeBlock = migration.slice(migration.indexOf("if v_product.stock = v_new_stock"), migration.indexOf("v_quantity :="));
  assert.match(noChangeBlock, /'status', 'no_change'/i);
  assert.doesNotMatch(noChangeBlock, /insert into inventory_movements/i);
});

test("the product action requires admin and passes its actor to the RPC service", () => {
  assert.match(actions, /updateProductStock[\s\S]+requireAdminActionSession\(\)/i);
  assert.match(actions, /createdBy: user\.id/i);
  assert.match(service, /\.rpc\([\s\S]+"adjust_inventory_stock"/i);
  assert.match(service, /p_created_by: createdBy/i);
});

test("manual product editing cannot write stock directly", () => {
  assert.doesNotMatch(productForm, /name="stock"/);
  const catalogActions = actions.slice(0, actions.indexOf("export async function updateProductStock"));
  assert.doesNotMatch(catalogActions, /stock: parseStock/i);
  assert.doesNotMatch(catalogActions, /\.update\(\{\s*stock/i);
});

test("adjustment UI requires the new balance and a reason with pending feedback", () => {
  assert.match(adjustmentForm, /name="newStock"/);
  assert.match(adjustmentForm, /name="reason"/);
  assert.match(adjustmentForm, /required/);
  assert.match(adjustmentForm, /Ajustando\.\.\./);
  assert.match(adjustmentForm, /disabled=\{pending\}/);
  assert.match(adjustmentForm, /role=\{state\.status === "error" \? "alert" : "status"\}/);
  assert.match(productPage, /InventoryAdjustmentForm/);
});

test("inventory history is protected and supports product, type and date filters", () => {
  assert.match(page, /await requireAdminSession\(\)/);
  assert.match(page, /name="search"/);
  assert.match(page, /name="type"/);
  assert.match(page, /name="from"/);
  assert.match(page, /name="to"/);
  assert.match(service, /\.eq\("product_id", filters\.productId\)/);
  assert.match(service, /\.eq\("movement_type", filters\.type\)/);
});

test("history exposes existing purchase and sale references without inventing movements", () => {
  assert.match(page, /\/admin\/compras\/\$\{movement\.purchase_id\}/);
  assert.match(page, /movement\.orders\?\.order_number/);
  assert.match(page, /movement\.reason/);
  assert.doesNotMatch(migration, /opening balance|insert into inventory_movements[\s\S]+select/i);
});

test("admin navigation and product history links expose Inventory", () => {
  assert.match(navigation, /href: "\/admin\/inventario", label: "Inventario"/);
  assert.match(adjustmentForm, /\/admin\/inventario\?product=/);
  assert.match(productForm, /\/admin\/inventario\?product=/);
});

test("purchase and sale movement shapes remain compatible", () => {
  assert.match(purchaseMigration, /'purchase',[\s\S]+v_item\.quantity,[\s\S]+v_product\.stock,[\s\S]+v_new_stock::integer/i);
  assert.match(
    saleMigration,
    /'sale',[\s\S]+v_item\.quantity,[\s\S]+v_product\.stock,[\s\S]+v_new_stock/i,
  );
  assert.match(service, /"purchase",[\s\S]+"sale",[\s\S]+"adjustment"/i);
});

test("the audit foundation does not change cost or create retroactive rows", () => {
  assert.doesNotMatch(migration, /\bcost\s*=/i);
  assert.doesNotMatch(migration, /update products[\s\S]+cost/i);
  assert.doesNotMatch(migration, /insert into inventory_movements[\s\S]+from products/i);
});
