import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));

async function loadExportModule() {
  const configSource = readFileSync(
    join(testDirectory, "..", "lib", "catalog", "attribute-config.ts"),
    "utf8",
  );
  const configCompiled = ts.transpileModule(configSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const configUrl = `data:text/javascript;base64,${Buffer.from(configCompiled).toString("base64")}`;
  const exportSource = readFileSync(
    join(testDirectory, "..", "lib", "catalog", "perfume-attribute-export.ts"),
    "utf8",
  );
  const exportCompiled = ts
    .transpileModule(exportSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace('from "./attribute-config.ts"', `from "${configUrl}"`);

  return import(
    `data:text/javascript;base64,${Buffer.from(exportCompiled).toString("base64")}`
  );
}

const {
  buildPerfumeAttributeExport,
  serializePerfumeAttributeCsv,
  serializePerfumeAttributeJson,
} = await loadExportModule();

function product(overrides = {}) {
  return {
    id: "product-1",
    name: "Perfume Zeta",
    slug: "perfume-zeta",
    sku: "PERF-001",
    price: 120,
    transfer_price: 100,
    stock: 4,
    category: { id: "category-1", name: "Perfumes", slug: "perfumes" },
    attributes: [
      { name: "Marca", value: "Marca Uno" },
      { name: "Tipo", value: "EDP" },
      { name: "Proveedor", value: "Proveedor Uno" },
    ],
    ...overrides,
  };
}

test("reconstructs multivalue commercial attributes as arrays", () => {
  const result = buildPerfumeAttributeExport([
    product({
      attributes: [
        { name: "Marca", value: "Marca Uno" },
        { name: "Tipo", value: "EDP" },
        { name: "Familia olfativa", value: "Dulce" },
        { name: "olfactory_family", value: "Ambarado" },
        { name: "Momento", value: "Noche" },
        { name: "occasion", value: "Cita" },
      ],
    }),
  ]);

  assert.deepEqual(result.records[0].olfactory_family, ["dulce", "ambarado"]);
  assert.deepEqual(result.records[0].occasion, ["noche", "cita"]);
});

test("serializes multivalue CSV cells with pipes and escapes regular cells", () => {
  const result = buildPerfumeAttributeExport([
    product({
      name: 'Perfume "Uno", edición',
      attributes: [
        { name: "Marca", value: "Marca Uno" },
        { name: "Tipo", value: "EDP" },
        { name: "olfactory_family", value: "dulce" },
        { name: "olfactory_family", value: "frutal" },
        { name: "occasion", value: "diario" },
        { name: "occasion", value: "regalo" },
      ],
    }),
  ]);
  const csv = serializePerfumeAttributeCsv(result.records);

  assert.match(csv, /dulce\|frutal/);
  assert.match(csv, /diario\|regalo/);
  assert.match(csv, /"Perfume ""Uno"", edición"/);
  assert.doesNotMatch(csv, /\["dulce"/);
});

test("keeps products with absent attributes and reports warnings", () => {
  const result = buildPerfumeAttributeExport([product({ attributes: null })]);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].brand, "");
  assert.equal(result.records[0].type, "");
  assert.deepEqual(
    result.warnings.map((warning) => warning.code).sort(),
    ["missing_brand", "missing_type"],
  );
});

test("sorts products alphabetically by name", () => {
  const result = buildPerfumeAttributeExport([
    product({ id: "z", name: "Zeta" }),
    product({ id: "a", name: "Ámbar" }),
    product({ id: "b", name: "Brisa" }),
  ]);

  assert.deepEqual(
    result.records.map((record) => record.name),
    ["Ámbar", "Brisa", "Zeta"],
  );
});

test("detects duplicate IDs and normalized names", () => {
  const result = buildPerfumeAttributeExport([
    product({ id: "same", name: "Perfume Único" }),
    product({ id: "same", name: " perfume unico " }),
  ]);
  const codes = result.warnings.map((warning) => warning.code);

  assert.equal(codes.filter((code) => code === "duplicate_product_id").length, 2);
  assert.equal(codes.filter((code) => code === "duplicate_name").length, 2);
});

test("separates unexpected legacy attributes", () => {
  const result = buildPerfumeAttributeExport([
    product({
      attributes: [
        { name: "Marca", value: "Marca Uno" },
        { name: "Tipo", value: "EDP" },
        { name: "Concentración legacy", value: "Alta" },
      ],
    }),
  ]);

  assert.deepEqual(result.records[0].legacy_attributes, {
    "Concentración legacy": ["Alta"],
  });
  assert.match(serializePerfumeAttributeCsv(result.records), /legacy_concentracion_legacy/);
  assert.ok(
    result.warnings.some(
      (warning) => warning.code === "unexpected_legacy_attribute",
    ),
  );
});

test("excludes cost from CSV and JSON output", () => {
  const source = product({ cost: 999 });
  const result = buildPerfumeAttributeExport([source]);
  const csv = serializePerfumeAttributeCsv(result.records);
  const json = serializePerfumeAttributeJson(result.records);

  assert.doesNotMatch(csv.split("\n")[0], /cost/);
  assert.equal(Object.hasOwn(JSON.parse(json).products[0], "cost"), false);
});

test("the executable script is read-only and does not select cost", () => {
  const scriptSource = readFileSync(
    join(testDirectory, "..", "scripts", "export-perfume-attributes.ts"),
    "utf8",
  );

  assert.match(scriptSource, /\.from\("products"\)[\s\S]*?\.select\(/);
  assert.doesNotMatch(scriptSource, /\.(insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(scriptSource, /\bcost\b/);
});
