import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function block(contents, start, end) {
  const from = contents.indexOf(start);
  assert.notEqual(from, -1, start);
  return contents.slice(from, contents.indexOf(end, from));
}

test("marking the main photo never leaves the product without one", () => {
  const action = block(source("app/admin/productos/actions.ts"), "export async function setPrimaryProductImage", "export async function moveProductImage");
  const markNew = action.indexOf('.update({ is_primary: true })');
  const clearOthers = action.indexOf('.update({ is_primary: false })');
  assert.ok(markNew > -1 && clearOthers > -1);
  assert.ok(markNew < clearOthers, "the chosen photo is marked before the others are cleared");
  assert.match(action.slice(clearOthers), /\.neq\("id", imageId\)/);
});

test("the import preview reads as cards on the phone and as a table from tablet up", () => {
  const tool = source("components/admin/products/product-import-tool.tsx");
  assert.doesNotMatch(tool, /className="min-w-\[1120px\]/);
  assert.match(tool, /md:min-w-\[1120px\]/);
  assert.match(tool, /<thead className="hidden md:table-header-group/);
  assert.match(tool, /<tr key=\{row\.key\} className="block[^"]*md:table-row/);
  for (const label of ["Categoría", "Precio lista", "Efectivo/transferencia", "Costo", "Cambios efectivos", "Avisos"]) {
    assert.match(tool, new RegExp(`<MobileLabel>${label}</MobileLabel>`), label);
  }
});
