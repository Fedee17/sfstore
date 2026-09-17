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
  "202609170001_purchase_confirmation.sql",
);
const service = source("services", "purchases.ts");
const actions = source("app", "admin", "compras", "actions.ts");
const detail = source("app", "admin", "compras", "[id]", "page.tsx");
const confirmationForm = source(
  "components",
  "admin",
  "purchases",
  "confirm-purchase-form.tsx",
);
const priceImport = source("lib", "product-import", "price-import.ts");
const productImportCore = source("lib", "product-import", "core.ts");
const productImportService = source("services", "product-import.ts");

test("confirmation migration extends purchase audit references", () => {
  assert.match(migration, /purchase_id uuid references purchases\(id\)/i);
  assert.match(migration, /purchase_item_id uuid references purchase_items\(id\)/i);
  assert.match(migration, /created_by uuid/i);
  assert.match(migration, /unique index[\s\S]+purchase_item_id/i);
  assert.match(migration, /cost_source_purchase_item_id uuid[\s\S]+references purchase_items\(id\)/i);
});

test("confirm_purchase is service-role only and locks purchase plus products", () => {
  assert.match(migration, /create or replace function confirm_purchase/i);
  assert.match(migration, /from purchases[\s\S]+for update/i);
  assert.match(migration, /order by product\.id[\s\S]+for update of product/i);
  assert.match(migration, /revoke all on function confirm_purchase[\s\S]+public, anon, authenticated/i);
  assert.match(migration, /grant execute on function confirm_purchase[\s\S]+service_role/i);
});

test("only non-empty valid drafts can be confirmed", () => {
  assert.match(migration, /if v_purchase\.status <> 'draft'/i);
  assert.match(migration, /Solo se pueden confirmar compras en borrador/i);
  assert.match(migration, /if v_item_count = 0/i);
  assert.match(migration, /quantity <= 0/i);
  assert.match(migration, /effective_unit_cost < 0/i);
});

test("each line creates one auditable positive purchase movement", () => {
  assert.match(migration, /for v_item in[\s\S]+from purchase_items[\s\S]+loop/i);
  assert.match(migration, /insert into inventory_movements/i);
  assert.match(migration, /'purchase',[\s\S]+v_item\.quantity,[\s\S]+v_product\.stock,[\s\S]+v_new_stock::integer/i);
  assert.match(migration, /purchase_id,[\s\S]+purchase_item_id/i);
});

test("stock and effective cost are updated atomically by SQL", () => {
  assert.match(migration, /v_new_stock := v_product\.stock::bigint \+ v_item\.quantity::bigint/i);
  assert.match(migration, /update products set[\s\S]+stock = v_new_stock::integer/i);
  assert.match(migration, /cost = v_item\.effective_unit_cost/i);
  assert.match(migration, /cost_source_purchase_item_id = v_item\.id/i);
  assert.doesNotMatch(service, /\.from\("products"\)[\s\S]{0,120}\.update\(\{[\s\S]{0,120}(stock|cost)/i);
});

test("confirmation marks the purchase and records confirmed_at", () => {
  assert.match(migration, /status = 'confirmed'/i);
  assert.match(migration, /confirmed_at = v_confirmed_at/i);
  assert.match(detail, /purchase\.confirmed_at/i);
});

test("confirmation is idempotent and additionally protected by a unique movement", () => {
  assert.match(migration, /if v_purchase\.status = 'confirmed'[\s\S]+already_confirmed/i);
  assert.match(migration, /'movements_created', 0/i);
  assert.match(migration, /inventory_movements_purchase_item_id_unique/i);
});

test("confirmed purchases and their lines are immutable", () => {
  assert.match(migration, /prevent_confirmed_purchase_mutation/i);
  assert.match(migration, /prevent_confirmed_purchase_item_mutation/i);
  assert.match(migration, /old\.status = 'confirmed'/i);
  assert.match(detail, /purchase\.status === "draft"/i);
});

test("the service delegates confirmation to one RPC without client stock math", () => {
  const block = service.slice(service.indexOf("export async function confirmPurchase"));
  assert.match(block, /\.rpc\([\s\S]+"confirm_purchase"/i);
  assert.match(block, /p_purchase_id: normalizedPurchaseId/i);
  assert.match(block, /p_created_by: createdBy/i);
  assert.doesNotMatch(block, /previous_stock|new_stock|effective_unit_cost/);
});

test("the server action requires admin and revalidates affected views", () => {
  assert.match(actions, /confirmPurchaseAction[\s\S]+requireAdminActionSession\(\)/i);
  for (const path of [
    "/admin/compras",
    "/admin/productos",
    "/admin/consulta",
  ]) {
    assert.match(actions, new RegExp(`revalidatePath\\(\"${path}\"\\)`));
  }
});

test("confirmation UI warns, reports pending and prevents duplicate submission", () => {
  assert.match(confirmationForm, /window\.confirm\(CONFIRMATION_MESSAGE\)/);
  assert.match(confirmationForm, /Confirmando\.\.\./);
  assert.match(confirmationForm, /disabled=\{pending\}/);
  assert.match(confirmationForm, /role=\{state\.status === "error" \? "alert" : "status"\}/);
});

test("Precios Productos no owns cost but still updates both selling prices", () => {
  assert.match(priceImport, /export type PriceImportField = "price" \| "transfer_price"/);
  assert.doesNotMatch(priceImport, /field: "cost"/);
  assert.match(priceImport, /field: "price"/);
  assert.match(priceImport, /field: "transfer_price"/);
  assert.match(productImportService, /buildSafePriceImportDecision\(getPriceImportSource\(normalized\), existing\)/);
  assert.match(productImportService, /buildSafePriceImportDecision\(getPriceImportSource\(row\), existing\)/);
  assert.match(productImportService, /\.update\(decision\.patch\)/);
  assert.match(productImportCore, /sheet !== "Precios Productos"[\s\S]+costCell\.nonBlank/);
});

test("the migration does not impose a global positive quantity check on legacy movement types", () => {
  assert.doesNotMatch(migration, /alter table inventory_movements[\s\S]+check\s*\(quantity > 0\)/i);
  assert.match(migration, /quantity <= 0/i);
});
