import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { stockAdjustmentHref } from "../lib/admin/catalog-review.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("stock adjustment is one tap away from the editor and from availability", () => {
  assert.equal(
    stockAdjustmentHref({ id: "p1", slug: "mate algarrobo" }),
    "/admin/productos?search=mate%20algarrobo&status=all&view=details#producto-p1",
  );
  assert.match(source("components/admin/products/product-form.tsx"), /href=\{stockAdjustmentHref\(product\)\}[\s\S]{0,200}Ajustar stock/);
  assert.match(source("components/admin/inventory-availability.tsx"), /href=\{stockAdjustmentHref\(product\)\}>Ajustar stock/);
});

test("the products list hides archived rows by default and still offers them", () => {
  const page = source("app/admin/productos/page.tsx");
  assert.match(page, /excludeArchived: selectedFilters\.status === "" \|\| undefined/);
  assert.match(page, /<option value="">Activos y borradores<\/option>/);
  assert.match(page, /<option value="all">Todos \(incluye archivados\)<\/option>/);
  const service = source("services/admin.ts");
  assert.match(service, /\} else if \(filters\.excludeArchived\) \{\s*query = query\.neq\("status", "archived"\);/);
  assert.match(service, /lte\("stock", LOW_STOCK_LIMIT\)/);
});

test("customer orders suggest the same cash price as the web and reuse the sale search", () => {
  const form = source("components/admin/orders/customer-order-form.tsx");
  assert.match(form, /return getEffectiveCashPrice\(product\);/);
  assert.match(form, /matchesStoreSaleProduct\(product, query\)/);
  assert.doesNotMatch(form, /function normalize\(/);
  assert.match(source("services/customer-orders.ts"), /price, transfer_price, cash_price_approved_at, stock/);
});

test("admin errors land on an admin page with retry and a way back", () => {
  assert.ok(existsSync(new URL("../app/admin/error.tsx", import.meta.url)));
  const page = source("app/admin/error.tsx");
  assert.match(page, /^"use client";/);
  assert.match(page, /onClick=\{\(\) => retry\(\)\}/);
  assert.match(page, /href="\/admin\/productos"/);
});

test("unused legacy admin readers are gone", () => {
  const service = source("services/admin.ts");
  for (const name of ["getAdminAnalyticsData", "getAdminOrders", "AdminAnalyticsData", "isRealSale", "normalizeAdminOrder"]) {
    assert.doesNotMatch(service, new RegExp(`\\b${name}\\b`), name);
  }
});
