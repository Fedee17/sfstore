import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { getWebTransferPrice, getWebTransferSubtotal } from "../lib/web-transfer-pricing.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function url(code) {
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64")}`;
}
const service = await import(url(source("services/products.ts")
  .replace("@/lib/products/component-publications", new URL("../lib/products/component-publications.ts", import.meta.url).href)
  .replace("@/lib/products/component-combos", new URL("../lib/products/component-combos.ts", import.meta.url).href)
  .replace("@/lib/products/public-families", url(source("lib/products/public-families.ts")))
  .replace("@/lib/web-transfer-pricing", url(source("lib/web-transfer-pricing.ts")))
  .replace("@/data/products", url(source("data/products.ts")))
  .replace("@/lib/catalog/public-product-visibility", url(source("lib/catalog/public-product-visibility.ts")))
  .replace("@/lib/products/yara-rosa-consolidation", url(source("lib/products/yara-rosa-consolidation.ts")))
  .replace("@/lib/supabase/client", url("export const getSupabaseClient = () => globalThis.__commercialCatalogClient;"))));
function client(rows,error=null) {
 return {from(){let selected=rows.map(p=>({...p,category_slug:p.categories?.slug}));
  const q={select:()=>q,eq:(k,v)=>{selected=selected.filter(p=>p[k]===v);return q;},neq:(k,v)=>{selected=selected.filter(p=>p[k]!==v);return q;},
   gt:(k,v)=>{selected=selected.filter(p=>p[k]>v);return q;},order:()=>q,limit:()=>q,
   then:(resolve,reject)=>Promise.resolve({data:selected,error}).then(resolve,reject)};return q;}};
}

const row = { id: "synthetic", name: "Synthetic", slug: "synthetic", status: "active", historical_identity: false, price: 100.01, transfer_price: 80.03, stock: 2, short_description: "Synthetic only", category_id: "synthetic", categories: { id: "synthetic", name: "Perfumes", slug: "perfumes", is_active: true } };

test("web price follows 25% exactly once with PostgreSQL cent rounding", () => {
  for (const [list, expected] of [[100, 75], [100.01, 75.01], [1.34, 1.01], [0.02, 0.02], [0, 0]]) assert.equal(getWebTransferPrice(list), expected);
  assert.equal(getWebTransferSubtotal([{ price: 1.34, quantity: 100 }]), 101);
  assert.throws(() => getWebTransferPrice(Number.NaN));
  assert.throws(() => getWebTransferPrice(-1));
});

test("public catalog ignores the stored internal transfer price without mutating it", async () => {
  globalThis.__commercialCatalogClient = client([row]);
  assert.equal((await service.getProductsByCategorySlug("perfumes"))[0].transferPrice, 75.01);
  assert.equal((await service.getProductBySlug("synthetic")).transferPrice, 75.01);
  assert.equal(row.transfer_price, 80.03);
});

test("production never replaces an empty or failed catalog with demo products", async () => {
  const old = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    for (const error of [null, { message: "Synthetic failure" }]) {
      globalThis.__commercialCatalogClient = client([], error);
      assert.deepEqual(await service.getProductsByCategorySlug("perfumes"), []);
      assert.equal(await service.getProductBySlug("lattafa-asad"), null);
      assert.deepEqual(await service.getRelatedProducts(undefined, "lattafa-asad"), []);
    }
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});

test("development demo catalog remains available with the approved web price", async () => {
  const old = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    globalThis.__commercialCatalogClient = client([], { message: "Synthetic failure" });
    const products = await service.getProductsByCategorySlug("perfumes");
    assert.ok(products.length > 0);
    assert.ok(products.every((p) => p.transferPrice === getWebTransferPrice(p.price)));
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});


test("actual catalog cards never use a legacy 80% transfer field", async () => {
  const React = await import("react");
  const jsx = await import("react/jsx-runtime");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const pricing = await import("../lib/pricing.ts");
  const web = await import("../lib/web-transfer-pricing.ts");
  const load = (file, modules) => {
    const exports = {};
    const code = ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function("require", "exports", code)((name) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; }, exports);
    return exports;
  };
  const add = load("components/add-to-cart-button.tsx", { react: React, "react/jsx-runtime": jsx, "@/store/cart-store": { useCartStore: (selector) => selector({ items: [], addItem() {} }) } });
  const { ProductGrid } = load("components/product-grid.tsx", { react: React, "react/jsx-runtime": jsx, "@/lib/products/public-families": await import("../lib/products/public-families.ts"), "@/lib/pricing": pricing, "@/lib/web-transfer-pricing": web, "@/lib/whatsapp": { getProductWhatsAppLink: () => "/synthetic" }, "@/components/add-to-cart-button": add });
  for (const transferPrice of [80, null]) {
    const html = renderToStaticMarkup(React.createElement(ProductGrid, { products: [{ id: "synthetic", name: "Synthetic", slug: "synthetic", category: "perfumes", price: 100, transferPrice, stock: 2, imagePlaceholder: "SY" }], label: "Synthetic" }));
    assert.match(html, /75/);
    assert.match(html, /25% de ahorro/);
    assert.doesNotMatch(html, /Efectivo|20% de ahorro/);
  }
});


test("import preview may retain a source discount without becoming web price authority", async () => {
  const { buildSafePriceImportDecision } = await import("../lib/product-import/price-import.ts");
  const existing = { id: "synthetic", price: 100, transfer_price: 70 };
  const before = structuredClone(existing);
  const decision = buildSafePriceImportDecision({ price: 100, transferPrice: 80, priceProvided: true, transferPriceProvided: true }, existing);
  assert.equal(decision.patch.transfer_price, 80);
  assert.equal(getWebTransferPrice(100), 75);
  assert.deepEqual(existing, before);
});
