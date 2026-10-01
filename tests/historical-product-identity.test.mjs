import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "lib", "historical-import", "historical-product.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const historicalProduct = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("builds an archived identity without invented commercial values", () => {
  const product = historicalProduct.buildHistoricalProductIdentity({
    historicalGroupKey: "legacy-product",
    name: "Legacy Product",
    slug: "historical-legacy-product",
    categoryId: "category-id",
  });
  assert.equal(product.historical_identity, true);
  assert.equal(product.status, "archived");
  assert.equal(product.stock, 0);
  assert.equal(product.featured, false);
  for (const key of ["short_description", "price", "transfer_price", "compare_at_price", "cost", "cost_source_purchase_item_id"]) {
    assert.equal(product[key], null);
  }
});

test("requires identity and category fields", () => {
  assert.throws(() => historicalProduct.buildHistoricalProductIdentity({
    historicalGroupKey: "", name: "Legacy", slug: "legacy", categoryId: "category-id",
  }));
});

test("idempotency comparison rejects any drift", () => {
  const expected = historicalProduct.buildHistoricalProductIdentity({
    historicalGroupKey: "legacy", name: "Legacy", slug: "historical-legacy", categoryId: "category-id",
  });
  assert.equal(historicalProduct.historicalProductIdentityMatches({ ...expected }, expected), true);
  assert.equal(historicalProduct.historicalProductIdentityMatches({ ...expected, stock: 1 }, expected), false);
});
