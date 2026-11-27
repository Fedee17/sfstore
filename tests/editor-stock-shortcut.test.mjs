import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("editor shows stock with Ajustar stock and Ver movimientos at the top (approved mockup 27/11)", () => {
  const page = source("app/admin/productos/[id]/editar/page.tsx");
  assert.match(page, /const showStockShortcut = Boolean\(product && !connector && !product\.family_id && !adminProductAvailability\(product\)\.historical\)/);
  assert.match(page, /<ProductAvailabilitySummary[^>]*>\s*\{showStockShortcut && product \? \(/);
  assert.match(page, /href=\{stockAdjustmentHref\(product\)\}[\s\S]{0,300}>\s*Ajustar stock/);
  assert.match(page, /href=\{`\/admin\/inventario\?view=movements&product=\$\{encodeURIComponent\(product\.id\)\}`\}[\s\S]{0,300}>\s*Ver movimientos/);
  assert.match(page, /min-h-11/);
  const summary = source("components/admin/products/product-availability-summary.tsx");
  assert.match(summary, /children\?: ReactNode/);
  assert.match(summary, /\{children\}/);
  // The link moved out of the collapsed «Ver otros datos del producto» section; no duplicate inside the form.
  assert.doesNotMatch(source("components/admin/products/product-form.tsx"), /stockAdjustmentHref/);
});
