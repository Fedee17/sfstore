import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDirectory = dirname(fileURLToPath(import.meta.url));

async function loadModule(...segments) {
  const source = readFileSync(join(testDirectory, "..", ...segments), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const {
  calculatePurchaseDraft,
  centsToDatabaseMoney,
  parseMoneyToCents,
} = await loadModule("lib", "purchases", "calculation.ts");
const { cleanSupplierName, normalizeSupplierName } = await loadModule(
  "lib",
  "purchases",
  "supplier.ts",
);
const { assertPurchaseIsDraft } = await loadModule(
  "lib",
  "purchases",
  "lifecycle.ts",
);

function calculate(lines, shippingCost = "0") {
  return calculatePurchaseDraft({ lines, shippingCost });
}

test("money is parsed as integer cents without floating point arithmetic", () => {
  assert.equal(parseMoneyToCents("123.45"), 12345);
  assert.equal(parseMoneyToCents("123,45"), 12345);
  assert.equal(parseMoneyToCents("0"), 0);
  assert.equal(centsToDatabaseMoney(12345), "123.45");
});

test("money rejects negatives, extra decimals and non numeric values", () => {
  for (const value of ["-1", "1.001", "NaN", "Infinity", ""]) {
    assert.throws(() => parseMoneyToCents(value));
  }
});

test("money rejects values outside numeric(12,2)", () => {
  assert.throws(() => parseMoneyToCents("10000000000.00"));
});

test("one product without shipping keeps supplier cost", () => {
  const result = calculate([
    { productId: "a", quantity: 2, unitPurchaseCost: "10.25" },
  ]);
  assert.equal(result.supplierSubtotalCents, 2050);
  assert.equal(result.shippingCostCents, 0);
  assert.equal(result.totalCostCents, 2050);
  assert.equal(result.lines[0].effectiveLineTotalCents, 2050);
});

test("one product receives the entire shipping cost", () => {
  const result = calculate(
    [{ productId: "a", quantity: 2, unitPurchaseCost: "10.00" }],
    "3.01",
  );
  assert.equal(result.lines[0].allocatedShippingTotalCents, 301);
  assert.equal(result.lines[0].effectiveLineTotalCents, 2301);
  assert.equal(result.totalCostCents, 2301);
});

test("shipping is distributed uniformly by units across products", () => {
  const result = calculate(
    [
      { productId: "a", quantity: 1, unitPurchaseCost: "10" },
      { productId: "b", quantity: 3, unitPurchaseCost: "20" },
    ],
    "4.00",
  );
  assert.deepEqual(
    result.lines.map((line) => line.allocatedShippingTotalCents),
    [100, 300],
  );
});

test("shipping remainder is assigned deterministically", () => {
  const first = calculate(
    [
      { productId: "b", quantity: 1, unitPurchaseCost: "1" },
      { productId: "a", quantity: 1, unitPurchaseCost: "1" },
      { productId: "c", quantity: 1, unitPurchaseCost: "1" },
    ],
    "0.01",
  );
  const second = calculate(
    [
      { productId: "b", quantity: 1, unitPurchaseCost: "1" },
      { productId: "a", quantity: 1, unitPurchaseCost: "1" },
      { productId: "c", quantity: 1, unitPurchaseCost: "1" },
    ],
    "0.01",
  );
  assert.deepEqual(first.lines, second.lines);
  assert.equal(
    first.lines.find((line) => line.productId === "a")
      .allocatedShippingTotalCents,
    1,
  );
});

test("allocated shipping reconciles exactly to the entered shipping", () => {
  const result = calculate(
    [
      { productId: "a", quantity: 2, unitPurchaseCost: "1.11" },
      { productId: "b", quantity: 7, unitPurchaseCost: "2.22" },
      { productId: "c", quantity: 13, unitPurchaseCost: "3.33" },
    ],
    "123.47",
  );
  assert.equal(
    result.lines.reduce(
      (sum, line) => sum + line.allocatedShippingTotalCents,
      0,
    ),
    12347,
  );
  assert.equal(
    result.lines.reduce((sum, line) => sum + line.effectiveLineTotalCents, 0),
    result.totalCostCents,
  );
});

test("per unit shipping preserves six decimal places as integer micropesos", () => {
  const result = calculate(
    [{ productId: "a", quantity: 3, unitPurchaseCost: "1" }],
    "0.01",
  );
  assert.equal(result.lines[0].allocatedShippingPerUnitMicros, 3333);
});

test("empty purchases are rejected", () => {
  assert.throws(() => calculate([]), /al menos un producto/);
});

test("duplicate products are rejected", () => {
  assert.throws(
    () =>
      calculate([
        { productId: "a", quantity: 1, unitPurchaseCost: "1" },
        { productId: "a", quantity: 2, unitPurchaseCost: "2" },
      ]),
    /repetir un producto/,
  );
});

test("missing products are rejected", () => {
  assert.throws(
    () => calculate([{ productId: " ", quantity: 1, unitPurchaseCost: "1" }]),
    /Falta el producto/,
  );
});

test("zero quantities are rejected", () => {
  assert.throws(() =>
    calculate([{ productId: "a", quantity: 0, unitPurchaseCost: "1" }]),
  );
});

test("negative quantities are rejected", () => {
  assert.throws(() =>
    calculate([{ productId: "a", quantity: -1, unitPurchaseCost: "1" }]),
  );
});

test("fractional quantities are rejected", () => {
  assert.throws(() =>
    calculate([{ productId: "a", quantity: 1.5, unitPurchaseCost: "1" }]),
  );
});

test("excessive quantities are rejected", () => {
  assert.throws(() =>
    calculate([{ productId: "a", quantity: 1_000_001, unitPurchaseCost: "1" }]),
  );
});

test("line totals outside numeric(12,2) are rejected", () => {
  assert.throws(() =>
    calculate([{ productId: "a", quantity: 2, unitPurchaseCost: "9999999999.99" }]),
  );
});

test("supplier names are cleaned and normalized deterministically", () => {
  assert.equal(cleanSupplierName("  José   Pérez  "), "José Pérez");
  assert.equal(normalizeSupplierName("  José   Pérez  "), "jose perez");
});

test("equivalent supplier names share the same normalized unique key", () => {
  assert.equal(normalizeSupplierName("JOSE PEREZ"), normalizeSupplierName("José  Pérez"));
});

test("draft purchases are editable", () => {
  assert.doesNotThrow(() => assertPurchaseIsDraft("draft"));
});

test("confirmed purchases are not editable", () => {
  assert.throws(() => assertPurchaseIsDraft("confirmed"), /borrador/);
});

test("cancelled purchases are not editable", () => {
  assert.throws(() => assertPurchaseIsDraft("cancelled"), /borrador/);
});
