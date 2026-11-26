import assert from "node:assert/strict";
import { test } from "node:test";
import { selectRelatedProducts } from "../lib/catalog/related-products.ts";

// CONV-01 (26/11): «Más en…» must suggest products related to the one on screen, not the first four of the category.
let sequence = 0;
const perfume = (slug, { gender, families = [], intensity, stock = 1, photo = true, name = slug, featured = false } = {}) => ({
  id: `id-${slug}`, slug, name, category: "perfumes", categorySlug: "perfumes", categoryId: "cat-perfumes",
  price: 100, transferPrice: 75, stock, featured, shortDescription: "", imagePlaceholder: "", order: sequence++,
  primaryImageUrl: photo ? `https://example.test/${slug}.jpg` : null,
  attributes: [
    ...(gender ? [{ name: "Género", value: gender, sort_order: 0 }] : []),
    ...families.map((value, index) => ({ name: "Familia olfativa", value, sort_order: index + 1 })),
    ...(intensity ? [{ name: "Intensidad", value: intensity, sort_order: 9 }] : []),
  ],
});
const matero = (slug, categorySlug, { stock = 1, photo = true, featured = false } = {}) => ({
  id: `id-${slug}`, slug, name: slug, category: "mates", categorySlug, categoryId: `cat-${categorySlug}`,
  price: 100, transferPrice: 75, stock, featured, shortDescription: "", imagePlaceholder: "",
  primaryImageUrl: photo ? `https://example.test/${slug}.jpg` : null, attributes: [],
});
const slugs = products => products.map(product => product.slug);

test("perfumes: olfactory family, intensity and compatible gender decide the order", () => {
  const current = perfume("intense-man", { gender: "Masculino", families: ["Amaderado", "Especiado"], intensity: "Intensa" });
  const catalog = [
    perfume("a-floral-femme", { gender: "Femenino", families: ["Floral"], intensity: "Suave" }),
    perfume("b-woody-femme", { gender: "Femenino", families: ["Amaderado", "Especiado"], intensity: "Intensa" }),
    perfume("c-sweet-man", { gender: "Masculino", families: ["Dulce"], intensity: "Media" }),
    current,
    perfume("d-woody-man", { gender: "Masculino", families: ["Amaderado", "Especiado"], intensity: "Intensa" }),
    perfume("e-woody-unisex", { gender: "Unisex", families: ["Amaderado"], intensity: "Intensa" }),
  ];
  const related = selectRelatedProducts(current, catalog);
  assert.deepEqual(slugs(related), ["d-woody-man", "e-woody-unisex", "c-sweet-man"]);
  assert.ok(!related.includes(current), "the product on screen is never suggested");
  assert.ok(related.every(product => !product.slug.endsWith("femme")), "an opposite gender is never suggested");
});

test("perfumes: different profiles get different suggestions", () => {
  const catalog = [
    perfume("sweet-femme", { gender: "Femenino", families: ["Dulce", "Frutal"], intensity: "Media" }),
    perfume("fruity-femme", { gender: "Femenino", families: ["Frutal"], intensity: "Media" }),
    perfume("fresh-man", { gender: "Masculino", families: ["Fresco", "Cítrico"], intensity: "Suave" }),
    perfume("citrus-man", { gender: "Masculino", families: ["Cítrico"], intensity: "Suave" }),
  ];
  assert.deepEqual(slugs(selectRelatedProducts(catalog[0], catalog)), ["fruity-femme"]);
  assert.deepEqual(slugs(selectRelatedProducts(catalog[2], catalog)), ["citrus-man"]);
});

test("available products with a photo come first; sold-out ones only fill the gap", () => {
  const current = perfume("current", { gender: "Femenino", families: ["Dulce"] });
  const catalog = [
    current,
    perfume("best-match-sold-out", { gender: "Femenino", families: ["Dulce"], stock: 0 }),
    perfume("best-match-no-photo", { gender: "Femenino", families: ["Dulce"], photo: false }),
    perfume("partial-match", { gender: "Femenino", families: ["Dulce", "Floral", "Frutal"] }),
  ];
  assert.deepEqual(slugs(selectRelatedProducts(current, catalog)), ["partial-match", "best-match-sold-out"]);
});

test("perfumes without affinity data fall back to available, gender-compatible perfumes", () => {
  const current = perfume("no-data", { gender: "Masculino" });
  const catalog = [
    current,
    perfume("femme", { gender: "Femenino" }),
    perfume("sold-out-man", { gender: "Masculino", stock: 0 }),
    perfume("featured-unisex", { gender: "Unisex", featured: true }),
    perfume("plain-man", { gender: "Masculino", name: "Alpha" }),
  ];
  assert.deepEqual(slugs(selectRelatedProducts(current, catalog)), ["featured-unisex", "plain-man", "sold-out-man"]);
});

test("decants are suggested only next to decants (their promotion is withdrawn)", () => {
  const bottle = perfume("bottle", { gender: "Femenino", families: ["Dulce"] });
  const decant = { ...perfume("decant-dulce", { gender: "Femenino", families: ["Dulce"], name: "Decant Dulce" }), attributes: [...perfume("x", { gender: "Femenino", families: ["Dulce"] }).attributes, { name: "Tipo", value: "Decant", sort_order: 10 }] };
  const otherDecant = { ...decant, id: "id-decant-2", slug: "decant-otro", name: "Decant Otro" };
  const catalog = [bottle, decant, otherDecant, perfume("bottle-2", { gender: "Femenino", families: ["Dulce"] })];
  assert.deepEqual(slugs(selectRelatedProducts(bottle, catalog)), ["bottle-2"]);
  assert.deepEqual(slugs(selectRelatedProducts(decant, catalog)), ["decant-otro"]);
});

test("mates: cross-sell bombillas, termos and accessories before more mates", () => {
  const current = matero("mate-imperial", "mates");
  const catalog = [
    current,
    matero("mate-camionero", "mates"), matero("mate-torpedo", "mates"), matero("mate-criollo", "mates"),
    matero("bombilla-pico", "bombillas"), matero("bombilla-sold-out", "bombillas", { stock: 0 }),
    matero("termo-stanley", "termos"), matero("matera-cuero", "materas"), matero("yerba-lata", "latas-de-yerba"),
  ];
  const related = selectRelatedProducts(current, catalog);
  assert.deepEqual(slugs(related), ["bombilla-pico", "termo-stanley", "matera-cuero", "yerba-lata"]);
});

test("termos: suggest mates and matero complements; same subcategory is the fallback", () => {
  const current = matero("termo-a", "termos");
  const catalog = [current, matero("termo-b", "termos"), matero("mate-x", "mates"), matero("bombilla-x", "bombillas")];
  assert.deepEqual(slugs(selectRelatedProducts(current, catalog)), ["mate-x", "bombilla-x", "termo-b"]);
});

test("family variants of the product on screen are excluded and sections never mix", () => {
  const family = { ...matero("stanley", "termos"), id: "family-stanley", kind: "family", familyId: "family-stanley" };
  const variant = { ...matero("stanley-gris", "termos"), kind: "variant", familyId: "family-stanley" };
  const charger = { ...matero("cargador", "cargadores"), category: "accesorios" };
  const perfumeItem = perfume("perfume-x", { gender: "Unisex" });
  assert.deepEqual(slugs(selectRelatedProducts(family, [family, variant, charger, perfumeItem, matero("mate-y", "mates")])), ["mate-y"]);
});

test("at most four suggestions, catalog untouched", () => {
  const current = matero("mate-a", "mates");
  const catalog = [current, ...Array.from({ length: 8 }, (_, index) => matero(`bombilla-${index}`, "bombillas"))];
  const copy = JSON.stringify(catalog);
  assert.equal(selectRelatedProducts(current, catalog).length, 4);
  assert.equal(JSON.stringify(catalog), copy);
});

// Real catalog (26/11): porta mates, dispenser and despolvillador live in the public «Accesorios» section with
// subcategory «accesorios»; vasos térmicos share the termos kind. A mate must still reach those accessories.
const accessory = (slug, categorySlug, options) => ({ ...matero(slug, categorySlug, options), category: "accesorios" });

test("mates: matero accessories from the Accesorios section are cross-sold, never electronics or gift boxes", () => {
  const current = matero("mate-camionero", "mates");
  const catalog = [
    current, matero("mate-torpedo", "mates"), matero("bombilla-pico", "bombillas"),
    matero("quencher-celeste", "vasos-termicos"), matero("quencher-negro", "vasos-termicos"),
    accessory("cargador", "electronica"), accessory("box-argentina", "regalos"), accessory("porta-mate-cuero", "accesorios"),
  ];
  assert.deepEqual(slugs(selectRelatedProducts(current, catalog)), ["bombilla-pico", "quencher-celeste", "porta-mate-cuero", "quencher-negro"]);
});

test("mates: a real termo comes before vasos térmicos inside the termos kind", () => {
  const current = matero("mate-camionero", "mates");
  const catalog = [current, matero("quencher", "vasos-termicos", { featured: true }), matero("termo-goat", "termos")];
  assert.deepEqual(slugs(selectRelatedProducts(current, catalog)), ["termo-goat", "quencher"]);
});

test("accessories outside the matero taxonomy keep their own section only", () => {
  const charger = accessory("cargador", "electronica");
  assert.deepEqual(slugs(selectRelatedProducts(charger, [charger, accessory("cable", "electronica"), matero("mate-x", "mates")])), ["cable"]);
});

test("mates: bombillas and bombillones count as one kind, so the four suggestions stay varied", () => {
  const current = matero("mate-a", "mates");
  const catalog = [current, matero("bombilla", "bombillas"), matero("bombillon", "bombillones"), matero("termo", "termos"), matero("vaso", "vasos-termicos"), matero("matera", "materas"), matero("lata", "latas-de-yerba")];
  assert.deepEqual(slugs(selectRelatedProducts(current, catalog)), ["bombilla", "termo", "matera", "lata"]);
});
