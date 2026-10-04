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

test("catalog queries no longer depend on a rigid category allowlist", () => {
  assert.doesNotMatch(productsService, /MATE_PUBLIC_CATEGORY_SLUGS/);
  assert.match(productsService, /\.neq\("categories\.slug", "perfumes"\)/);
  assert.match(productsService, /\.eq\("categories\.is_active", true\)/);
});

test("product queries and sitemap preserve visibility guards", () => {
  for (const source of [productsService, sitemap]) {
    assert.match(source, /\.eq\("historical_identity", false\)/);
    assert.match(source, /\.eq\("status", "active"\)/);
    assert.match(source, /\.eq\("categories\.is_active", true\)/);
  }
});
