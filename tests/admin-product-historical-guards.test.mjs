// Historical and superseded identities: consultable read-only, never presented or accepted as operational.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { YARA_ROSA } from "../lib/products/yara-rosa-consolidation.ts";
import { adminProductAvailability } from "../lib/products/product-availability.ts";

const require = createRequire(import.meta.url);
const noop = new Proxy({}, { get: (_, key) => (key === "__esModule" ? false : () => undefined) });
function load(file, modules) {
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL("../" + file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", output)((name) => (Object.hasOwn(modules, name) ? modules[name] : name.startsWith("@/") ? noop : require(name)), exports);
  return exports;
}

function recordingQuery(calls, result) {
  const query = new Proxy({}, {
    get: (_, method) => method === "then"
      ? (resolve) => resolve(result)
      : (...args) => { calls.push([method, ...args]); return query; },
  });
  return query;
}

async function listCalls(filters) {
  const calls = [];
  const admin = load("services/admin.ts", {
    "@/lib/supabase/server": { getSupabaseAdminClient: () => ({ from: () => recordingQuery(calls, { data: [], error: null, count: 0 }) }) },
    "@/lib/products/yara-rosa-consolidation": { YARA_ROSA },
  });
  const result = await admin.getAdminProducts(filters);
  assert.equal(result.error, null);
  return calls;
}

test("the historical list includes the superseded Yara Rosa identity; the operational list keeps excluding it", async () => {
  const historical = await listCalls({ historical: true });
  assert.ok(historical.some(([method, value]) => method === "or" && value === `historical_identity.eq.true,id.eq.${YARA_ROSA.archivedId}`));
  assert.ok(!historical.some(([method, column]) => method === "neq" && column === "id"));

  const operational = await listCalls({});
  assert.ok(operational.some(([method, column, value]) => method === "eq" && column === "historical_identity" && value === false));
  assert.ok(operational.some(([method, column, value]) => method === "neq" && column === "id" && value === YARA_ROSA.archivedId));
  assert.ok(!operational.some(([method]) => method === "or"));
});

test("the superseded Yara Rosa identity is read-only and never enabled for a new sale", () => {
  const availability = adminProductAvailability({
    id: YARA_ROSA.archivedId, slug: YARA_ROSA.archivedSlug, status: "archived", stock: 0,
    web_visible: false, commercial_blocked: false, historical_identity: false, categories: { slug: "perfumes", is_active: true },
  });
  assert.equal(availability.historical, true);
  assert.equal(availability.newSale.allowed, false);
});

test("an unknown historical identity is never presented as editable or enabled (fail-closed)", () => {
  for (const historical_identity of [undefined, null]) {
    const availability = adminProductAvailability({
      id: "unknown", slug: "unknown", status: "active", stock: 2, web_visible: true, commercial_blocked: false,
      historical_identity, categories: { slug: "mates", is_active: true },
    });
    assert.equal(availability.historical, true);
    assert.equal(availability.newSale.allowed, false);
    assert.equal(availability.web.visible, false);
  }
});

test("the editor reads the historical column of the product it shows", () => {
  const admin = readFileSync(new URL("../services/admin.ts", import.meta.url), "utf8");
  const editor = admin.slice(admin.indexOf("export async function getAdminProductById"), admin.indexOf("export async function getAdminDashboardData"));
  assert.match(editor, /^\s*historical_identity,\s*$/m);
});

async function featuredAttempt(row) {
  const writes = [];
  const actions = load("app/admin/productos/actions.ts", {
    "@/lib/admin-session": { requireAdminActionSession: async () => ({}) },
    "@/lib/products/yara-rosa-consolidation": { isSupersededYaraRosa: (p) => p.id === YARA_ROSA.archivedId },
    "@/lib/supabase/server": {
      getSupabaseAdminClient: () => ({
        from: () => {
          const query = {
            select: () => query, eq: () => query,
            maybeSingle: async () => ({ data: row, error: null }),
            update: (patch) => { writes.push(patch); return query; },
          };
          return query;
        },
      }),
    },
  });
  const form = new FormData();
  form.set("productId", row.id);
  form.set("featured", "true");
  await assert.rejects(actions.toggleProductFeatured(form));
  return writes;
}

test("server actions reject historical, unknown and superseded identities before any write", async () => {
  const base = { slug: "x", status: "active", category_id: "c", cost: null, cost_source_purchase_item_id: null, family_id: null };
  for (const row of [
    { ...base, id: "historical", historical_identity: true },
    { ...base, id: "unknown", historical_identity: null },
    { ...base, id: YARA_ROSA.archivedId, historical_identity: false },
  ]) {
    assert.deepEqual(await featuredAttempt(row), [], row.id);
  }
});

test("every product mutation goes through the operational guard", () => {
  const actions = readFileSync(new URL("../app/admin/productos/actions.ts", import.meta.url), "utf8");
  for (const name of ["archiveProduct", "toggleProductFeatured", "updateProductStock", "setPrimaryProductImage", "moveProductImage", "deleteProductImage"]) {
    const start = actions.indexOf(`export async function ${name}`);
    const next = actions.indexOf("export ", start + 10);
    assert.match(actions.slice(start, next === -1 ? undefined : next), /assertOperationalProduct\(productId\)/, name);
  }
  assert.match(actions, /operationType === "update_product" \? await assertOperationalProduct\(productId\)/);
});
