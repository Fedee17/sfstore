import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertProductStatusTransition,
  shouldClearCostSource,
} from "../lib/products/admin-product-policy.ts";
import { resolvePublicCatalogSection } from "../lib/catalog/public-product-visibility.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...parts) => readFileSync(join(root, ...parts), "utf8");
const productActions = source("app", "admin", "productos", "actions.ts");
const productForm = source(
  "components",
  "admin",
  "products",
  "product-form.tsx",
);
const purchaseService = source("services", "purchases.ts");
const purchaseForm = source(
  "components",
  "admin",
  "purchases",
  "purchase-draft-form.tsx",
);
const editPurchasePage = source(
  "app",
  "admin",
  "compras",
  "[id]",
  "editar",
  "page.tsx",
);
const purchaseConfirmation = source(
  "supabase",
  "migrations",
  "202609170001_purchase_confirmation.sql",
);

for (const [currentStatus, nextStatus] of [
  ["draft", "active"],
  ["archived", "active"],
  ["active", "draft"],
  ["active", "archived"],
]) {
  test(`${currentStatus} can transition to ${nextStatus}`, () => {
    assert.equal(
      assertProductStatusTransition({
        currentStatus,
        nextStatus,
        historicalIdentity: false,
      }),
      nextStatus,
    );
  });
}

test("historical identities cannot change operational status", () => {
  assert.throws(
    () =>
      assertProductStatusTransition({
        currentStatus: "archived",
        nextStatus: "active",
        historicalIdentity: true,
      }),
    /identidades historicas/i,
  );
});

test("the product action returns and the form reconciles persisted status", () => {
  assert.match(
    productActions,
    /const persisted = result\.product/,
  );
  assert.match(productActions, /persistedProduct: persistedProductState\(persisted\)/);
  assert.match(productActions, /updatedAt: row\.updated_at/);
  assert.match(productForm, /function ProductStatusControl/);
  assert.match(productForm, /name="status"[\s\S]+value=\{status\}/);
  assert.match(productForm, /key=\{[\s\S]+actionState\.submissionId/);
  assert.match(
    productForm,
    /actionState\.persistedProduct\?\.status \?\? product\?\.status/,
  );
  assert.doesNotMatch(productForm, /name="status"[\s\S]{0,120}defaultValue=/);
});

test("manual cost changes clear a stale purchase source only when needed", () => {
  assert.equal(shouldClearCostSource(100, 100), false);
  assert.equal(shouldClearCostSource(100, 100.004), false);
  assert.equal(shouldClearCostSource(100, 100.01), true);
  assert.equal(shouldClearCostSource(null, null), false);
  assert.equal(shouldClearCostSource(100, null), true);
  assert.match(
    source("supabase", "migrations", "202610060001_atomic_product_save.sql"),
    /cost_source_purchase_item_id = case when cost is distinct from v_product\.cost[\s\S]+else cost_source_purchase_item_id end/,
  );
});

test("purchase confirmation remains the legitimate cost source writer", () => {
  assert.match(
    purchaseConfirmation,
    /cost = v_item\.effective_unit_cost,[\s\S]+cost_source_purchase_item_id = v_item\.id/i,
  );
});

test("new purchases list active products and preserve only existing draft lines", () => {
  assert.match(
    purchaseService,
    /listPurchaseProducts\(includeProductIds: string\[\] = \[\]\)[\s\S]+\.eq\("historical_identity", false\)[\s\S]+\.eq\("status", "active"\)/,
  );
  assert.match(purchaseService, /\.in\("id", retainedIds\)/);
  assert.match(
    editPurchasePage,
    /\(purchase\.purchase_items \?\? \[\]\)\.map\(\(item\) => item\.product_id\)/,
  );
  assert.match(purchaseForm, /archivado en este borrador/);
  assert.match(
    purchaseService,
    /product\.status === "archived" && !retainedProductIds\.has\(product\.id\)/,
  );
});

test("quick purchase creation produces a private draft", () => {
  assert.match(purchaseService, /price: 0/);
  assert.match(purchaseService, /status: "draft"/);
  assert.equal(
    resolvePublicCatalogSection({
      status: "draft",
      historicalIdentity: false,
      categorySlug: "mates",
      categoryIsActive: true,
    }),
    null,
  );
});

test("product edits revalidate old and new public surfaces precisely", () => {
  for (const path of [
    '"/admin/productos"',
    '"/admin/consulta"',
    '"/"',
    '"/sitemap.xml"',
    '"/perfumes"',
    '"/mates"',
  ]) {
    assert.match(productActions, new RegExp(path.replaceAll("/", "\\/")));
  }
  assert.match(productActions, /previousSlug && previousSlug !== slug/);
  assert.match(productActions, /paths\.add\(`\/producto\/\$\{previousSlug\}`\)/);
  assert.match(productActions, /`\/admin\/productos\/\$\{productId\}\/editar`/);
});
