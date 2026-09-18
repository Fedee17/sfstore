import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(testDirectory, "..");
const model = await import(pathToFileURL(join(root, "lib", "store-sales.ts")).href);
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const service = source("services", "store-sales.ts");
const listPage = source("app", "admin", "ventas", "page.tsx");
const detailPage = source("app", "admin", "ventas", "[id]", "page.tsx");

const orderNumber = "SF-L-20260918233449-C65DF7";

test("one item uses the product snapshot name", () => {
  assert.equal(
    model.getStoreSaleDisplayName(orderNumber, [
      { product_name: "Amber Oud Gold Edition" },
    ]),
    "Amber Oud Gold Edition",
  );
});

test("two items use a singular additional product label", () => {
  assert.equal(
    model.getStoreSaleDisplayName(orderNumber, [
      { product_name: "Amber Oud Gold Edition" },
      { product_name: "Lattafa Asad" },
    ]),
    "Amber Oud Gold Edition + 1 producto",
  );
});

test("four items use a plural additional product label", () => {
  assert.equal(
    model.getStoreSaleDisplayName(orderNumber, [
      { product_name: "Amber Oud Gold Edition" },
      { product_name: "Lattafa Asad" },
      { product_name: "Qaed Al Fursan" },
      { product_name: "Mate Stanley" },
    ]),
    "Amber Oud Gold Edition + 3 productos",
  );
});

test("missing items fall back to the technical order number", () => {
  assert.equal(model.getStoreSaleDisplayName(orderNumber, []), orderNumber);
});

test("a missing first snapshot name falls back to the technical order number", () => {
  assert.equal(
    model.getStoreSaleDisplayName(orderNumber, [{ product_name: "  " }]),
    orderNumber,
  );
});

test("the list reuses item snapshots without a separate product query", () => {
  assert.match(service, /order_items\(id,product_name,created_at\)/i);
  assert.match(service, /displayName: getStoreSaleDisplayName/i);
  assert.doesNotMatch(service, /listStoreSales[\s\S]+\.from\("products"\)/i);
});

test("the list keeps payment status, total and technical order number", () => {
  assert.match(listPage, /paymentLabels\[sale\.payment_status\]/i);
  assert.match(listPage, /currencyFormatter\.format\(Number\(sale\.total\)\)/i);
  assert.match(listPage, /Venta \{sale\.order_number\}/i);
});

test("the protected detail uses the same display rule and stays accessible", () => {
  assert.match(detailPage, /await requireAdminSession\(\)/i);
  assert.match(detailPage, /getStoreSaleDisplayName/i);
  assert.match(detailPage, /Venta \{sale\.order_number\}/i);
  assert.match(detailPage, /sale\.order_items\.map/i);
});
