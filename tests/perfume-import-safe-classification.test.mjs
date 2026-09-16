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

const catalogUrl = `data:text/javascript;base64,${Buffer.from(compileModule(
  join(testDirectory, "..", "lib", "catalog", "attribute-config.ts"),
)).toString("base64")}`;
const perfumeSource = compileModule(
  join(testDirectory, "..", "lib", "product-import", "perfume-import.ts"),
).replace('from "@/lib/catalog/attribute-config"', `from "${catalogUrl}"`);
const {
  buildExistingPerfumeImportPatch,
  buildPerfumeImportDecision,
  getExistingPerfumeImportErrors,
} = await import(
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
  cost: 49200,
  commercialFields: {
    priceProvided: true,
    transferPriceProvided: true,
    costProvided: true,
  },
  stock: 0,
  status: "active",
  sku: null,
  shortDescription: "Descripción generada",
  description: "Descripción generada extensa",
  attributes: [
    { name: "Proveedor", value: "COLD IMPORTADOR DIRECTO", sortOrder: 10 },
    { name: "Tipo", value: "Perfumes", sortOrder: 20 },
  ],
  catalogAttributeUpdates: [
    { key: "gender", label: "Género", values: ["masculino"] },
  ],
  warnings: [],
  errors: [],
};

const existing = {
  id: "product-1",
  name: row.name,
  slug: row.slug,
  categories: { name: "Perfumes", slug: "perfumes" },
  product_attributes: [
    { name: "Proveedor", value: "COLD IMPORTADOR DIRECTO", sort_order: 10 },
    { name: "Tipo", value: "Perfumes", sort_order: 20 },
    { name: "gender", value: "Masculino", sort_order: 100 },
  ],
  price: row.price,
  transfer_price: row.transferPrice,
  cost: row.cost,
  stock: 25,
  featured: true,
  status: "active",
  sku: "PERF-1",
  description: "Descripción histórica",
};

test("an identical existing perfume is unchanged", () => {
  assert.deepEqual(buildPerfumeImportDecision(row, existing), {
    kind: "unchanged",
    diffs: [],
  });
});

test("an allowed identity change is an update with an explainable diff", () => {
  const decision = buildPerfumeImportDecision(
    { ...row, name: "Lattafa Asad", slug: "lattafa-asad" },
    existing,
  );
  assert.equal(decision.kind, "update");
  assert.deepEqual(decision.diffs, [{
    field: "name",
    label: "Nombre",
    currentValue: "LATTAFA ASAD",
    nextValue: "Lattafa Asad",
    format: "text",
  }]);
});

test("a normalized commercial attribute change is an update", () => {
  const decision = buildPerfumeImportDecision({
    ...row,
    catalogAttributeUpdates: [
      { key: "gender", label: "Género", values: ["femenino"] },
    ],
  }, existing);
  assert.equal(decision.kind, "update");
  assert.deepEqual(decision.diffs, [{
    field: "attribute:gender",
    label: "Género",
    currentValue: ["masculino"],
    nextValue: ["femenino"],
    format: "list",
  }]);
});

for (const [label, changes] of [
  ["price", { price: 1 }],
  ["transfer_price", { transferPrice: 1 }],
  ["cost", { cost: 1 }],
]) {
  test(`a change only in ${label} is unchanged`, () => {
    assert.deepEqual(buildPerfumeImportDecision({ ...row, ...changes }, existing), {
      kind: "unchanged",
      diffs: [],
    });
  });
}

test("a valid new perfume keeps CREATE behavior", () => {
  assert.deepEqual(buildPerfumeImportDecision(row, null), {
    kind: "create",
    diffs: [],
  });
});

test("the existing product patch contains only changed authorized fields", () => {
  const decision = buildPerfumeImportDecision(
    { ...row, name: "Lattafa Asad" },
    existing,
  );
  assert.equal(decision.kind, "update");
  assert.deepEqual(
    buildExistingPerfumeImportPatch(
      { ...row, name: "Lattafa Asad" },
      null,
      decision.diffs,
    ),
    { name: "Lattafa Asad" },
  );
});

test("stock and other protected state never enter the existing perfume patch", () => {
  const diffs = [
    { field: "name", label: "Nombre", currentValue: row.name, nextValue: "Nuevo", format: "text" },
    { field: "stock", label: "Stock", currentValue: 25, nextValue: 0, format: "text" },
    { field: "price", label: "Precio", currentValue: 10, nextValue: 20, format: "money" },
  ];
  const patch = buildExistingPerfumeImportPatch(
    { ...row, name: "Nuevo" },
    "category-perfumes",
    diffs,
  );
  assert.deepEqual(patch, { name: "Nuevo" });
  for (const field of ["price", "transfer_price", "cost", "stock", "featured", "status", "sku", "description"]) {
    assert.equal(Object.hasOwn(patch, field), false);
  }
});

test("commercial price validation errors are ignored only for existing perfumes", () => {
  assert.deepEqual(getExistingPerfumeImportErrors([
    "Precio lista inválido o faltante",
    "Precio efectivo/transferencia debe ser menor que precio lista",
    "El costo no puede ser negativo.",
  ]), []);
  assert.deepEqual(getExistingPerfumeImportErrors([
    "Precio lista inválido o faltante",
    "Producto restringido: revisar manualmente",
  ]), ["Producto restringido: revisar manualmente"]);
});

test("manual confirmation and automatic sync share the safe perfume decision", () => {
  const service = readFileSync(
    join(testDirectory, "..", "services", "product-import.ts"),
    "utf8",
  );
  assert.equal(service.match(/buildPerfumeImportDecision\(/g)?.length, 2);
  assert.equal(service.match(/await applyExistingPerfumeUpdate\(/g)?.length, 2);
  assert.equal(service.match(/decision\.kind === "unchanged"/g)?.length, 4);
  const sharedUpdater = service.match(
    /async function applyExistingPerfumeUpdate[\s\S]*?\n}\n\nfunction getPriceCells/,
  )?.[0] ?? "";
  assert.doesNotMatch(sharedUpdater, /\bprice\b|transfer_price|\bcost\b|\bstock\b|\bfeatured\b|\bstatus\b|\bsku\b|description/);
});

test("Precios Productos keeps its independent safe classifier", () => {
  const actions = readFileSync(
    join(testDirectory, "..", "app", "admin", "productos", "importar", "actions.ts"),
    "utf8",
  );
  const service = readFileSync(
    join(testDirectory, "..", "services", "product-import.ts"),
    "utf8",
  );
  assert.match(actions, /if \(sheetName === "Precios Productos"\)/);
  assert.match(actions, /classifyPriceImportPreview\(/);
  assert.equal(service.match(/buildSafePriceImportDecision\(/g)?.length, 2);
});
