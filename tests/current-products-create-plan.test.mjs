import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CURRENT_PRODUCT_CATEGORIES,
  CURRENT_PRODUCTS_REQUIRED,
  runCurrentProductCreation,
  serializeCurrentProductsCreatePlan,
  validateCurrentProductPlan,
} from "../lib/current-products/create-current-products-required.ts";

const matesCategory = {
  id: "61a589e6-7a88-4236-8813-8e3cbfdc3182",
  name: "Mates",
  slug: "mates",
  is_active: true,
  sort_order: 20,
};

function fakeRepository(overrides = {}) {
  const calls = { categories: [], products: [], attributes: [], deletes: [] };
  return {
    calls,
    repository: {
      async listCategories() { return [matesCategory]; },
      async listProducts() { return []; },
      async createCategory(input) {
        calls.categories.push(input);
        return { id: `id-${input.slug}`, ...input };
      },
      async createProduct(input) { calls.products.push(input); },
      async createAttributes(productId, attributes) { calls.attributes.push({ productId, attributes }); },
      async deleteProduct(productId) { calls.deletes.push(productId); },
      ...overrides,
    },
  };
}

test("the plan contains only the two approved categories and five products", () => {
  assert.deepEqual(CURRENT_PRODUCT_CATEGORIES.map(({ name, slug }) => ({ name, slug })), [
    { name: "Accesorios Materos", slug: "accesorios-materos" },
    { name: "Vasos Térmicos", slug: "vasos-termicos" },
  ]);
  assert.equal(CURRENT_PRODUCTS_REQUIRED.length, 5);
  assert.doesNotThrow(validateCurrentProductPlan);
});

test("the approved prices stock descriptions and attributes remain exact", () => {
  const lata = CURRENT_PRODUCTS_REQUIRED.find((product) => product.slug === "lata-matera");
  assert.deepEqual(
    { price: lata.price, transfer: lata.transferPrice, cost: lata.cost, stock: lata.stock },
    { price: 15000, transfer: 12000, cost: 6700, stock: 6 },
  );
  assert.equal(lata.shortDescription, "Set de latas para yerba y azúcar.");
  assert.deepEqual(lata.attributes, [
    { name: "Tipo", value: "Set de latas" },
    { name: "Uso", value: "Yerba y azúcar" },
  ]);
  assert.equal(CURRENT_PRODUCTS_REQUIRED.find((product) => product.slug === "mate-pampa-original-boca-abierta").stock, 1);
  assert.equal(CURRENT_PRODUCTS_REQUIRED.find((product) => product.slug === "vaso-cervecero-stanley").stock, 2);
  assert.equal(CURRENT_PRODUCTS_REQUIRED.find((product) => product.slug === "vaso-cervecero-liso").stock, 1);
  assert.equal(CURRENT_PRODUCTS_REQUIRED.find((product) => product.slug === "mate-algarrobo-simple").stock, 3);
});

test("dry-run performs reads but no writes", async () => {
  const { repository, calls } = fakeRepository();
  const result = await runCurrentProductCreation(repository, { apply: false });
  assert.deepEqual(result.categoriesToCreate, ["accesorios-materos", "vasos-termicos"]);
  assert.equal(result.productsToCreate.length, 5);
  assert.deepEqual(calls, { categories: [], products: [], attributes: [], deletes: [] });
});

test("apply creates missing categories before all five products", async () => {
  const { repository, calls } = fakeRepository();
  await runCurrentProductCreation(repository, { apply: true });
  assert.equal(calls.categories.length, 2);
  assert.equal(calls.products.length, 5);
  assert.equal(calls.attributes.length, 5);
  assert.ok(calls.products.every((product) => product.status === "active" && product.featured === false));
  assert.ok(calls.products.every((product) => product.description === null && product.compare_at_price === null));
});

test("an existing divergent product aborts instead of being modified", async () => {
  const planned = CURRENT_PRODUCTS_REQUIRED[1];
  const { repository, calls } = fakeRepository({
    async listProducts() {
      return [{
        id: "existing", category_id: matesCategory.id, name: planned.name, slug: planned.slug,
        short_description: planned.shortDescription, description: null, price: planned.price,
        transfer_price: planned.transferPrice, compare_at_price: null, cost: planned.cost,
        stock: 99, sku: null, featured: false, status: "active", product_attributes: planned.attributes,
      }];
    },
  });
  await assert.rejects(
    runCurrentProductCreation(repository, { apply: true }),
    /no será modificado/,
  );
  assert.deepEqual(calls.products, []);
});

test("attribute failure compensates only the newly inserted product", async () => {
  const { repository, calls } = fakeRepository({
    async createAttributes() { throw new Error("attribute failure"); },
  });
  await assert.rejects(runCurrentProductCreation(repository, { apply: true }), /attribute failure/);
  assert.equal(calls.products.length, 1);
  assert.deepEqual(calls.deletes, [calls.products[0].id]);
});

test("the checked-in CSV is generated from the approved plan", async () => {
  const expected = serializeCurrentProductsCreatePlan({ mates: matesCategory.id });
  const actual = await readFile(new URL("../reports/current-products-create-plan.csv", import.meta.url), "utf8");
  assert.equal(actual.replaceAll("\r\n", "\n"), expected);
  assert.doesNotMatch(actual, /inventory_movements|historical_identity/);
});

test("the executable requires explicit apply and contains no inventory movement write", async () => {
  const source = await readFile(new URL("../scripts/create-current-products-required.ts", import.meta.url), "utf8");
  assert.match(source, /process\.argv\.includes\("--apply"\)/);
  assert.match(source, /apply,/);
  assert.doesNotMatch(source, /from\("inventory_movements"\)/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.match(source, /\.delete\(\)\.eq\("id", productId\)/);
});
