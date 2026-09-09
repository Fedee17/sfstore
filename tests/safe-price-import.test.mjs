import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const moduleSource = readFileSync(
  join(testDirectory, "..", "lib", "product-import", "price-import.ts"),
  "utf8",
);
const compiledModule = ts.transpileModule(moduleSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  buildSafePriceImportDecision,
  classifyPriceImportPreview,
  findDuplicateImportSlugs,
  isRestrictedPriceImportProduct,
} = await import(`data:text/javascript;base64,${Buffer.from(compiledModule).toString("base64")}`);

const googleModuleSource = readFileSync(
  join(testDirectory, "..", "lib", "product-import", "google-visualization.ts"),
  "utf8",
);
const compiledGoogleModule = ts.transpileModule(googleModuleSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { parseGoogleVisualizationRows } = await import(
  `data:text/javascript;base64,${Buffer.from(compiledGoogleModule).toString("base64")}`
);

const existing = {
  id: "product-1",
  price: 200,
  transfer_price: 150,
  cost: 100,
  stock: 8,
  featured: true,
  status: "active",
  category_id: "perfumes",
  description: "Descripción existente",
  name: "Perfume existente",
};

const source = {
  price: 200,
  transferPrice: 150,
  cost: 100,
  priceProvided: true,
  transferPriceProvided: true,
  costProvided: true,
};

test("an existing product can change only cost", () => {
  const decision = buildSafePriceImportDecision({ ...source, cost: 120 }, existing);
  assert.equal(decision.kind, "update");
  assert.deepEqual(decision.patch, { cost: 120 });
  assert.deepEqual(decision.diffs, [{ field: "cost", currentValue: 100, nextValue: 120 }]);
});

for (const field of ["stock", "featured", "status", "category_id", "description"]) {
  test(`${field} is outside the allowed commercial patch`, () => {
    const decision = buildSafePriceImportDecision({ ...source, cost: 120 }, existing);
    assert.equal(decision.kind, "update");
    assert.equal(Object.hasOwn(decision.patch, field), false);
    assert.equal(existing[field] !== undefined, true);
  });
}

test("blank commercial cells preserve all existing values", () => {
  const decision = buildSafePriceImportDecision({
    price: null,
    transferPrice: null,
    cost: null,
    priceProvided: false,
    transferPriceProvided: false,
    costProvided: false,
  }, existing);
  assert.deepEqual(decision, { kind: "unchanged", patch: {}, diffs: [], errors: [] });
});

test("a missing product requires review and is not created", () => {
  const decision = buildSafePriceImportDecision(source, null);
  assert.equal(decision.kind, "review");
  assert.deepEqual(decision.patch, {});
});

test("all rows sharing a duplicate slug are detected", () => {
  const duplicates = findDuplicateImportSlugs([
    { slug: "termo-pico-system" },
    { slug: "otro-producto" },
    { slug: "termo-pico-system" },
  ]);
  assert.deepEqual([...duplicates], ["termo-pico-system"]);
  const classifications = ["Termo Pico System", "Termo pico system"].map(() =>
    classifyPriceImportPreview({
      source,
      existing,
      duplicate: duplicates.has("termo-pico-system"),
      restricted: false,
      errors: [],
    }),
  );
  assert.equal(classifications.every((row) => row.action === "duplicate"), true);
  assert.equal(classifications.every((row) => row.canImport === false), true);
});

test("restricted products remain blocked by the shared rule", () => {
  assert.equal(isRestrictedPriceImportProduct("Vaper Ignite V150"), true);
  assert.equal(isRestrictedPriceImportProduct("Termo Stanley"), false);
  const classification = classifyPriceImportPreview({
    source,
    existing: null,
    duplicate: false,
    restricted: true,
    errors: ["Producto restringido: revisar manualmente"],
  });
  assert.equal(classification.action, "blocked");
  assert.equal(classification.canImport, false);
});

test("equal commercial values are a real no-op", () => {
  assert.deepEqual(
    buildSafePriceImportDecision(source, existing),
    { kind: "unchanged", patch: {}, diffs: [], errors: [] },
  );
});

test("decimal precision is preserved in the generated patch", () => {
  const precise = 123.456789;
  const decision = buildSafePriceImportDecision({ ...source, cost: precise }, existing);
  assert.equal(decision.kind, "update");
  assert.equal(decision.patch.cost, precise);
});

test("Google Visualization uses the raw numeric value instead of its rounded display", () => {
  const response = `google.visualization.Query.setResponse(${JSON.stringify({
    table: {
      cols: [{ label: "Producto" }, { label: "PRECIO LISTA" }],
      rows: [{ c: [{ v: "Producto" }, { v: 45714.28571428571, f: "$45.714" }] }],
    },
  })});`;
  assert.deepEqual(parseGoogleVisualizationRows(response), [
    { Producto: "Producto", "PRECIO LISTA": 45714.28571428571 },
  ]);
});

test("positive prices and transfer lower than list are enforced", () => {
  assert.equal(buildSafePriceImportDecision({ ...source, price: 0 }, existing).kind, "invalid");
  assert.equal(buildSafePriceImportDecision({ ...source, transferPrice: 200 }, existing).kind, "invalid");
});
