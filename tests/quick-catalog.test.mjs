import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const moduleSource = readFileSync(
  join(testDirectory, "..", "lib", "admin", "quick-catalog.ts"),
  "utf8",
);
const compiledModule = ts.transpileModule(moduleSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { filterQuickCatalogProducts, getQuickCatalogPrimaryImage } = await import(
  `data:text/javascript;base64,${Buffer.from(compiledModule).toString("base64")}`
);

const perfume = {
  id: "perfume-1",
  name: "Láttafa Asad",
  slug: "lattafa-asad",
  sku: "PERF-001",
  status: "active",
  stock: 1,
  price: 95844.16,
  transfer_price: 73800,
  category: { id: "cat-perfumes", name: "Perfumes", slug: "perfumes" },
  attributes: [
    { name: "olfactory_family", value: "dulce" },
    { name: "occasion", value: "noche" },
  ],
  images: [
    { url: "/secondary.jpg", alt: null, sort_order: 0, is_primary: false },
    { url: "/primary.jpg", alt: "Asad", sort_order: 2, is_primary: true },
  ],
};

const mate = {
  id: "mate-1",
  name: "Mate imperial premium",
  slug: "mate-imperial-premium",
  sku: null,
  status: "draft",
  stock: 0,
  price: 20779.22,
  transfer_price: null,
  category: { id: "cat-mates", name: "Mates", slug: "mates" },
  attributes: [],
  images: [],
};

const products = [perfume, mate];

test("search matches names without depending on accents or casing", () => {
  assert.deepEqual(
    filterQuickCatalogProducts(products, { search: "LATTAFA" }).map(
      (product) => product.id,
    ),
    ["perfume-1"],
  );
});

test("search covers SKU, category and attribute values", () => {
  for (const search of ["PERF-001", "perfumes", "dulce", "perfume dulce"]) {
    assert.deepEqual(
      filterQuickCatalogProducts(products, { search }).map(
        (product) => product.id,
      ),
      ["perfume-1"],
    );
  }
});

test("category and stock filters are applied independently", () => {
  assert.deepEqual(
    filterQuickCatalogProducts(products, { categoryId: "cat-mates" }).map(
      (product) => product.id,
    ),
    ["mate-1"],
  );
  assert.deepEqual(
    filterQuickCatalogProducts(products, { stock: "in" }).map(
      (product) => product.id,
    ),
    ["perfume-1"],
  );
  assert.deepEqual(
    filterQuickCatalogProducts(products, { stock: "out" }).map(
      (product) => product.id,
    ),
    ["mate-1"],
  );
});

test("managed attribute filters require the selected value", () => {
  assert.deepEqual(
    filterQuickCatalogProducts(products, {
      attributes: { olfactory_family: "dulce" },
    }).map((product) => product.id),
    ["perfume-1"],
  );
});

test("products without images or attributes remain valid results", () => {
  const result = filterQuickCatalogProducts(products, { search: "imperial" });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].attributes, []);
  assert.equal(getQuickCatalogPrimaryImage(result[0]), null);
});

test("the primary image wins over sort order", () => {
  assert.equal(getQuickCatalogPrimaryImage(perfume)?.url, "/primary.jpg");
});

test("the attention page is admin-only and does not expose cost", () => {
  const page = readFileSync(
    join(testDirectory, "..", "app", "admin", "consulta", "page.tsx"),
    "utf8",
  );
  const service = readFileSync(
    join(testDirectory, "..", "services", "admin-catalog.ts"),
    "utf8",
  );

  assert.match(page, /await requireAdminSession\(\)/);
  assert.match(page, /Precio lista/);
  assert.match(page, /Efectivo \/ transferencia/);
  assert.doesNotMatch(page, /product\.cost/);
  assert.doesNotMatch(service, /^\s*cost,?\s*$/m);
  assert.match(service, /transfer_price/);
});
