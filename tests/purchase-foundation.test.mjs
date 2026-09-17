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
  "202609160001_purchase_draft_foundation.sql",
);
const service = source("services", "purchases.ts");
const actions = source("app", "admin", "compras", "actions.ts");

test("migration creates relational suppliers, purchases and items", () => {
  assert.match(migration, /create table if not exists suppliers/i);
  assert.match(migration, /normalized_name text not null unique/i);
  assert.match(migration, /create table if not exists purchases/i);
  assert.match(migration, /supplier_id uuid not null references suppliers/i);
  assert.match(migration, /supplier_name_snapshot text not null/i);
  assert.match(migration, /create table if not exists purchase_items/i);
  assert.match(migration, /sku_snapshot text/i);
  assert.match(migration, /unique \(purchase_id, product_id\)/i);
});

test("new purchase tables are closed by RLS without public policies", () => {
  for (const table of ["suppliers", "purchases", "purchase_items"]) {
    assert.match(migration, new RegExp(`alter table ${table} enable row level security`, "i"));
  }
  assert.doesNotMatch(migration, /create policy/i);
});

test("draft RPCs are executable only by service role", () => {
  assert.match(migration, /revoke all on function save_purchase_draft[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function save_purchase_draft[\s\S]+to service_role/i);
  assert.match(migration, /grant execute on function cancel_purchase_draft[\s\S]+to service_role/i);
});

test("draft save snapshots supplier and products in one database function", () => {
  assert.match(migration, /supplier_name_snapshot/);
  assert.match(migration, /product_name_snapshot/);
  assert.match(migration, /for update/);
  assert.match(migration, /delete from purchase_items where purchase_id/);
  assert.match(migration, /order by remainder desc, product_id asc/);
});

test("non-draft edits and cancellations are rejected in SQL", () => {
  assert.match(migration, /if v_status <> 'draft'/);
  assert.match(migration, /Solo se pueden modificar compras en borrador/);
  assert.match(migration, /Solo se pueden cancelar compras en borrador/);
});

test("purchase module never writes product stock, product cost or inventory movements", () => {
  const moduleSource = [
    service,
    actions,
    source("components", "admin", "purchases", "purchase-draft-form.tsx"),
    migration,
  ].join("\n");
  assert.doesNotMatch(moduleSource, /from\("inventory_movements"\)/);
  assert.doesNotMatch(moduleSource, /update\(\{\s*stock/i);
  assert.doesNotMatch(moduleSource, /update\(\{\s*cost/i);
  assert.doesNotMatch(migration, /update\s+products/i);
  assert.doesNotMatch(migration, /insert\s+into\s+inventory_movements/i);
});

test("services validate active suppliers and existing products", () => {
  assert.match(service, /\.eq\("is_active", true\)/);
  assert.match(service, /Uno o mas productos no existen/);
  assert.match(service, /calculatePurchaseDraft/);
});

test("the server action accepts source inputs but never client totals", () => {
  assert.match(actions, /getAll\("quantity"\)/);
  assert.match(actions, /getAll\("unitPurchaseCost"\)/);
  assert.match(actions, /get\("shippingCost"\)/);
  assert.doesNotMatch(actions, /get\("supplierSubtotal"\)/);
  assert.doesNotMatch(actions, /get\("totalCost"\)/);
  assert.doesNotMatch(actions, /getAll\("effectiveLineTotal"\)/);
});

test("all purchase pages require an admin session", () => {
  for (const path of [
    ["app", "admin", "compras", "page.tsx"],
    ["app", "admin", "compras", "nueva", "page.tsx"],
    ["app", "admin", "compras", "[id]", "page.tsx"],
    ["app", "admin", "compras", "[id]", "editar", "page.tsx"],
  ]) {
    assert.match(source(...path), /await requireAdminSession\(\)/);
  }
});

test("all purchase mutations require an admin action session", () => {
  const matches = actions.match(/await requireAdminActionSession\(\)/g) ?? [];
  assert.equal(matches.length, 4);
});

test("the UI exposes save draft but no confirmation action", () => {
  const form = source(
    "components",
    "admin",
    "purchases",
    "purchase-draft-form.tsx",
  );
  assert.match(form, /Guardar borrador/);
  assert.doesNotMatch(form, /Confirmar compra/);
  assert.doesNotMatch(actions, /confirmPurchase/i);
});

test("the admin navigation includes purchases", () => {
  assert.match(source("components", "admin", "admin-nav.tsx"), /\/admin\/compras/);
});
