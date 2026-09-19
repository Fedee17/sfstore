import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(testDirectory, "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");

const migration = source("supabase", "migrations", "202609180002_suppliers_admin.sql");
const service = source("services", "suppliers.ts");
const actions = source("app", "admin", "proveedores", "actions.ts");
const purchaseActions = source("app", "admin", "compras", "actions.ts");
const purchaseService = source("services", "purchases.ts");
const purchaseForm = source("components", "admin", "purchases", "purchase-draft-form.tsx");
const summaryModule = await import(
  pathToFileURL(join(root, "lib", "suppliers", "summary.ts")).href
);
const supplierNames = await import(
  pathToFileURL(join(root, "lib", "purchases", "supplier.ts")).href
);

test("migration only adds the supplier contact columns", () => {
  for (const column of ["contact_name", "phone", "email", "whatsapp", "website", "address"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column} text`, "i"));
  }
  assert.doesNotMatch(migration, /create table|drop table|update\s+suppliers|insert\s+into/i);
});

test("supplier normalization is stable and removes accents and extra spaces", () => {
  assert.equal(supplierNames.cleanSupplierName("  Café   Norte  "), "Café Norte");
  assert.equal(supplierNames.normalizeSupplierName("  Café   Norte  "), "cafe norte");
});

test("purchase summary totals only confirmed purchases", () => {
  const summary = summaryModule.summarizeSupplierPurchases([
    { status: "confirmed", total_cost: "1250.50", total_units: 4, purchase_date: "2026-09-10", created_at: "2026-09-10T10:00:00Z" },
    { status: "draft", total_cost: "900", total_units: 2, purchase_date: "2026-09-12", created_at: "2026-09-12T10:00:00Z" },
    { status: "confirmed", total_cost: 249.5, total_units: 1, purchase_date: "2026-09-08", created_at: "2026-09-08T10:00:00Z" },
  ]);

  assert.deepEqual(summary, {
    purchaseCount: 3,
    confirmedPurchaseCount: 2,
    lastPurchaseDate: "2026-09-12",
    totalPurchased: 1500,
    totalUnits: 5,
  });
});

test("all supplier pages require an admin session", () => {
  for (const path of [
    ["app", "admin", "proveedores", "page.tsx"],
    ["app", "admin", "proveedores", "nuevo", "page.tsx"],
    ["app", "admin", "proveedores", "[id]", "page.tsx"],
    ["app", "admin", "proveedores", "[id]", "editar", "page.tsx"],
  ]) {
    assert.match(source(...path), /await requireAdminSession\(\)/);
  }
});

test("all supplier mutations require an admin action session", () => {
  const matches = actions.match(/await requireAdminActionSession\(\)/g) ?? [];
  assert.equal(matches.length, 3);
});

test("create validates a required unique normalized name and defaults active", () => {
  const validation = source("lib", "suppliers", "validation.ts");
  assert.match(validation, /El nombre del proveedor es requerido/);
  assert.match(validation, /normalized_name: normalizedName/);
  assert.match(service, /error\.code === "23505"/);
  assert.match(service, /Ya existe un proveedor con ese nombre/);
  assert.match(service, /insert\(\{ \.\.\.values, is_active: true \}\)/);
});

test("updates recalculate normalized name without touching purchase snapshots", () => {
  const updateBlock = service.slice(
    service.indexOf("export async function updateSupplier"),
    service.indexOf("export async function setSupplierActiveStatus"),
  );
  assert.match(updateBlock, /validateSupplierInput\(input\)/);
  assert.match(updateBlock, /\.from\("suppliers"\)[\s\S]+\.update\(values\)/);
  assert.doesNotMatch(updateBlock, /\.from\("purchases"\)|supplier_name_snapshot/);
});

test("suppliers are activated or deactivated, never physically deleted", () => {
  assert.match(service, /setSupplierActiveStatus[\s\S]+update\(\{ is_active: isActive \}\)/);
  assert.doesNotMatch(service, /\.delete\(\)/);
  assert.doesNotMatch(actions, /deleteSupplier/i);
});

test("new purchases receive only active suppliers", () => {
  assert.match(service, /listActiveSuppliers[\s\S]+\.eq\("is_active", true\)/);
  assert.match(source("app", "admin", "compras", "nueva", "page.tsx"), /listActiveSuppliers\(\)/);
  assert.match(purchaseService, /El proveedor no existe o esta inactivo/);
});

test("draft editing keeps the historical inactive supplier visible but not selectable", () => {
  assert.match(source("app", "admin", "compras", "[id]", "editar", "page.tsx"), /listSelectableSuppliers\(purchase\.supplier_id\)/);
  assert.match(purchaseForm, /disabled=\{!supplier\.is_active\}/);
  assert.match(purchaseForm, /\(inactivo\)/);
});

test("supplier detail exposes purchase history and links", () => {
  const detail = source("app", "admin", "proveedores", "[id]", "page.tsx");
  assert.match(detail, /getSupplierPurchaseSummary/);
  assert.match(detail, /supplier_name_snapshot/);
  assert.match(detail, /`\/admin\/compras\/\$\{purchase\.id\}`/);
  assert.match(detail, /Total confirmado/);
  assert.match(detail, /Unidades confirmadas/);
});

test("compact purchase creation reuses the central supplier service", () => {
  assert.match(purchaseActions, /createOrReuseSupplier.*from "@\/services\/suppliers"/s);
  assert.match(service, /createOrReuseSupplier[\s\S]+getSupplierByNormalizedName/);
  assert.doesNotMatch(purchaseService, /export async function createSupplier/);
});

test("supplier forms expose pending and visible success or error feedback", () => {
  const form = source("components", "admin", "suppliers", "supplier-form.tsx");
  const statusForm = source("components", "admin", "suppliers", "supplier-status-form.tsx");
  assert.match(form, /pendingLabel="Guardando\.\.\."/);
  assert.match(statusForm, /"Activando\.\.\."/);
  assert.match(statusForm, /"Desactivando\.\.\."/);
  assert.match(form, /role=\{state\.status === "error" \? "alert" : "status"\}/);
});

test("admin navigation includes suppliers next to purchases", () => {
  const navigation = source("components", "admin", "admin-nav.tsx");
  assert.match(navigation, /\/admin\/compras[\s\S]+\/admin\/proveedores[\s\S]+\/admin\/productos/);
});
