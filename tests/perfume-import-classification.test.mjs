import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));

function compileModule(path) {
  return ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const priceUrl = `data:text/javascript;base64,${Buffer.from(compileModule(
  join(testDirectory, "..", "lib", "product-import", "price-import.ts"),
)).toString("base64")}`;
const catalogUrl = `data:text/javascript;base64,${Buffer.from(compileModule(
  join(testDirectory, "..", "lib", "catalog", "attribute-config.ts"),
)).toString("base64")}`;
const perfumeSource = compileModule(
  join(testDirectory, "..", "lib", "product-import", "perfume-import.ts"),
)
  .replace('from "@/lib/catalog/attribute-config"', `from "${catalogUrl}"`)
  .replace('from "@/lib/product-import/price-import"', `from "${priceUrl}"`);
const { buildPerfumeImportDecision } = await import(
  `data:text/javascript;base64,${Buffer.from(perfumeSource).toString("base64")}`
);

const row = {
  rowNumber: 2,
  sourceSheet: "Producto Perfumes",
  name: "LATTAFA ASAD",
  slug: "lattafa-asad",
  categoryName: "Perfumes",
  categorySlug: "perfumes",
  price: 95844.16,
  transferPrice: 73800,
  cost: 26300,
  commercialFields: {
    priceProvided: true,
    transferPriceProvided: true,
    costProvided: true,
  },
  stock: 0,
  status: "active",
  sku: null,
  shortDescription: "LATTAFA ASAD disponible en SFSTORE.",
  description: "Descripción de LATTAFA ASAD.",
  attributes: [
    { name: "Proveedor", value: "COLD IMPORTADOR DIRECTO", sortOrder: 10 },
    { name: "Tipo", value: "Perfumes", sortOrder: 20 },
  ],
  catalogAttributeUpdates: [],
  warnings: [],
  errors: [],
};

const existing = {
  id: "product-1",
  category_id: "category-perfumes",
  name: row.name,
  slug: row.slug,
  short_description: row.shortDescription,
  description: row.description,
  status: row.status,
  price: row.price,
  transfer_price: row.transferPrice,
  compare_at_price: null,
  cost: row.cost,
  stock: row.stock,
  sku: row.sku,
  featured: false,
  categories: { name: "Perfumes", slug: "perfumes" },
  product_attributes: [
    { name: "Proveedor", value: "COLD IMPORTADOR DIRECTO", sort_order: 10 },
    { name: "Tipo", value: "Perfumes", sort_order: 20 },
    { name: "Marca", value: "Lattafa", sort_order: 30 },
  ],
};

test("an existing perfume with no effective diffs is unchanged", () => {
  assert.deepEqual(buildPerfumeImportDecision(row, existing), {
    kind: "unchanged",
    diffs: [],
  });
});

test("an existing perfume with one real diff is update", () => {
  const decision = buildPerfumeImportDecision(
    { ...row, cost: 49200 },
    existing,
  );
  assert.equal(decision.kind, "update");
  assert.deepEqual(decision.diffs, [{
    field: "cost",
    label: "Costo",
    currentValue: 26300,
    nextValue: 49200,
    format: "money",
  }]);
});

test("a valid new perfume keeps the existing CREATE behavior", () => {
  assert.deepEqual(buildPerfumeImportDecision(row, null), {
    kind: "create",
    diffs: [],
  });
});

test("unchanged attributes do not create a false update", () => {
  const decision = buildPerfumeImportDecision(row, existing, "automatic");
  assert.equal(decision.kind, "unchanged");
});

test("a changed source attribute is an effective update", () => {
  const decision = buildPerfumeImportDecision({
    ...row,
    attributes: [
      { name: "Proveedor", value: "OTRO PROVEEDOR", sortOrder: 10 },
      { name: "Tipo", value: "Perfumes", sortOrder: 20 },
    ],
  }, existing, "automatic");
  assert.equal(decision.kind, "update");
  assert.deepEqual(decision.diffs, [{
    field: "attribute:Proveedor",
    label: "Proveedor",
    currentValue: ["COLD IMPORTADOR DIRECTO"],
    nextValue: ["OTRO PROVEEDOR"],
    format: "list",
  }]);
});

test("only fields already written by automatic sync participate in its decision", () => {
  const automatic = buildPerfumeImportDecision(row, {
    ...existing,
    stock: 8,
    featured: true,
    description: "Descripción histórica",
  }, "automatic");
  assert.equal(automatic.kind, "unchanged");
});

test("manual confirmation still detects fields already written by its current payload", () => {
  const confirmation = buildPerfumeImportDecision(row, {
    ...existing,
    stock: 8,
  });
  assert.equal(confirmation.kind, "update");
  assert.equal(confirmation.diffs.some((diff) => diff.field === "stock"), true);
});

test("Precios Productos keeps its independent classifier", () => {
  const actions = readFileSync(
    join(testDirectory, "..", "app", "admin", "productos", "importar", "actions.ts"),
    "utf8",
  );
  assert.match(actions, /if \(sheetName === "Precios Productos"\)/);
  assert.match(actions, /classifyPriceImportPreview\(/);
});

test("confirmation and automatic sync both skip unchanged perfumes", () => {
  const service = readFileSync(
    join(testDirectory, "..", "services", "product-import.ts"),
    "utf8",
  );
  assert.equal(
    service.match(/buildPerfumeImportDecision\([\s\S]*?\)\.kind === "unchanged"/g)?.length,
    2,
  );
});
