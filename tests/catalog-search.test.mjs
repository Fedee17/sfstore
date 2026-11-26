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
test("thermos search includes named models and products in the category", () => {
  const models = [
    { name: "Termo GOAT Negro", shortDescription: "" },
    { name: "Botella térmica Stanley", shortDescription: "", categorySlug: "termos", variants: [{ name: "Botella 650 ml", variantLabel: "Verde" }] },
  ];
  assert.deepEqual(searchProducts(models, "termo"), models);
  assert.deepEqual(searchProducts(models, "TERMOSSSS"), models);
  assert.deepEqual(searchProducts(models, "termos verde"), [models[1]]);
});
test("empty and unmatched searches preserve predictable results without mutating products", () => {
  assert.deepEqual(searchProducts(fixtures, "   "), fixtures);
  assert.deepEqual(searchProducts(fixtures, "inexistente"), []);
  assert.equal(fixtures.length, 2);
  assert.equal(fixtures[0].name, "Perfume Ámbar");
});

// CONV-02 (26/11): recovery only when the exact search finds nothing.
import { searchProductsWithRecovery } from "../lib/catalog/search.ts";
const catalog = [
  { name: "Yara Rosa Lattafa", shortDescription: "", categorySlug: "perfumes", attributes: [{ name: "Género", value: "Femenino" }, { name: "Marca", value: "Lattafa" }] },
  { name: "Asad Lattafa", shortDescription: "", categorySlug: "perfumes", attributes: [{ name: "Género", value: "Masculino" }] },
  { name: "Club de Nuit Unisex", shortDescription: "", categorySlug: "perfumes", attributes: [{ name: "Género", value: "Unisex" }] },
  { name: "Termo Stanley 1L", shortDescription: "", categorySlug: "termos" },
  { name: "Bombilla pico de loro", shortDescription: "", categorySlug: "bombillas" },
  { name: "Mate imperial", shortDescription: "Ideal para regalar", categorySlug: "mates" },
];
const names = result => result.products.map(product => product.name);

test("exact matches are returned untouched and never mixed with recovered ones", () => {
  const result = searchProductsWithRecovery(catalog, "lattafa");
  assert.deepEqual(result, { products: searchProducts(catalog, "lattafa"), recovered: false });
  assert.deepEqual(names(searchProductsWithRecovery(catalog, "bombilla")), ["Bombilla pico de loro"]);
});

test("typos of one letter (five or six letters) or two (seven or more) are recovered", () => {
  for (const [query, expected] of [["lataffa", ["Yara Rosa Lattafa", "Asad Lattafa"]], ["stanly", ["Termo Stanley 1L"]], ["bombila", ["Bombilla pico de loro"]], ["imperail", ["Mate imperial"]]]) {
    const result = searchProductsWithRecovery(catalog, query);
    assert.deepEqual(names(result), expected, query);
    assert.equal(result.recovered, true, query);
  }
});

test("short words are not fuzzed and distant words stay unmatched", () => {
  assert.deepEqual(names(searchProductsWithRecovery(catalog, "mata")), []);
  assert.deepEqual(names(searchProductsWithRecovery(catalog, "lapicera")), []);
});

test("gender and commercial synonyms: «perfume mujer», «hombre», «regalo»", () => {
  assert.deepEqual(names(searchProductsWithRecovery(catalog, "perfume mujer")), ["Yara Rosa Lattafa"]);
  assert.deepEqual(names(searchProductsWithRecovery(catalog, "perfumes para hombre")), ["Asad Lattafa"]);
  assert.deepEqual(names(searchProductsWithRecovery(catalog, "fragancia dama")), ["Yara Rosa Lattafa"]);
  assert.deepEqual(names(searchProductsWithRecovery(catalog, "regalos")), ["Mate imperial"]);
  assert.equal(searchProductsWithRecovery(catalog, "perfume mujer").recovered, true);
});

test("every word still has to match after recovery", () => {
  assert.deepEqual(names(searchProductsWithRecovery(catalog, "stanly mujer")), []);
  assert.deepEqual(searchProductsWithRecovery(catalog, "   "), { products: catalog, recovered: false });
});
