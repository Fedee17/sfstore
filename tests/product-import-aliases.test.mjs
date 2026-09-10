import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));

async function importTypeScriptModule(path) {
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const aliases = await importTypeScriptModule(
  join(testDirectory, "..", "lib", "product-import", "aliases.ts"),
);
const priceImport = await importTypeScriptModule(
  join(testDirectory, "..", "lib", "product-import", "price-import.ts"),
);

const {
  getProductImportLookupSlugs,
  resolveProductImportSlugAlias,
  selectExistingProductForImport,
} = aliases;
const { buildSafePriceImportDecision } = priceImport;

const bombillas = {
  id: "bombillas-id",
  name: "BOMBILLAS",
  slug: "bombillas",
  price: 7929,
  transfer_price: 6105,
  cost: 3700,
  stock: 4,
  featured: true,
  status: "active",
};
const untamed = {
  id: "untamed-id",
  name: "Qaed Al Fursan Untamed",
  slug: "qaed-al-fursan-untamed",
  price: 74805.19,
  transfer_price: 57600,
  cost: 36000,
};

test("bombillas-plana resolves to the confirmed historical product", () => {
  assert.equal(
    resolveProductImportSlugAlias("Precios Productos", "bombillas-plana"),
    "bombillas",
  );
  assert.equal(
    selectExistingProductForImport(
      [bombillas],
      "Precios Productos",
      "bombillas-plana",
    ),
    bombillas,
  );
});

test("Lattafa Untamed resolves to the confirmed historical product", () => {
  assert.equal(
    resolveProductImportSlugAlias(
      "Precios Productos",
      "lattafa-qaed-al-fursan-untamed",
    ),
    "qaed-al-fursan-untamed",
  );
  assert.equal(
    selectExistingProductForImport(
      [untamed],
      "Precios Productos",
      "lattafa-qaed-al-fursan-untamed",
    ),
    untamed,
  );
});

test("an unknown slug stays unknown and therefore has no existing product", () => {
  assert.deepEqual(
    getProductImportLookupSlugs("Precios Productos", "producto-desconocido"),
    ["producto-desconocido"],
  );
  assert.equal(
    selectExistingProductForImport(
      [bombillas, untamed],
      "Precios Productos",
      "producto-desconocido",
    ),
    null,
  );
});

test("alias resolution is scoped to Precios Productos", () => {
  assert.equal(
    resolveProductImportSlugAlias("Termos y Mates", "bombillas-plana"),
    "bombillas-plana",
  );
});

test("selecting through an alias does not modify the historical product", () => {
  const before = structuredClone(bombillas);
  const selected = selectExistingProductForImport(
    [bombillas],
    "Precios Productos",
    "bombillas-plana",
  );
  assert.equal(selected, bombillas);
  assert.deepEqual(bombillas, before);
  assert.equal(selected.name, "BOMBILLAS");
  assert.equal(selected.slug, "bombillas");
});

test("matching commercial values through an alias are unchanged", () => {
  const selected = selectExistingProductForImport(
    [bombillas],
    "Precios Productos",
    "bombillas-plana",
  );
  const decision = buildSafePriceImportDecision({
    price: 7929,
    transferPrice: 6105,
    cost: 3700,
    priceProvided: true,
    transferPriceProvided: true,
    costProvided: true,
  }, selected);
  assert.deepEqual(decision, { kind: "unchanged", patch: {}, diffs: [], errors: [] });
});

test("a real commercial change through an alias updates only that field", () => {
  const selected = selectExistingProductForImport(
    [bombillas],
    "Precios Productos",
    "bombillas-plana",
  );
  const decision = buildSafePriceImportDecision({
    price: 7929,
    transferPrice: 6105,
    cost: 3800,
    priceProvided: true,
    transferPriceProvided: true,
    costProvided: true,
  }, selected);
  assert.equal(decision.kind, "update");
  assert.deepEqual(decision.patch, { cost: 3800 });
  assert.equal(Object.hasOwn(decision.patch, "name"), false);
  assert.equal(Object.hasOwn(decision.patch, "slug"), false);
  assert.equal(Object.hasOwn(decision.patch, "stock"), false);
});
