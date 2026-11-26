import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as search from "../lib/catalog/search.ts";

// CONV-02 (26/11): the header suggestions use the same recovery as the search page.
const require = createRequire(import.meta.url);
const catalog = [
  { slug: "termo-stanley", name: "Termo Stanley 1L", shortDescription: "", categorySlug: "termos" },
  { slug: "yara", name: "Yara Rosa", shortDescription: "", categorySlug: "perfumes", attributes: [{ name: "Género", value: "Femenino" }] },
];
function route() {
  const code = ts.transpileModule(readFileSync(new URL("../app/api/catalog/suggestions/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const modules = { "next/cache": { unstable_cache: fn => fn }, '@/lib/catalog/public-catalog-revalidation':{PUBLIC_CATALOG_CACHE_TAG:'public-catalog',revalidatePublicCatalogCaches:()=>{}}, "@/lib/catalog/search": search, "@/services/products": { getCatalogPublications: async () => catalog } };
  new Function("require", "exports", code)(name => Object.hasOwn(modules, name) ? modules[name] : require(name), exports);
  return exports;
}
const suggest = async q => (await route().GET(new Request(`https://example.test/api/catalog/suggestions?q=${encodeURIComponent(q)}`))).json();

test("exact suggestions are unchanged", async () => {
  assert.deepEqual(await suggest("termo"), [{ slug: "termo-stanley", name: "Termo Stanley 1L" }]);
  assert.deepEqual(await suggest("x"), []);
});

test("typos and synonyms also suggest products", async () => {
  assert.deepEqual(await suggest("stanly"), [{ slug: "termo-stanley", name: "Termo Stanley 1L" }]);
  assert.deepEqual(await suggest("perfume mujer"), [{ slug: "yara", name: "Yara Rosa" }]);
});
