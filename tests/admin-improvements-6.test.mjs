import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { productStatusLabel } from "../lib/products/product-availability.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("product status reads in Spanish with one shared label", () => {
  assert.equal(productStatusLabel("active"), "Activo");
  assert.equal(productStatusLabel("draft"), "Borrador");
  assert.equal(productStatusLabel("archived"), "Archivado");
  assert.equal(productStatusLabel("otro"), "Estado desconocido");
});

test("family pages show Spanish status and formatted amounts", () => {
  const form = source("components/admin/products/family-forms.tsx");
  assert.match(form, /Estado: \{productStatusLabel\(variant\.status\)\}/);
  assert.match(form, /Precio lista: \{adminMoney\(Number\(variant\.price\)\)\}/);
  assert.match(form, /Heredar precio base \(\{adminMoney\(Number\(family\.base_price\)\)\}\)/);
  for (const file of ["components/admin/products/family-forms.tsx", "app/admin/productos/familias/page.tsx", "app/admin/productos/familias/[id]/page.tsx"]) {
    const text = source(file);
    assert.doesNotMatch(text, /\$\$\{Number\([^)]*\)\.toFixed\(2\)\}|\(\$\{Number\([^)]*\)\.toFixed\(2\)\}\)/, file);
    assert.doesNotMatch(text, />[^<]*\$\{?Number\([^)]*\)\.toFixed\(2\)/, file);
  }
});
