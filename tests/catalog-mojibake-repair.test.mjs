import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const moduleSource = source("lib", "products", "catalog-mojibake-repair.ts");
const moduleCompiled = ts.transpileModule(moduleSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const repair = await import(
  `data:text/javascript;base64,${Buffer.from(moduleCompiled).toString("base64")}`
);

const entry = {
  product_id: "product-1",
  name: "Producto",
  field: "description",
  current_value: "sensaciÃ³n",
  proposed_fixed_value: "sensación",
  confidence: "HIGH",
  reason: "Plantilla conocida",
};

function dependencies(description) {
  const calls = { loads: [], updates: [] };
  return {
    calls,
    adapter: {
      async loadProduct(productId) {
        calls.loads.push(productId);
        return description === undefined ? null : { id: productId, description };
      },
      async updateDescription(productId, expected, proposed) {
        calls.updates.push({ productId, expected, proposed });
        return true;
      },
    },
  };
}

test("matching current_value is an update candidate", async () => {
  const { adapter } = dependencies(entry.current_value);
  const [result] = await repair.executeCatalogDescriptionRepair(
    [entry],
    adapter,
    { apply: false },
  );

  assert.equal(result.action, "DRY_RUN_UPDATE");
  assert.equal(result.before, entry.current_value);
  assert.equal(result.after, entry.proposed_fixed_value);
});

test("a changed remote value aborts without writing", async () => {
  const { adapter, calls } = dependencies("Descripción editada después");
  const [result] = await repair.executeCatalogDescriptionRepair(
    [entry],
    adapter,
    { apply: true },
  );

  assert.equal(result.action, "ABORT_REMOTE_CHANGED");
  assert.equal(calls.updates.length, 0);
});

test("an already corrected value is idempotently skipped", async () => {
  const { adapter, calls } = dependencies(entry.proposed_fixed_value);
  const [result] = await repair.executeCatalogDescriptionRepair(
    [entry],
    adapter,
    { apply: true },
  );

  assert.equal(result.action, "SKIP_ALREADY_CORRECT");
  assert.equal(calls.updates.length, 0);
});

test("apply passes only the approved description replacement", async () => {
  const { adapter, calls } = dependencies(entry.current_value);
  const [result] = await repair.executeCatalogDescriptionRepair(
    [entry],
    adapter,
    { apply: true },
  );

  assert.equal(result.action, "UPDATED");
  assert.deepEqual(calls.updates, [
    {
      productId: entry.product_id,
      expected: entry.current_value,
      proposed: entry.proposed_fixed_value,
    },
  ]);
});

test("products outside the report are never loaded or updated", async () => {
  const { adapter, calls } = dependencies(entry.current_value);
  await repair.executeCatalogDescriptionRepair([entry], adapter, { apply: true });

  assert.deepEqual(calls.loads, [entry.product_id]);
  assert.equal(calls.updates.some((call) => call.productId === "outside-report"), false);
});

test("dry-run never invokes the write dependency", async () => {
  const { adapter, calls } = dependencies(entry.current_value);
  await repair.executeCatalogDescriptionRepair([entry], adapter, { apply: false });

  assert.equal(calls.updates.length, 0);
});

test("the committed report contains only description repairs", () => {
  const entries = repair.parseCatalogMojibakeAudit(
    source("reports", "catalog-mojibake-audit.csv"),
  );

  assert.equal(entries.length, 2);
  assert.equal(entries.every((item) => item.field === "description"), true);
  assert.equal(new Set(entries.map((item) => item.product_id)).size, 2);
});

test("the CLI defaults to dry-run and updates only description", () => {
  const script = source("scripts", "fix-catalog-description-mojibake.ts");

  assert.match(script, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(script, /Modo DRY-RUN: no se escribirá ningún dato/);
  assert.match(script, /\.update\(\{ description: proposedFixedValue \}\)/);
  assert.match(script, /\.eq\("description", expectedCurrentValue\)/);
  assert.doesNotMatch(script, /\.update\(\{[^}]*?(price|stock|cost|status)/s);
});
