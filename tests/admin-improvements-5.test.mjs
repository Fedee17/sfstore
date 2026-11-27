import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { stockAdjustmentHref } from "../lib/admin/catalog-review.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a family SKU without slug opens the audited stock adjustment by its SKU", () => {
  assert.equal(
    stockAdjustmentHref({ id: "v1", sku: "LATA-MATERA-BLANCO" }),
    "/admin/productos?search=LATA-MATERA-BLANCO&status=all&view=details#producto-v1",
  );
  assert.equal(
    stockAdjustmentHref({ id: "p1", slug: "mate algarrobo", sku: "MATE-1" }),
    "/admin/productos?search=mate%20algarrobo&status=all&view=details#producto-p1",
  );
});

test("each SKU of a family links to its stock adjustment and movements", () => {
  const form = source("components/admin/products/family-forms.tsx");
  assert.match(form, /href=\{stockAdjustmentHref\(variant\)\}[^>]*>Ajustar stock</);
  assert.match(form, /href=\{`\/admin\/inventario\?view=movements&product=\$\{encodeURIComponent\(id\)\}`\}[^>]*>Ver movimientos</);
});

test("the association search also lists products without SKU and sends them to the editor", () => {
  const service = source("services/product-families.ts");
  const finder = service.slice(service.indexOf("export async function findSimpleFamilyProducts"), service.indexOf("export async function getSimpleFamilyCandidate"));
  assert.doesNotMatch(finder, /\.not\("sku","is",null\)/);
  const candidate = service.slice(service.indexOf("export async function getSimpleFamilyCandidate"));
  assert.match(candidate, /\.not\("sku","is",null\)/, "association itself still requires a SKU");
  const page = source("app/admin/productos/familias/[id]/page.tsx");
  assert.match(page, /p\.sku\?/);
  assert.match(page, /href=\{`\/admin\/productos\/\$\{p\.id\}\/editar`\}[^>]*>Asignarle un SKU</);
});
