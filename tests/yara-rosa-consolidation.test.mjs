import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { YARA_ROSA, buildYaraRosaConsolidationPlan, isSupersededYaraRosa } from "../lib/products/yara-rosa-consolidation.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function moduleUrl(code) {
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText).toString("base64")}`;
}
const identityUrl = moduleUrl(source("lib/products/yara-rosa-consolidation.ts"));
const aliases = await import("../lib/product-import/aliases.ts");
const a = { id: YARA_ROSA.canonicalId, slug: YARA_ROSA.canonicalSlug, name: "Lattafa Yara Rosa", price: 87077.92, transfer_price: 67050, cost: 44700, stock: 0, featured: false, status: "active", historical_identity: false };
const b = { ...a, id: YARA_ROSA.archivedId, slug: YARA_ROSA.archivedSlug, price: 71763, cost: 32504, transfer_price: 55257, stock: 1, featured: true };

for (const sheet of ["Precios Productos", "Producto Perfumes", "Termos y Mates"]) {
  for (const slug of [a.slug, b.slug]) {
    test(`${sheet}: ${slug} selects A, never B`, () => {
      assert.deepEqual(aliases.getProductImportLookupSlugs(sheet, slug), [a.slug]);
      assert.equal(aliases.selectExistingProductForImport([b, a], sheet, slug), a);
    });
  }
}
test("missing or wrong canonical ID aborts instead of creating or selecting B", () => {
  assert.throws(() => aliases.selectExistingProductForImport([b], "Producto Perfumes", b.slug), /identidad canonica/);
  assert.throws(() => aliases.selectExistingProductForImport([{ ...a, id: "wrong" }], "Precios Productos", a.slug), /identidad canonica/);
});
test("canonical import preserves A name and slug without modifying source or other products", () => {
  const row = { name: "PERFUME YARA ROSA", slug: b.slug, price: 87000 };
  const before = structuredClone(row);
  assert.deepEqual(aliases.preserveCanonicalImportIdentity(row, a), { ...row, name: a.name, slug: a.slug });
  assert.deepEqual(row, before);
  assert.equal(aliases.preserveCanonicalImportIdentity(row, { ...b, id: "unrelated" }), row);
});
test("plan preserves historical references and never converts or deletes B", () => {
  const before = structuredClone([a, b]);
  const plan = buildYaraRosaConsolidationPlan([a, b]);
  assert.deepEqual(plan.productUpdates.map((update) => update.patch), [
    { price: 87000, transfer_price: 67050, cost: 44700, featured: true, status: "active" },
    { status: "archived", featured: false },
  ]);
  assert.ok(plan.preserve.includes("historical purchase items and snapshots"));
  assert.ok(plan.preserve.includes("historical import records and mappings"));
  assert.ok(plan.preserve.includes("historical_identity=false"));
  assert.deepEqual([a, b], before);
  assert.equal(plan.imageAction, "KEEP_BOTH_FOR_TECHNICAL_TRACEABILITY_NO_STORAGE_DELETE");
});
test("stock plan uses existing RPCs, A=1 B=0, no global delta or historical movements", () => {
  const plan = buildYaraRosaConsolidationPlan([a, b]);
  assert.deepEqual(plan.inventoryAdjustments.map((adjustment) => [adjustment.productId, adjustment.previousStock, adjustment.newStock]), [[b.id, 1, 0], [a.id, 0, 1]]);
  assert.ok(plan.inventoryAdjustments.every((adjustment) => adjustment.rpc === "adjust_inventory_stock" && adjustment.reason));
  assert.equal(plan.expected.stockTotalDelta, 0);
  assert.equal(plan.expected.newAdjustmentMovements, 2);
  assert.match(plan.executionRequirement, /One PostgreSQL transaction/);
  assert.ok(plan.productUpdates.every((update) => !("stock" in update.patch)));
});
test("unexpected live stock or missing identity aborts planning", () => {
  assert.throws(() => buildYaraRosaConsolidationPlan([a, { ...b, stock: 2 }]), /ABORT_YARA_PRECONDITION_CHANGED/);
  assert.throws(() => buildYaraRosaConsolidationPlan([a]), /exactly both/);
});
test("Next redirect preserves old URL permanently toward A", async () => {
  const config = await import(moduleUrl(source("next.config.ts").replace("./lib/products/yara-rosa-consolidation", identityUrl)));
  assert.deepEqual(await config.default.redirects(), [{ source: `/producto/${b.slug}`, destination: `/producto/${a.slug}`, permanent: true }]);
});
test("Yara fallback is removed, unrelated fallback products remain", async () => {
  const fallback = await import(moduleUrl(source("data/products.ts")));
  assert.equal(fallback.products.some((product) => [a.slug, b.slug].includes(product.slug)), false);
  assert.ok(fallback.products.some((product) => product.slug === "lattafa-asad"));
});

function fakeClient(rows, error = null) {
  return { from() {
    let selected = [...rows];
    let single = false;
    const query = {
      select() { return query; },
      eq(key, value) { selected = selected.filter((row) => key.startsWith("categories.") ? row.categories?.[key.slice(11)] === value : row[key] === value); return query; },
      neq(key, value) { selected = selected.filter((row) => key.startsWith("categories.") ? row.categories?.[key.slice(11)] !== value : row[key] !== value); return query; },
      order() { return query; }, limit() { return query; },
      maybeSingle() { single = true; return query; },
      then(resolve, reject) { return Promise.resolve({ data: single ? selected[0] ?? null : selected, error }).then(resolve, reject); },
    };
    return query;
  } };
}
const mockUrl = moduleUrl("export const getSupabaseClient = () => globalThis.__yaraReadOnlyClient; export const getSupabaseAdminClient = getSupabaseClient;");
const publicService = await import(moduleUrl(source("services/products.ts")
  .replace("@/lib/products/yara-rosa-consolidation", identityUrl)
  .replace("@/lib/catalog/public-product-visibility", moduleUrl(source("lib/catalog/public-product-visibility.ts")))
  .replace("@/data/products", moduleUrl(source("data/products.ts")))
  .replace("@/lib/supabase/client", mockUrl)));
const category = { id: "perfumes", slug: "perfumes", name: "Perfumes", is_active: true };
const publicRow = (product) => ({ ...product, category_id: category.id, categories: category, short_description: "description", product_images: [], product_attributes: [] });
test("real public service returns only A, excluding active duplicate, draft and historical", async () => {
  globalThis.__yaraReadOnlyClient = fakeClient([a, b, { ...a, id: "draft", status: "draft" }, { ...a, id: "historical", historical_identity: true }].map(publicRow));
  assert.deepEqual((await publicService.getProductsByCategorySlug("perfumes")).map((product) => product.id), [a.id]);
  assert.equal(await publicService.getProductBySlug(b.slug), null);
});
test("Supabase failure never revives phantom Yara fallback", async () => {
  globalThis.__yaraReadOnlyClient = fakeClient([], { message: "failure" });
  assert.equal(await publicService.getProductBySlug(a.slug), null);
  assert.equal((await publicService.getProductsByCategorySlug("perfumes")).some((product) => [a.slug, b.slug].includes(product.slug)), false);
});
test("real sitemap filters B and keeps A", async () => {
  globalThis.__yaraReadOnlyClient = fakeClient([publicRow(a), publicRow(b)]);
  const sitemap = await import(moduleUrl(source("app/sitemap.ts").replace("@/lib/products/yara-rosa-consolidation", identityUrl).replace("@/lib/supabase/client", mockUrl)));
  const urls = (await sitemap.default()).map((entry) => entry.url);
  assert.ok(urls.some((url) => url.endsWith(`/producto/${a.slug}`)));
  assert.ok(!urls.some((url) => url.endsWith(`/producto/${b.slug}`)));
});
test("consultation catalog excludes B even before archival", async () => {
  globalThis.__yaraReadOnlyClient = fakeClient([publicRow(a), publicRow(b)]);
  const catalog = await import(moduleUrl(source("services/admin-catalog.ts").replace("@/lib/products/yara-rosa-consolidation", identityUrl).replace("@/lib/supabase/server", mockUrl)));
  assert.deepEqual((await catalog.getQuickCatalogProducts()).data.map((product) => product.id), [a.id]);
});

const paymentServiceUrl = moduleUrl(source("services/order-payments.ts")
  .replace("@/lib/supabase/server", mockUrl)
  .replace("@/lib/order-payments", moduleUrl(source("lib/order-payments.ts"))));
const saleService = await import(moduleUrl(source("services/store-sales.ts")
  .replace("@/lib/supabase/server", mockUrl)
  .replace("@/lib/store-sales", moduleUrl(source("lib/store-sales.ts")))
  .replace("@/lib/products/yara-rosa-consolidation", identityUrl)));
const orderService = await import(moduleUrl(source("services/customer-orders.ts")
  .replace("@/lib/supabase/server", mockUrl)
  .replace("@/lib/orders/workflow", moduleUrl(source("lib/orders/workflow.ts")))
  .replace("@/services/order-payments", paymentServiceUrl)
  .replace("@/lib/products/yara-rosa-consolidation", identityUrl)));

for (const [label, listProducts] of [
  ["store sales", saleService.listStoreSaleProducts],
  ["customer orders", orderService.listCustomerOrderProducts],
]) {
  test(`${label}: A remains available and active B is explicitly excluded before apply`, async () => {
    globalThis.__yaraReadOnlyClient = fakeClient([publicRow(a), publicRow(b)]);
    const before = structuredClone([a, b]);
    const products = await listProducts();
    assert.deepEqual(products.map((product) => product.id), [a.id]);
    assert.equal(products[0].stock, a.stock);
    assert.equal(products[0].price, a.price);
    assert.deepEqual([a, b], before);
  });
  test(`${label}: ordinary active products remain, historical/draft/archived stay excluded`, async () => {
    const normal = { ...a, id: "ordinary-active", slug: "ordinary-product" };
    const rows = [normal, { ...normal, id: "historical", historical_identity: true },
      { ...normal, id: "draft", status: "draft" }, { ...normal, id: "archived", status: "archived" }];
    globalThis.__yaraReadOnlyClient = fakeClient(rows.map(publicRow));
    assert.deepEqual((await listProducts()).map((product) => product.id), [normal.id]);
  });
}
test("post-apply recommendation eligibility keeps only active A with stock 1", async () => {
  const finalA = { ...a, ...buildYaraRosaConsolidationPlan([a, b]).productUpdates[0].patch, stock: 1 };
  const finalB = { ...b, status: "archived", featured: false, stock: 0 };
  globalThis.__yaraReadOnlyClient = fakeClient([publicRow(finalA), publicRow(finalB)]);
  const catalog = await import(moduleUrl(source("services/admin-catalog.ts").replace("@/lib/products/yara-rosa-consolidation", identityUrl).replace("@/lib/supabase/server", mockUrl)));
  const query = await import(moduleUrl(source("lib/admin/perfume-recommendation-query.ts")
    .replace("@/lib/catalog/attribute-config", moduleUrl(source("lib/catalog/attribute-config.ts")))));
  const eligible = query.getEligiblePerfumeRecommendationProducts((await catalog.getQuickCatalogProducts()).data);
  assert.deepEqual(eligible.map((product) => [product.id, product.stock]), [[a.id, 1]]);
});
test("normal admin mutations cannot reactivate B and preview preserves duplicate detection", () => {
  const actions = source("app/admin/productos/actions.ts");
  assert.match(actions, /if \(isSupersededYaraRosa\(data\)\)\s*\{\s*throw new Error/);
  const preview = source("app/admin/productos/importar/actions.ts");
  assert.match(preview, /duplicate: duplicateSlugs.has\(sourceRow.slug\)/);
  assert.match(preview, /sourceRow.sku && !getYaraRosaCanonicalId\(sourceRow.slug\)/);
});
test("operational selectors and admin searches retain their guards", () => {
  assert.match(source("services/admin.ts"), /neq\("id", YARA_ROSA.archivedId\)/);
  assert.match(source("services/purchases.ts"), /neq\("id", YARA_ROSA.archivedId\)/);
  for (const path of ["services/store-sales.ts", "services/customer-orders.ts", "services/purchases.ts"]) {
    assert.match(source(path), /eq\("historical_identity", false\)/);
    assert.match(source(path), /eq\("status", "active"\)/);
  }
  assert.ok(isSupersededYaraRosa(b));
  assert.ok(!isSupersededYaraRosa(a));
});
test("historical aliases and approved historical Yara mappings remain on B", () => {
  assert.deepEqual(aliases.PRODUCT_IMPORT_SLUG_ALIASES, {
    "bombillas-plana": "bombillas",
    "lattafa-qaed-al-fursan-untamed": "qaed-al-fursan-untamed",
  });
  assert.match(source("scripts/dry-run-historical-import.ts"), /\["Lattafa Yara Rosa", "05b34469-3eb8-4148-8e97-9a19f1c2df6e"\]/);
});
test("read-only planner has no apply, update, delete, insert or RPC execution path", () => {
  const script = source("scripts/plan-yara-rosa-consolidation.ts");
  assert.match(script, /--apply is not supported/);
  assert.doesNotMatch(script, /client(?:\.storage)?[\s\S]{0,100}\.(?:insert|delete|rpc|remove)\(/);
  assert.doesNotMatch(script, /from\([^)]*\)\s*\.update\(/);
});
