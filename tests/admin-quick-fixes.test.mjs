import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("local sale: one tap fills a payment with the remaining balance and invalid amounts are explained", () => {
  const form = source("components/admin/sales/store-sale-form.tsx");
  assert.match(form, /Completar con el saldo/);
  assert.match(form, /fillRemaining\(payment\.key\)/);
  assert.match(form, /Escribí el importe como 15000 o 15\.000,50/);
  assert.doesNotMatch(form, /function parseAmount\(value: string\) \{\s*return Number\(value\.replace/);
});

test("product editor: every save shows a fresh confirmation and later edits are guarded again", () => {
  const form = source("components/admin/products/product-form.tsx");
  assert.match(form, /<UnsavedChangesGuard savedRevision=\{actionState\.status === "success" \? actionState\.submissionId : undefined\} \/>/);
  assert.match(form, /actionState\.message && !isSubmitting \? \(\s*<p\s+key=\{actionState\.submissionId \?\? actionState\.status\}/);
  const guard = source("components/admin/unsaved-changes-guard.tsx");
  assert.match(guard, /savedRevision/);
  assert.match(guard, /changedSince/);
});

test("archive and image removal ask for confirmation before acting", () => {
  const button = source("components/admin/pending-submit-button.tsx");
  assert.match(button, /confirmMessage/);
  assert.match(button, /window\.confirm\(confirmMessage\)/);
  assert.match(source("app/admin/productos/page.tsx"), /confirmMessage=\{`¿Archivar «\$\{product\.name\}»\?/);
  assert.match(source("components/admin/products/product-form.tsx"), /confirmMessage="¿Eliminar esta foto del producto\?/);
});

test("featured and archive actions return to the same page and product, only inside the products admin", () => {
  const page = source("app/admin/productos/page.tsx");
  assert.match(page, /const productsPath = buildProductsUrl\(\{ \.\.\.selectedFilters, page: page > 1 \? String\(page\) : "" \}\)/);
  assert.match(page, /id=\{`producto-\$\{product\.id\}`\}/);
  assert.match(page, /value=\{`\$\{productsPath\}#producto-\$\{product\.id\}`\}/);
  const actions = source("app/admin/productos/actions.ts");
  assert.match(actions, /function safeProductsReturn\(/);
  assert.doesNotMatch(actions, /const returnTo = String\(formData\.get\("returnTo"\) \?\? "\/admin\/productos"\);/);
});
