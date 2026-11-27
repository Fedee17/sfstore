// Renders the real admin product list with synthetic rows: what an admin actually sees for each dimension.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as availabilityRule from "../lib/products/product-availability.ts";
import * as prices from "../lib/web-transfer-pricing.ts";

const require = createRequire(import.meta.url);
function load(file, modules = {}) {
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL("../" + file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", output)((name) => (Object.hasOwn(modules, name) ? modules[name] : require(name)), exports);
  return exports;
}

const h = React.createElement;
const children = ({ children: content }) => h(React.Fragment, null, content);
const summary = load("components/admin/products/product-availability-summary.tsx");
const category = { name: "Mates", slug: "mates", is_active: true };
const product = (id, extra) => ({
  id, name: `Producto ${id}`, slug: id, sku: `SKU-${id}`, status: "active", price: 10000, transfer_price: null, cost: 5000, stock: 2,
  featured: false, web_visible: true, commercial_blocked: false, historical_identity: false, categories: category, product_images: [], ...extra,
});
const operational = [
  product("habilitado"),
  product("bloqueado", { commercial_blocked: true }),
  product("borrador-oculto", { status: "draft", web_visible: false, stock: 0 }),
  { ...product("combo-cc"), component_offer: true, name: "Cargador combo" },
];
const historical = [product("historico", { historical_identity: true, status: "archived" })];

function renderPage(params) {
  const calls = [];
  const { default: Page } = load("app/admin/productos/page.tsx", {
    "@/components/admin/admin-nav": { AdminNav: () => null },
    "@/lib/web-transfer-pricing": prices,
    "next/link": { __esModule: true, default: ({ href, children: content, ...rest }) => h("a", { href, ...rest }, content) },
    "@/lib/admin/catalog-review": { catalogIssues: () => [], LOW_STOCK_LIMIT: 3 },
    "@/components/admin/get-navigation-form": { GetNavigationForm: ({ children: content }) => h("form", null, content), GetNavigationSubmitButton: children },
    "@/components/admin/pending-submit-button": { PendingSubmitButton: ({ children: content }) => h("button", null, content) },
    "@/components/admin/products/inventory-adjustment-form": { InventoryAdjustmentForm: ({ productId }) => h("i", null, `AJUSTE:${productId}`) },
    "@/components/admin/products/product-availability-summary": summary,
    "@/lib/products/product-availability": availabilityRule,
    "@/lib/admin-session": { requireAdminSession: async () => ({}) },
    "@/services/admin": {
      getAdminProductPublications: async (filters) => { calls.push(filters); return { data: filters.historical ? historical : operational, error: null }; },
      getAdminCategories: async () => ({ data: [], error: null }),
    },
    "./actions": { archiveProduct: () => {}, toggleProductFeatured: () => {} },
  });
  return Page({ searchParams: Promise.resolve(params) }).then((element) => ({ html: renderToStaticMarkup(element), calls }));
}

const rendered = (html, id) => html.includes(`Producto ${id}`);

test("each row explains its status, web visibility and new-sale availability with its reasons", async () => {
  const { html, calls } = await renderPage({});
  assert.equal(calls[0].historical, undefined);
  assert.match(html, /Venta nueva:<\/span> <span[^>]*>Habilitada/);
  assert.match(html, /Bloqueado para nuevas ventas/);
  assert.match(html, /Borrador/);
  assert.match(html, /En borrador · Sin stock/);
  assert.match(html, /Oculto en la web/);
  for (const id of ["habilitado", "bloqueado", "borrador-oculto"]) assert.match(html, new RegExp(`/admin/productos/${id}/editar`));
  // A component combo keeps its row, without a single-product availability that would misstate its rules.
  assert.ok(html.includes("Cargador combo"));
  assert.equal((html.match(/Venta nueva:/g) ?? []).length, 3);
});

test("the availability filter separates enabled, not enabled and hidden products", async () => {
  const sellable = (await renderPage({ availability: "sellable" })).html;
  assert.deepEqual(["habilitado", "bloqueado", "borrador-oculto"].map((id) => rendered(sellable, id)), [true, false, false]);
  assert.equal(sellable.includes("Cargador combo"), false);

  const unavailable = (await renderPage({ availability: "unavailable" })).html;
  assert.deepEqual(["habilitado", "bloqueado", "borrador-oculto"].map((id) => rendered(unavailable, id)), [false, true, true]);

  const hidden = (await renderPage({ availability: "hidden" })).html;
  assert.deepEqual(["habilitado", "bloqueado", "borrador-oculto"].map((id) => rendered(hidden, id)), [false, true, true]);

  const unknown = await renderPage({ availability: "todo" });
  assert.equal(unknown.calls[0].historical, undefined);
  assert.ok(rendered(unknown.html, "habilitado"));
});

test("historical identities can be consulted read-only, without edit, stock, featured or archive actions", async () => {
  for (const view of ["", "details"]) {
    const { html, calls } = await renderPage({ availability: "historical", view });
    assert.equal(calls[0].historical, true);
    assert.ok(rendered(html, "historico"));
    assert.match(html, /Identidad histórica/);
    assert.doesNotMatch(html, /\/admin\/productos\/historico\/editar/);
    assert.doesNotMatch(html, /AJUSTE:historico|Archivar|Destacar/);
  }
});

test("the details view keeps the operational actions for operational products", async () => {
  const { html } = await renderPage({ view: "details" });
  assert.match(html, /AJUSTE:habilitado/);
  assert.match(html, /Archivar/);
  assert.match(html, /Venta nueva:/);
});
