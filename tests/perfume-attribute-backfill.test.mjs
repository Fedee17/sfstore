import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));

async function loadBackfillModule() {
  const configSource = readFileSync(
    join(testDirectory, "..", "lib", "catalog", "attribute-config.ts"),
    "utf8",
  );
  const configCompiled = ts.transpileModule(configSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const configUrl = `data:text/javascript;base64,${Buffer.from(configCompiled).toString("base64")}`;
  const moduleSource = readFileSync(
    join(testDirectory, "..", "lib", "catalog", "perfume-attribute-backfill.ts"),
    "utf8",
  );
  const moduleCompiled = ts
    .transpileModule(moduleSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace('from "./attribute-config.ts"', `from "${configUrl}"`);

  const backfillModule = await import(
    `data:text/javascript;base64,${Buffer.from(moduleCompiled).toString("base64")}`
  );
  const configModule = await import(configUrl);

  return { ...backfillModule, configModule };
}

const {
  applySimulatedFieldPlans,
  buildPerfumeBackfillDryRun,
  configModule,
  planCommercialAttribute,
  validatePerfumeBackfillDocument,
} = await loadBackfillModule();

function sourceProduct(overrides = {}) {
  return {
    product_id: "product-1",
    name: "Perfume Uno",
    commercial_category: "árabe",
    olfactory_family: ["dulce", "cítrico"],
    intensity: "media",
    occasion: ["diario", "salida"],
    gender: "unisex",
    ...overrides,
  };
}

function document(products = [sourceProduct()]) {
  return { schema_version: 1, products };
}

function databaseProduct(overrides = {}) {
  return {
    id: "product-1",
    name: "Perfume Uno",
    slug: "perfume-uno",
    category: { id: "perfumes", name: "Perfumes", slug: "perfumes" },
    attributes: [],
    ...overrides,
  };
}

test("accepts every value from the central configuration", () => {
  for (const field of configModule.PERFUME_ATTRIBUTE_FIELDS) {
    if (field.multiple) {
      const validation = validatePerfumeBackfillDocument(
        document([
          sourceProduct({
            [field.key]: field.options.map((option) => option.label.toUpperCase()),
          }),
        ]),
      );
      assert.equal(validation.errors.length, 0, field.key);
      assert.deepEqual(
        validation.entries[0].target.attributes[field.key],
        field.options.map((option) => option.value),
      );
      continue;
    }

    for (const option of field.options) {
      const validation = validatePerfumeBackfillDocument(
        document([sourceProduct({ [field.key]: option.label.toUpperCase() })]),
      );
      assert.equal(validation.errors.length, 0, `${field.key}: ${option.value}`);
      assert.deepEqual(validation.entries[0].target.attributes[field.key], [
        option.value,
      ]);
    }
  }
});

test("rejects unsupported values", () => {
  const validation = validatePerfumeBackfillDocument(
    document([sourceProduct({ intensity: "extrema" })]),
  );

  assert.ok(
    validation.errors.some((error) => error.code === "unsupported_attribute_value"),
  );
  assert.equal(validation.entries[0].target, null);
});

test("rejects duplicate values inside multivalue fields", () => {
  const validation = validatePerfumeBackfillDocument(
    document([sourceProduct({ occasion: ["salida", "SALÍDA"] })]),
  );

  assert.ok(
    validation.errors.some((error) => error.code === "duplicate_attribute_value"),
  );
});

test("rejects duplicate product IDs", () => {
  const validation = validatePerfumeBackfillDocument(
    document([sourceProduct(), sourceProduct({ name: "Otro perfume" })]),
  );

  assert.equal(
    validation.errors.filter((error) => error.code === "duplicate_product_id").length,
    2,
  );
  assert.ok(validation.entries.every((entry) => entry.target === null));
});

test("different IDs may share a name without becoming invalid", () => {
  const validation = validatePerfumeBackfillDocument(
    document([
      sourceProduct(),
      sourceProduct({ product_id: "product-2" }),
    ]),
  );

  assert.equal(validation.errors.length, 0);
  assert.ok(validation.entries.every((entry) => entry.target !== null));
  assert.ok(
    validation.warnings.some((warning) => warning.code === "duplicate_context_name"),
  );
});

test("reports a product missing from Supabase", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const report = buildPerfumeBackfillDryRun(validation, [], []);

  assert.equal(report.products[0].status, "missing");
  assert.ok(report.errors.some((error) => error.code === "product_not_found"));
});

test("reports a Supabase perfume missing from the input file", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const report = buildPerfumeBackfillDryRun(
    validation,
    [databaseProduct()],
    ["product-1", "product-not-in-file"],
  );

  assert.ok(
    report.errors.some((error) => error.code === "perfume_missing_from_file"),
  );
});

test("rejects a product outside the Perfumes category", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const report = buildPerfumeBackfillDryRun(
    validation,
    [databaseProduct({ category: { id: "mates", name: "Mates", slug: "mates" } })],
    [],
  );

  assert.equal(report.products[0].status, "wrong_category");
  assert.ok(report.errors.some((error) => error.code === "wrong_category"));
});

test("empty current attributes produce five creates", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const report = buildPerfumeBackfillDryRun(
    validation,
    [databaseProduct()],
    ["product-1"],
  );

  assert.equal(report.summary.attributesToCreate, 5);
  assert.equal(report.summary.attributesToReplace, 0);
  assert.equal(report.summary.attributesUnchanged, 0);
});

test("equal normalized current attributes are unchanged", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const current = [
    { name: "commercial_category", value: "ARABE" },
    { name: "olfactory_family", value: "CÍTRICO" },
    { name: "olfactory_family", value: "dulce" },
    { name: "intensity", value: "Media" },
    { name: "occasion", value: "SALIDA" },
    { name: "occasion", value: "diario" },
    { name: "gender", value: "Unisex" },
  ];
  const report = buildPerfumeBackfillDryRun(
    validation,
    [databaseProduct({ attributes: current })],
    ["product-1"],
  );

  assert.equal(report.summary.attributesUnchanged, 5);
  assert.equal(report.summary.attributesToCreate, 0);
  assert.equal(report.summary.attributesToReplace, 0);
});

test("different current attributes produce a replacement plan", () => {
  const plan = planCommercialAttribute(
    "gender",
    ["unisex"],
    [{ name: "gender", value: "masculino" }],
  );

  assert.equal(plan.action, "replace");
  assert.deepEqual(
    plan.simulated_operations.map((operation) => operation.operation),
    ["delete_managed_values", "insert_values"],
  );
});

test("duplicate current rows are deduplicated by a replacement", () => {
  const plan = planCommercialAttribute(
    "occasion",
    ["salida"],
    [
      { name: "occasion", value: "salida" },
      { name: "Ocasión", value: "SALÍDA" },
    ],
  );

  assert.equal(plan.action, "replace");
  const after = applySimulatedFieldPlans(
    [
      { name: "occasion", value: "salida" },
      { name: "Ocasión", value: "SALÍDA" },
    ],
    [plan],
  );
  assert.deepEqual(after, [{ name: "occasion", value: "salida" }]);
});

test("applying a plan makes the next plan idempotently unchanged", () => {
  const desired = ["dulce", "citrico"];
  const firstPlan = planCommercialAttribute("olfactory_family", desired, []);
  const after = applySimulatedFieldPlans([], [firstPlan]);
  const secondPlan = planCommercialAttribute("olfactory_family", desired, after);

  assert.equal(firstPlan.action, "create");
  assert.equal(secondPlan.action, "unchanged");
  assert.deepEqual(secondPlan.simulated_operations, []);
});

test("the executable script has no Supabase write calls", () => {
  const scriptSource = readFileSync(
    join(testDirectory, "..", "scripts", "backfill-perfume-attributes.ts"),
    "utf8",
  );

  assert.match(scriptSource, /mode: "dry-run"/);
  assert.doesNotMatch(scriptSource, /\.(insert|update|upsert|delete)\s*\(/);
});
