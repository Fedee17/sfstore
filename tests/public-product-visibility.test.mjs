import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolvePublicCatalogSection } from "../lib/catalog/public-product-visibility.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const productsService = readFileSync(join(root, "services", "products.ts"), "utf8");
const sitemap = readFileSync(join(root, "app", "sitemap.ts"), "utf8");

function visibleProduct(overrides = {}) {
  return {
    status: "active",
    historicalIdentity: false,
    categorySlug: "mates",
    categoryIsActive: true,
    ...overrides,
  };
}

test("new active categories resolve into the public catalog", () => {
  assert.equal(
    resolvePublicCatalogSection(
      visibleProduct({ categorySlug: "vasos-termicos" }),
    ),
    "mates",
  );
  assert.equal(
    resolvePublicCatalogSection(
      visibleProduct({ categorySlug: "accesorios-materos" }),
    ),
    "mates",
  );
});

test("existing public categories keep their sections", () => {
  assert.equal(
    resolvePublicCatalogSection(visibleProduct({ categorySlug: "perfumes" })),
    "perfumes",
  );
  assert.equal(resolvePublicCatalogSection(visibleProduct()), "mates");
  assert.equal(
    resolvePublicCatalogSection(visibleProduct({ categorySlug: "termos" })),
    "mates",
  );
});

test("historical, draft and archived products stay private", () => {
  assert.equal(
    resolvePublicCatalogSection(visibleProduct({ historicalIdentity: true })),
    null,
  );
  assert.equal(
    resolvePublicCatalogSection(visibleProduct({ status: "draft" })),
    null,
  );
  assert.equal(
    resolvePublicCatalogSection(visibleProduct({ status: "archived" })),
    null,
  );
});

test("missing or inactive categories stay private", () => {
  assert.equal(
    resolvePublicCatalogSection(visibleProduct({ categoryIsActive: false })),
    null,
  );
  assert.equal(
    resolvePublicCatalogSection(visibleProduct({ categorySlug: null })),
    null,
  );
});

test("catalog uses a filtered public projection and retains flexible category sections",()=>{
 assert.doesNotMatch(productsService,/MATE_PUBLIC_CATEGORY_SLUGS/);
 assert.match(productsService,/public_catalog_skus/);
 assert.match(productsService,/category_slug/);
});
test("public projection preserves visibility guards, without granting public costs",()=>{
 const sql=readFileSync(join(root,"supabase/migrations/202610180002_variant_commercial_integration.sql"),"utf8");
 assert.match(sql,/where p.status='active' and not p.historical_identity and p.web_visible and not p.commercial_blocked and c.is_active/);
 assert.match(sql,/security_barrier=true/);
 assert.match(sitemap,/getCatalogPublications/);
});
