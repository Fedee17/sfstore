import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../services/checkout-order-read.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture({ user = null, authorize, authError = false, queryError = false, missing = false } = {}) {
  const calls = [], exports = {};
  const order = { id: "synthetic-order", order_number: "FIXTURE", total: 100, payment_method: "transfer" };
  const query = {
    select: fields => { calls.push(["select", fields]); return query; },
    eq: (field, value) => { calls.push(["eq", field, value]); return query; },
    maybeSingle: async () => ({ data: missing ? null : order, error: queryError ? Error("fixture") : null }),
  };
  const modules = {
    "server-only": {},
    "@/lib/admin-session": { getAdminUser: async () => {
      calls.push(["authorize"]); if (authError) throw Error("fixture auth unavailable"); return authorize ? authorize() : user;
    } },
    "@/lib/supabase/server": { getSupabaseAdminClient: () => {
      calls.push(["service-client"]); return { from: table => { calls.push(["from", table]); return query; } };
    } },
  };
  new Function("require", "exports", compiled)(name => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`); return modules[name];
  }, exports);
  return { read: exports.getCheckoutSuccessOrder, calls, order };
}
test("anonymous or rejected session never creates a service-role client or reads an order", async () => {
  const f = fixture(); assert.equal(await f.read("synthetic-order"), null);
  assert.deepEqual(f.calls, [["authorize"]]);
});
test("authorization outage fails closed before private order lookup", async () => {
  const f = fixture({ authError: true }); assert.equal(await f.read("synthetic-order"), null);
  assert.deepEqual(f.calls, [["authorize"]]);
});
test("allowlisted admin can read only the existing receipt projection after authorization", async () => {
  const f = fixture({ user: { id: "synthetic-admin" } });
  assert.deepEqual(await f.read("synthetic-order"), f.order);
  assert.deepEqual(f.calls, [["authorize"], ["service-client"], ["from", "orders"],
    ["select", "id, order_number, total, payment_method"], ["eq", "id", "synthetic-order"]]);
});
test("missing identifier, absent order and query failure disclose no private data", async () => {
  const empty = fixture(); assert.equal(await empty.read(""), null); assert.deepEqual(empty.calls, []);
  for (const options of [{ missing: true }, { queryError: true }]) {
    assert.equal(await fixture({ ...options, user: { id: "synthetic-admin" } }).read("synthetic-order"), null);
  }
});
test("public checkout client graph no longer imports the admin reader", () => {
  const clientService = readFileSync(new URL("../services/orders.ts", import.meta.url), "utf8");
  assert.doesNotMatch(clientService, /getSupabaseAdminClient|getCheckoutSuccessOrder/);
  assert.match(source, /import "server-only"/);
  assert.match(readFileSync(new URL("../lib/supabase/server.ts", import.meta.url), "utf8"), /import "server-only"/);
});
test("actual Supabase getUser plus allowlist guard protects the private order reader", async () => {
  function load(file, modules, environment) {
    const exports = {};
    const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("require", "exports", "process", compiled)(name => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`); return modules[name];
    }, exports, { env: environment });
    return exports;
  }
  const authorization = load("../lib/admin-authorization.ts", {}, {});
  for (const [user, error, allowlist, allowed] of [
    [null, null, "owner@example.invalid", false],
    [{ email: "other@example.invalid" }, null, "owner@example.invalid", false],
    [{ email: "owner@example.invalid" }, null, "", false],
    [{ email: "owner@example.invalid" }, { message: "fixture" }, "owner@example.invalid", false],
    [{ email: "Owner@Example.Invalid" }, null, "owner@example.invalid", true],
  ]) {
    let verifiedCalls = 0;
    const session = load("../lib/admin-session.ts", {
      "next/navigation": { redirect: () => { throw Error("Unexpected redirect"); } },
      "@/lib/admin-authorization": authorization,
      "@/lib/supabase/auth-server": { getSupabaseAuthServerClient: async () => ({ auth: {
        getUser: async () => { verifiedCalls++; return { data: { user }, error }; }
      } }) },
    }, { ADMIN_ALLOWED_EMAILS: allowlist });
    const f = fixture({ authorize: session.getAdminUser });
    assert.deepEqual(await f.read("synthetic-order"), allowed ? f.order : null);
    assert.equal(verifiedCalls, 1);
    assert.equal(f.calls.some(([event]) => event === "service-client"), allowed);
  }
});
