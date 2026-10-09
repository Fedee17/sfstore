import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const playwrightPath = process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE;
const require = createRequire(import.meta.url);
function browserBundle() {
  const modules = {};
  for (const [name, file] of [
    ["react", "react.development.js"], ["react/jsx-runtime", "react-jsx-runtime.development.js"],
    ["react-dom", "react-dom.development.js"], ["react-dom/client", "react-dom-client.development.js"],
    ["scheduler", "scheduler.development.js"],
  ]) {
    const pkg = name.split("/")[0];
    modules[name] = readFileSync(join(dirname(require.resolve(pkg)), "cjs", file), "utf8");
  }
  for (const [name, path] of [
    ["form", "../components/admin/products/product-form.tsx"],
    ["@/lib/catalog/attribute-config", "../lib/catalog/attribute-config.ts"],
    ["@/lib/product-taxonomy", "../lib/product-taxonomy.ts"],
    ["@/lib/products/product-image-files", "../lib/products/product-image-files.ts"],
  ]) {
    modules[name] = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
  }
  return `
    const process = { env: { NODE_ENV: 'development' } };
    const factories = { ${Object.entries(modules).map(([name, source]) => `${JSON.stringify(name)}: (module, exports, require) => { ${source}\n }`).join(",\n")} };
    const cache = {};
    const mocks = {
      'next/image': { default: (p) => require('react').createElement('img', { src: p.src, alt: p.alt }) },
      'next/link': { default: (p) => require('react').createElement('a', { href: p.href }, p.children) },
      'next/navigation': { useRouter: () => router },
      'browser-image-compression': { default: async () => new Blob(['RIFF0000WEBPtest'], {type: 'image/webp'}) },
      'heic-normalize': { isHeicFile: async (f) => /heic$/.test(f.name), normalizeHeicFile: async (f) => {
        window.heicConversions++; return new File(['jpeg'], f.name, {type: 'image/jpeg'});
      } },
      '@/app/admin/productos/actions': {},
      '@/components/admin/pending-submit-button': { PendingSubmitButton: (p) => require('react').createElement('button', {type: 'submit', disabled: p.disabled}, p.children) }
    };
    for (const mock of Object.values(mocks)) mock.__esModule = true;
    function require(name) {
      if (mocks[name]) return mocks[name];
      if (!cache[name]) { const m = {exports: {}}; cache[name] = m; if (!factories[name]) throw Error('Missing module ' + name); factories[name](m, m.exports, require); }
      return cache[name].exports;
    }
    const router = {refresh: () => window.refreshes++, replace: (url) => window.replaced = url};
    window.requests = []; window.refreshes = 0; window.heicConversions = 0;
    window.response = null;
    window.finish = (result) => window.resolveAction(result);
    const root = require('react-dom/client').createRoot(document.getElementById('root'));
    window.mount = (editing = true) => root.render(require('react').createElement(require('form').ProductForm, {
      key: String(editing), submitLabel: 'Guardar', categories: [{id: 'cat', name: 'Perfumes', slug: 'perfumes', is_active: true}],
      product: editing ? {id: '00000000-0000-4000-8000-000000000001', category_id: 'cat', name: 'Original', slug: 'original', status: 'active', price: 100, stock: 0, featured: false, save_version: 'a'.repeat(64), product_images: []} : undefined,
      action: async (_previous, data) => {
        window.requests.push([...data].map(([k,v]) => [k, typeof v === 'string' ? v : {name: v.name, size: v.size, type: v.type}]));
        if (window.response) return window.response;
        return new Promise((resolve) => window.resolveAction = resolve);
      }
    }));
    window.mount();
  `;
}

test("real React form: HEIC success, lost-response retry, double submit, new version and stale edit", { skip: !playwrightPath }, async () => {
  const { chromium } = require(playwrightPath);
  const bundle = browserBundle();
  const server = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(`<div id="root"></div><script>${bundle}</script>`); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.SFSTORE_TEST_BROWSER_CHANNEL });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('input[name="name"]').fill("Producto editado");
    await page.locator('input[name="productImages"]').setInputFiles({ name: "iphone.heic", mimeType: "image/heic", buffer: Buffer.from("fixture") });
    await page.getByText("Nuevas imagenes", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForFunction(() => window.requests.length === 1);
    assert.equal(await page.getByRole("button", { name: "Subiendo imagenes...", exact: true }).isDisabled(), true);
    await page.evaluate(() => document.querySelector('form').requestSubmit());
    assert.equal(await page.evaluate(() => window.requests.length), 1);
    await page.evaluate(() => window.finish({status: 'error', retryMode: 'retry', message: 'Reintentar'}));
    await page.getByRole("button", { name: "Reintentar guardado", exact: true }).waitFor();
    assert.equal(await page.locator('input[name="name"]').isDisabled(), true);
    assert.equal(await page.locator('input[name="name"]').inputValue(), "Producto editado");
    const success = { status: "success", submissionId: "one", productId: "00000000-0000-4000-8000-000000000001", version: "b".repeat(64), message: "Guardado", persistedProduct: {status: "active"} };
    await page.evaluate((value) => { window.response = value; }, success);
    await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
    await page.waitForFunction(() => window.refreshes === 1);
    const requests = await page.evaluate(() => window.requests);
    assert.deepEqual(requests[0], requests[1]);
    assert.equal(await page.locator('input[name="productImages"]').evaluate((el) => el.files.length), 0);
    assert.equal(await page.getByText("Nuevas imagenes", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Guardar", exact: true }).isEnabled(), true);
    assert.equal(await page.evaluate(() => window.heicConversions), 1);
    await page.locator('input[name="name"]').fill("Otro cambio");
    await page.locator('input[name="productImages"]').setInputFiles({ name: "second.png", mimeType: "image/png", buffer: Buffer.from("fixture2") });
    await page.getByText("Nuevas imagenes", { exact: true }).waitFor();
    assert.equal(await page.locator('input[name="name"]').inputValue(), "Otro cambio");
    await page.evaluate(() => { window.response = null; });
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForFunction(() => window.requests.length === 3);
    const third = new Map(await page.evaluate(() => window.requests[2]));
    assert.notEqual(third.get("operationKey"), new Map(requests[0]).get("operationKey"));
    assert.equal(third.get("expectedVersion"), "b".repeat(64));
    await page.evaluate(() => window.finish({ status: 'error', retryMode: 'reload', message: 'Version obsoleta' }));
    await page.getByRole("button", { name: "Recargar producto", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Guardar", exact: true }).isDisabled(), true);
    await page.evaluate(() => { window.response = null; window.mount(false); });
    await page.locator('input[name="name"]').fill("Nuevo producto");
    await page.locator('select[name="categoryId"]').selectOption("cat");
    await page.locator('input[name="price"]').fill("100");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForFunction(() => window.requests.length === 4);
    await page.evaluate(() => window.finish({ status: 'error', retryMode: 'retry', message: 'Reintentar' }));
    await page.getByRole("button", { name: "Reintentar guardado", exact: true }).waitFor();
    await page.evaluate((value) => { window.response = value; }, { ...success, submissionId: "two" });
    await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
    await page.waitForFunction(() => Boolean(window.replaced));
    const creates = await page.evaluate(() => window.requests.slice(3));
    assert.deepEqual(creates[0], creates[1]);
    assert.match(new Map(creates[0]).get("productId"), /^[0-9a-f-]{36}$/);
    assert.equal(new Map(creates[0]).has("expectedVersion"), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
