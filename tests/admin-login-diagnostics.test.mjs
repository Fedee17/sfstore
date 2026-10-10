import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/admin/login/actions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function runLogin({ error = null, user = { email: "owner@example.test" }, allowed = true, configured = true, empty = false } = {}) {
  const logs = [];
  const calls = [];
  const exports = {};
  const fixturePassword = "synthetic-password-never-log";
  const fixtureToken = "synthetic-session-token-never-log";
  const supabase = { auth: {
    signInWithPassword: async (input) => {
      calls.push(["signIn", input]);
      return { data: { user, session: { access_token: fixtureToken } }, error };
    },
    signOut: async () => { calls.push(["signOut"]); },
  } };
  const modules = {
    "next/navigation": { redirect: (url) => { throw { redirect: url }; } },
    "@/lib/admin-session": { isAllowedAdminUser: (actual) => { calls.push(["allowlist", actual]); return allowed; } },
    "@/lib/supabase/auth-server": { getSupabaseAuthServerClient: async () => supabase },
  };
  new Function("require", "exports", compiled)((name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency ${name}`);
    return modules[name];
  }, exports);
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "ADMIN_ALLOWED_EMAILS"];
  const previousEnv = keys.map((key) => process.env[key]);
  const previousConsole = { info: console.info, warn: console.warn, error: console.error };
  try {
    process.env.ADMIN_ALLOWED_EMAILS = "owner@example.test,private-allowlist@example.test";
    if (configured) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.example.test";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-anon-never-log";
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
    for (const level of Object.keys(previousConsole)) console[level] = (...args) => logs.push([level, ...args]);
    const form = new FormData();
    form.set("email", empty ? "" : " Owner@Example.Test ");
    form.set("password", empty ? "" : fixturePassword);
    let destination;
    try { await exports.loginAdmin(form); } catch (result) {
      if (!result.redirect) throw result;
      destination = result.redirect;
    }
    assert.ok(destination, "login must redirect");
    const serialized = JSON.stringify(logs);
    for (const secret of ["owner@example.test", "private-allowlist@example.test", fixturePassword, fixtureToken, "synthetic-anon-never-log", "synthetic.example.test", "private-error@example.test"]) {
      assert.ok(!serialized.toLowerCase().includes(secret), `Diagnostics leaked fixture ${secret}`);
    }
    return { logs, calls, destination };
  } finally {
    keys.forEach((key, i) => { if (previousEnv[i] === undefined) delete process.env[key]; else process.env[key] = previousEnv[i]; });
    Object.assign(console, previousConsole);
  }
}

test("successful login preserves normalized credentials and redirect without personal diagnostics", async () => {
  const result = await runLogin();
  assert.equal(result.destination, "/admin");
  assert.deepEqual(result.calls.map(([name]) => name), ["signIn", "allowlist"]);
  assert.equal(result.calls[0][1].email, "owner@example.test");
  assert.equal(result.logs.length, 1);
});

test("unauthorized authenticated login still signs out and redirects without allowlist/email logs", async () => {
  const result = await runLogin({ allowed: false });
  assert.match(decodeURIComponent(result.destination), /ADMIN_ALLOWED_EMAILS/);
  assert.deepEqual(result.calls.map(([name]) => name), ["signIn", "allowlist", "signOut"]);
});

test("auth failure preserves public error and safe diagnostic code/status", async () => {
  const result = await runLogin({ error: { code: "invalid_credentials", status: 400, name: "private-error@example.test", message: "private-error@example.test" } });
  assert.match(decodeURIComponent(result.destination), /Email o contraseña incorrectos/);
  assert.deepEqual(result.logs[0][2], { code: "invalid_credentials", status: 400 });
  assert.deepEqual(result.calls.map(([name]) => name), ["signIn"]);
});

test("unexpected upstream code and error message cannot leak through diagnostics", async () => {
  const result = await runLogin({ error: { code: "private-error@example.test", status: 503, message: "private-error@example.test" } });
  assert.deepEqual(result.logs[0][2], { code: "other_auth_error", status: 503 });
});

test("missing environment stops before auth and logs only configuration flags", async () => {
  const result = await runLogin({ configured: false });
  assert.equal(result.calls.length, 0);
  assert.match(decodeURIComponent(result.destination), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.equal(result.logs[0][2].missingUrl, true);
});

test("missing user retains error redirect and diagnostic without personal data", async () => {
  const result = await runLogin({ user: null });
  assert.match(decodeURIComponent(result.destination), /no devolvió un usuario/);
  assert.deepEqual(result.calls.map(([name]) => name), ["signIn"]);
});

test("empty form still redirects before auth without debug logs", async () => {
  const result = await runLogin({ empty: true });
  assert.deepEqual(result.logs, []);
  assert.deepEqual(result.calls, []);
  assert.match(decodeURIComponent(result.destination), /Ingresa email y contraseña/);
});
