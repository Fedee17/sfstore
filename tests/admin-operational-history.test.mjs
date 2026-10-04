import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");

const adminService = source("services", "admin.ts");
const purchaseService = source("services", "purchases.ts");
const salesService = source("services", "store-sales.ts");
const supplierService = source("services", "suppliers.ts");
const historicalMigration = source(
  "supabase",
  "migrations",
  "202609300001_historical_import_foundation.sql",
);

function functionBlock(contents, name, nextName) {
  const start = contents.indexOf(`function ${name}`);
  const end = nextName ? contents.indexOf(`function ${nextName}`, start) : contents.length;
  assert.notEqual(start, -1, `${name} debe existir`);
  return contents.slice(start, end === -1 ? contents.length : end);
}

function operational(records) {
  return records.filter((record) => record.historical_import === false);
}

const orderFixtures = [
  { id: "operational-order", historical_import: false, total: 100 },
  { id: "historical-order", historical_import: true, total: 900 },
];

const purchaseFixtures = [
  { id: "operational-purchase", historical_import: false, total_cost: 40 },
  { id: "historical-purchase", historical_import: true, total_cost: 600 },
];

test("dashboard and analytics load only operational orders", () => {
  const getAdminOrders = functionBlock(adminService, "getAdminOrders", "getAdminDashboardData");
  assert.match(getAdminOrders, /\.from\("orders"\)[\s\S]+\.eq\("historical_import", false\)/);
  assert.match(adminService, /getAdminDashboardData[\s\S]+getAdminOrders\(\)/);
  assert.match(adminService, /getAdminAnalyticsData[\s\S]+getAdminOrders\(\)/);

  const orders = operational(orderFixtures);
  assert.equal(orders.length, 1);
  assert.equal(orders.reduce((total, order) => total + order.total, 0), 100);
  assert.equal(orders.reduce((total, order) => total + order.total, 0) / orders.length, 100);
});

test("the normal purchases list and supplier KPIs exclude historical purchases", () => {
  const listPurchases = functionBlock(purchaseService, "listPurchases", "getPurchaseById");
  const supplierSummary = functionBlock(supplierService, "getSupplierPurchaseSummary", "createSupplier");
  assert.match(listPurchases, /\.from\("purchases"\)[\s\S]+\.eq\("historical_import", false\)/);
  assert.match(supplierSummary, /\.from\("purchases"\)[\s\S]+\.eq\("historical_import", false\)/);

  const purchases = operational(purchaseFixtures);
  assert.deepEqual(purchases.map((purchase) => purchase.id), ["operational-purchase"]);
  assert.equal(purchases.reduce((total, purchase) => total + purchase.total_cost, 0), 40);
});

test("the normal sales list explicitly excludes historical orders", () => {
  const listStoreSales = functionBlock(salesService, "listStoreSales", "getStoreSaleById");
  assert.match(listStoreSales, /\.from\("orders"\)[\s\S]+\.eq\("historical_import", false\)/);
  assert.deepEqual(operational(orderFixtures).map((order) => order.id), ["operational-order"]);
});

test("historical purchase records remain available by direct id", () => {
  const getPurchaseById = functionBlock(purchaseService, "getPurchaseById", "savePurchaseDraft");
  assert.match(getPurchaseById, /\.from\("purchases"\)[\s\S]+\.eq\("id", purchaseId\)/);
  assert.doesNotMatch(getPurchaseById, /\.eq\("historical_import", false\)/);
});

test("historical records stay preserved and immutable", () => {
  assert.match(historicalMigration, /create table historical_import_records/i);
  assert.match(historicalMigration, /HISTORICAL_ORDER_IMMUTABLE/);
  assert.match(historicalMigration, /HISTORICAL_PURCHASE_IMMUTABLE/);
  for (const service of [adminService, purchaseService, salesService, supplierService]) {
    assert.doesNotMatch(service, /\.delete\(\)[\s\S]+historical_import/);
  }
});
