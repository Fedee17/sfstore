import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { variantErrorMessage } from "../lib/products/variants.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a family slug already used by another product says so instead of a generic error", () => {
  const message = variantErrorMessage(new Error("P0001 VARIANT_PUBLIC_SLUG_COLLISION"));
  assert.match(message, /slug/i);
  assert.match(message, /otro producto|otra familia/);
  assert.doesNotMatch(message, /Revisá los campos o recargá/);
});

test("admin labels and messages carry their accents", () => {
  const files = [
    "components/admin/products/product-form.tsx",
    "components/admin/products/inventory-adjustment-form.tsx",
    "components/admin/purchases/purchase-draft-form.tsx",
    "app/admin/productos/actions.ts",
    "app/admin/productos/page.tsx",
    "app/admin/pedidos/actions.ts",
    "app/admin/pedidos/page.tsx",
    "app/admin/pedidos/[id]/page.tsx",
    "app/admin/ventas/actions.ts",
    "app/admin/ventas/[id]/page.tsx",
    "app/admin/configuracion/page.tsx",
    "app/admin/inventario/page.tsx",
    "app/admin/proveedores/[id]/page.tsx",
    "services/purchases.ts",
  ];
  const unaccented = /\b([Ii]magenes|[Cc]ategoria|[Dd]escripcion|automatico|automaticamente|fisico|danado|Volve|numero|[Tt]elefono|Direccion|Devolucion|Liberacion|Todavia|todavia|[Oo]peracion|invalido|valido|tenia|creo ningun)\b/;
  for (const file of files) {
    const strings = source(file).match(/"[^"\n]*"|>[^<>{}\n]+</g) ?? [];
    const offenders = strings.filter((text) => unaccented.test(text) && !/^"[a-z_./@-]+"$/.test(text));
    assert.deepEqual(offenders, [], file);
  }
});
