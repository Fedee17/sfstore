import assert from "node:assert/strict";
import { test } from "node:test";
import { searchProducts } from "../lib/catalog/search.ts";

const fixtures = [
  { name: "Perfume Ámbar", shortDescription: "Aroma árabe dulce", attributes: [{ name: "Marca", value: "Marca Prueba" }] },
  { name: "Mate de acero", shortDescription: "Para todos los días" },
];

test("search tolerates accents, case and surrounding whitespace", () => {
  assert.deepEqual(searchProducts(fixtures, "  AMBAR arabe  "), [fixtures[0]]);
});
test("search matches brands and requires every word", () => {
  assert.deepEqual(searchProducts(fixtures, "marca prueba"), [fixtures[0]]);
  assert.deepEqual(searchProducts(fixtures, "marca acero"), []);
});
test("empty and unmatched searches preserve predictable results without mutating products", () => {
  assert.deepEqual(searchProducts(fixtures, "   "), fixtures);
  assert.deepEqual(searchProducts(fixtures, "inexistente"), []);
  assert.equal(fixtures.length, 2);
  assert.equal(fixtures[0].name, "Perfume Ámbar");
});
