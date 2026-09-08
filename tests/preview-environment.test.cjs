const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const { NextRequest } = require("next/server");

function load(file, env, dependency = require) {
  const source = readFileSync(path.join(__dirname, "..", file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: dependency, process: { env } });
  return exports;
}

test("Preview bloquea APIs, admin, checkout y Server Actions antes del handler", () => {
  const { proxy } = load("proxy.ts", { VERCEL_ENV: "preview" });
  for (const pathname of ["/admin", "/admin/login", "/checkout", "/checkout/exito", "/api/integrations/google-sheets/product-sync", "/api/mercadopago/webhook", "/api/mercadopago/create-preference"]) {
    for (const method of ["GET", "POST"]) {
      assert.equal(proxy(new NextRequest(`https://preview.example${pathname}`, { method })).status, 403);
    }
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal(proxy(new NextRequest("https://preview.example/perfumes", { method })).status, 403);
  }
});

test("Preview permite navegacion, assets y carrito local sin indexacion", () => {
  const { proxy } = load("proxy.ts", { VERCEL_ENV: "preview" });
  for (const pathname of ["/", "/perfumes", "/mates", "/producto/lattafa-asad", "/carrito", "/_next/static/app.js", "/logo-sfstore-horizontal.png"]) {
    const response = proxy(new NextRequest(`https://preview.example${pathname}`));
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  }
});

test("Production y Development no cambian el enrutamiento", () => {
  for (const VERCEL_ENV of ["production", "development", undefined]) {
    const { proxy } = load("proxy.ts", { VERCEL_ENV });
    for (const pathname of ["/admin", "/checkout", "/api/integrations/google-sheets/product-sync"]) {
      const response = proxy(new NextRequest(`https://site.example${pathname}`, { method: "POST" }));
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("x-robots-tag"), null);
    }
  }
});

test("Los clientes Preview rechazan credenciales antes de contactar Supabase", async () => {
  const env = { VERCEL_ENV: "preview", NEXT_PUBLIC_PREVIEW_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: "https://unused.example", NEXT_PUBLIC_SUPABASE_ANON_KEY: "unused", SUPABASE_SERVICE_ROLE_KEY: "unused" };
  const unexpected = () => { throw new Error("Se intento contactar un servicio"); };
  const dependency = () => ({ createClient: unexpected, createServerClient: unexpected, cookies: unexpected });
  assert.throws(() => load("lib/supabase/client.ts", env, dependency).getSupabaseClient(), /Preview/);
  assert.throws(() => load("lib/supabase/server.ts", env, dependency).getSupabaseAdminClient(), /Preview/);
  await assert.rejects(() => load("lib/supabase/auth-server.ts", env, dependency).getSupabaseAuthServerClient(), /Preview/);
});

test("URL Preview deriva del deployment y Production conserva su variable", () => {
  const preview = load("next.config.ts", { VERCEL_ENV: "preview", VERCEL_URL: "branch.vercel.app", NEXT_PUBLIC_SITE_URL: "https://production.example" }).default;
  assert.equal(preview.env.NEXT_PUBLIC_PREVIEW_MODE, "true");
  assert.equal(preview.env.NEXT_PUBLIC_SITE_URL, "https://branch.vercel.app");
  const production = load("next.config.ts", { VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://production.example" }).default;
  assert.equal(production.env.NEXT_PUBLIC_PREVIEW_MODE, "false");
  assert.equal(Object.hasOwn(production.env, "NEXT_PUBLIC_SITE_URL"), false);
});
