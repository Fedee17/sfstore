import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(testDirectory, "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const actions = source("app", "admin", "compras", "actions.ts");
const service = source("services", "purchases.ts");
const form = source(
  "components",
  "admin",
  "purchases",
  "purchase-draft-form.tsx",
);
const newPage = source("app", "admin", "compras", "nueva", "page.tsx");
const editPage = source(
  "app",
  "admin",
  "compras",
  "[id]",
  "editar",
  "page.tsx",
);

test("quick product creation requires an admin action session", () => {
  assert.match(actions, /createPurchaseProductAction[\s\S]+requireAdminActionSession\(\)/);
});

test("quick product validation requires a name and active category", () => {
  assert.match(service, /if \(!name\)[\s\S]+Nombre es requerido/);
  assert.match(service, /if \(!categoryId\)[\s\S]+Categoria es requerida/);
  assert.match(service, /\.from\("categories"\)[\s\S]+\.eq\("is_active", true\)/);
  assert.match(service, /La categoria no existe o esta inactiva/);
});

test("new products use safe purchase-flow defaults", () => {
  assert.match(service, /price: 0/);
  assert.match(service, /transfer_price: null/);
  assert.match(service, /cost: null/);
  assert.match(service, /stock: 0/);
  assert.match(service, /featured: false/);
  assert.match(service, /status: "active"/);
});

test("duplicates resolve to the existing product instead of inserting again", () => {
  assert.match(service, /findPurchaseProductBySlug/);
  assert.match(service, /findPurchaseProductByName/);
  assert.match(service, /created: false, product: existingProduct/);
  assert.match(actions, /Ya existe un producto con ese nombre/);
});

test("the inline UI creates, selects and prepares the purchase line", () => {
  assert.match(form, /\+ Crear producto nuevo/);
  assert.match(form, /Crear y agregar/);
  assert.match(form, /Creando\.\.\./);
  assert.match(form, /selectProduct\(lineKey, product\)/);
  assert.match(form, /quantityInputRefs\.current\[lineKey\]\?\.focus\(\)/);
});

test("new and draft edit pages provide real active categories", () => {
  for (const page of [newPage, editPage]) {
    assert.match(page, /getAdminCategories\(\)/);
    assert.match(page, /category\.is_active/);
    assert.match(page, /categories=/);
  }
});

test("editing verifies the purchase is still a draft before creating", () => {
  assert.match(service, /if \(input\.purchaseId\)[\s\S]+assertPurchaseIsDraft/);
  assert.match(form, /purchaseId: purchase\?\.id/);
});

test("inline creation does not touch stock, cost or inventory movements", () => {
  const creationBlock = service.slice(
    service.indexOf("export async function createPurchaseProduct"),
    service.indexOf("export async function listPurchases"),
  );

  assert.doesNotMatch(creationBlock, /inventory_movements/);
  assert.doesNotMatch(creationBlock, /\.update\(/);
  assert.match(creationBlock, /cost: null/);
  assert.match(creationBlock, /stock: 0/);
});
