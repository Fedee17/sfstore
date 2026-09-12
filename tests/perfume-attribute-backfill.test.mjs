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
  const applySource = readFileSync(
    join(
      testDirectory,
      "..",
      "lib",
      "catalog",
      "perfume-attribute-backfill-apply.ts",
    ),
    "utf8",
  );
  const applyCompiled = ts.transpileModule(applySource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const applyModule = await import(
    `data:text/javascript;base64,${Buffer.from(applyCompiled).toString("base64")}`
  );
  const configModule = await import(configUrl);

  return { ...backfillModule, ...applyModule, configModule };
}

const {
  applySimulatedFieldPlans,
  assertApprovedApplyPreflight,
  assertPostWriteVerification,
  buildBackfillInsertRows,
  buildPerfumeBackfillDryRun,
  canonicalizeBackfillPlan,
  configModule,
  executeAtomicAttributeInsert,
  parseBackfillMode,
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

test("rejects a managed attribute that does not belong to perfumes", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const report = buildPerfumeBackfillDryRun(
    validation,
    [databaseProduct({ attributes: [{ name: "mate_type", value: "imperial" }] })],
    ["product-1"],
  );

  assert.equal(report.products[0].status, "invalid");
  assert.ok(
    report.errors.some((error) => error.code === "unexpected_managed_attribute"),
  );
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

test("apply mode is explicit and unknown arguments are rejected", () => {
  assert.equal(parseBackfillMode([]), "dry-run");
  assert.equal(parseBackfillMode(["--dry-run"]), "dry-run");
  assert.equal(parseBackfillMode(["--apply"]), "apply");
  assert.throws(() => parseBackfillMode(["--write"]), /no permitidos/);
  assert.throws(
    () => parseBackfillMode(["--dry-run", "--apply"]),
    /No se pueden combinar/,
  );
});

function approvalFor(report, planHash = "approved-plan") {
  return {
    schema_version: 1,
    source_sha256: "approved-source",
    initial_plan_sha256: planHash,
    expected: {
      products: 1,
      valid_products: 1,
      attributes_to_create: 5,
      attributes_to_replace: 0,
      attributes_unchanged: 0,
      rows_to_insert: report.summary.rowsToInsert,
      rows_to_delete: 0,
      errors: 0,
      warnings: 0,
    },
  };
}

test("apply preflight rejects a changed source or approved plan", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const report = buildPerfumeBackfillDryRun(
    validation,
    [databaseProduct()],
    ["product-1"],
  );
  const approval = approvalFor(report);

  assert.throws(
    () => assertApprovedApplyPreflight(report, approval, "changed", "approved-plan"),
    /hash del archivo fuente/,
  );
  assert.throws(
    () =>
      assertApprovedApplyPreflight(
        report,
        approval,
        "approved-source",
        "changed-plan",
      ),
    /plan detallado/,
  );

  const invalidValidation = validatePerfumeBackfillDocument(
    document([sourceProduct({ intensity: "extrema" })]),
  );
  const invalidReport = buildPerfumeBackfillDryRun(
    invalidValidation,
    [databaseProduct()],
    ["product-1"],
  );
  assert.throws(
    () =>
      assertApprovedApplyPreflight(
        invalidReport,
        approval,
        "approved-source",
        "approved-plan",
      ),
    /resumen del preflight/,
  );
});

test("the approved initial plan produces unique attribute-only insert rows", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const current = databaseProduct({
    attributes: [{ name: "Marca", value: "Marca histórica" }],
    price: 999,
    transfer_price: 888,
    cost: 777,
    stock: 7,
  });
  const report = buildPerfumeBackfillDryRun(validation, [current], ["product-1"]);
  const rows = buildBackfillInsertRows(report);

  assert.equal(rows.length, report.summary.rowsToInsert);
  assert.equal(
    new Set(rows.map((row) => `${row.product_id}/${row.name}/${row.value}`)).size,
    rows.length,
  );
  assert.ok(
    rows.every(
      (row) =>
        Object.keys(row).sort().join(",") ===
        "name,product_id,sort_order,value",
    ),
  );
  assert.deepEqual(current.attributes, [{ name: "Marca", value: "Marca histórica" }]);
  assert.equal(current.price, 999);
  assert.equal(current.transfer_price, 888);
  assert.equal(current.cost, 777);
  assert.equal(current.stock, 7);
  assert.match(canonicalizeBackfillPlan(report), /product-1/);
});

test("apply preflight accepts the fully applied state as an idempotent no-op", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const initial = buildPerfumeBackfillDryRun(
    validation,
    [databaseProduct()],
    ["product-1"],
  );
  const rows = buildBackfillInsertRows(initial);
  const appliedAttributes = rows.map((row) => ({ name: row.name, value: row.value }));
  const applied = buildPerfumeBackfillDryRun(
    validation,
    [databaseProduct({ attributes: appliedAttributes })],
    ["product-1"],
  );
  const approval = approvalFor(initial);

  assert.equal(
    assertApprovedApplyPreflight(
      applied,
      approval,
      "approved-source",
      "a-different-noop-hash",
    ),
    "already_applied",
  );
  assert.doesNotThrow(() => assertPostWriteVerification(applied, approval));
  assert.deepEqual(buildBackfillInsertRows(applied), []);
});

test("an atomic writer error aborts without reporting inserted rows", async () => {
  let calls = 0;
  await assert.rejects(
    executeAtomicAttributeInsert(
      [{ product_id: "product-1", name: "gender", value: "unisex", sort_order: 0 }],
      async () => {
        calls += 1;
        return { data: null, error: { message: "transaction rolled back" } };
      },
    ),
    /Falló la inserción atómica/,
  );
  assert.equal(calls, 1);
});

test("post-write verification rejects partial application", () => {
  const validation = validatePerfumeBackfillDocument(document());
  const initial = buildPerfumeBackfillDryRun(
    validation,
    [databaseProduct()],
    ["product-1"],
  );
  const partial = buildPerfumeBackfillDryRun(
    validation,
    [
      databaseProduct({
        attributes: [{ name: "gender", value: "unisex" }],
      }),
    ],
    ["product-1"],
  );

  assert.throws(
    () => assertPostWriteVerification(partial, approvalFor(initial)),
    /verificación posterior/,
  );
});

test("the executable writes only one bulk batch to product_attributes", () => {
  const scriptSource = readFileSync(
    join(testDirectory, "..", "scripts", "backfill-perfume-attributes.ts"),
    "utf8",
  );

  assert.match(scriptSource, /parseBackfillMode/);
  assert.equal((scriptSource.match(/\.insert\(batch\)/g) ?? []).length, 1);
  assert.match(scriptSource, /\.from\("product_attributes"\)/);
  assert.doesNotMatch(scriptSource, /\.(upsert|delete)\s*\(/);
  assert.doesNotMatch(scriptSource, /\.from\("products"\)\s*\.insert\s*\(/);
  assert.doesNotMatch(scriptSource, /\.from\("products"\)\s*\.update\s*\(/);
});
