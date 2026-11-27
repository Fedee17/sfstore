import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalHistoricalSlug,
  internalInventorySlug,
  isInternalInventory,
  parseCompletedSale,
} from "../lib/admin/internal-inventory.ts";

test("las dos fichas históricas de Ignite apuntan a un único inventario operativo", () => {
  assert.equal(canonicalHistoricalSlug("historical-ignite-v151"), "historical-ignite-v150");
  assert.equal(internalInventorySlug("historical-ignite-v151"), internalInventorySlug("historical-ignite-v150"));
});

test("el inventario interno exige los tres controles comerciales y nunca usa una ficha histórica", () => {
  const draft = { slug: "inventario-interno-producto", status: "draft", historical_identity: false, web_visible: false, commercial_blocked: true };
  assert.equal(isInternalInventory(draft), true);
  for (const change of [{ status: "active" }, { historical_identity: true }, { web_visible: true }, { commercial_blocked: false }, { slug: "otro" }]) {
    assert.equal(isInternalInventory({ ...draft, ...change }), false);
  }
});

test("la venta asentada respeta el total original y valida fecha, cantidad y operación", () => {
  const data = new FormData();
  const request = "f9ba0fc4-4b13-4406-9d7e-2afd6c54f5dc";
  Object.entries({ request, date: "2026-11-26", quantity: "3", total: "100,00" }).forEach(([key, value]) => data.set(key, value));
  assert.deepEqual(parseCompletedSale(data, "2026-11-27"), {
    request, date: "2026-11-26", quantity: 3, total: 100, unitPrice: 33.33,
  });
  for (const [key, invalid] of [["date", "2026-11-31"], ["date", "2026-11-28"], ["quantity", "1.5"], ["total", "1.234"], ["total", "0"], ["request", "123"]]) {
    const original = data.get(key);
    data.set(key, invalid);
    assert.throws(() => parseCompletedSale(data, "2026-11-27"));
    data.set(key, original);
  }
});
