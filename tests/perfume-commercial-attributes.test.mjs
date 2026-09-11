import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));

async function loadTypeScriptModule(pathParts) {
  const source = readFileSync(join(testDirectory, "..", ...pathParts), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

const attributesModule = await loadTypeScriptModule([
  "lib",
  "catalog",
  "attribute-config.ts",
]);
const catalogModule = await loadTypeScriptModule([
  "lib",
  "admin",
  "quick-catalog.ts",
]);

const {
  CATALOG_ATTRIBUTE_KEYS,
  PERFUME_ATTRIBUTE_FIELDS,
  getCatalogAttributeNameAliases,
  getCatalogAttributeOptionLabel,
  getCatalogAttributeValues,
  normalizeCatalogAttributeValue,
} = attributesModule;
const { filterQuickCatalogProducts } = catalogModule;

const perfume = {
  id: "perfume-1",
  name: "Perfume de prueba",
  slug: "perfume-de-prueba",
  sku: "PERF-001",
  status: "active",
  stock: 3,
  price: 100,
  transfer_price: 80,
  category: { id: "perfumes", name: "Perfumes", slug: "perfumes" },
  attributes: [
    { name: "gender", value: "MASCULINO" },
    { name: "olfactory_family", value: "dulce" },
    { name: "olfactory_family", value: "Ámbarado" },
    { name: "occasion", value: "cita" },
    { name: "occasion", value: "NOCHE" },
    { name: "intensity", value: "intensa" },
    { name: "Tipo", value: "Perfume" },
    { name: "Marca", value: "Marca histórica" },
    { name: "Proveedor", value: "Proveedor histórico" },
  ],
  images: [],
};

const mate = {
  ...perfume,
  id: "mate-1",
  name: "Mate de prueba",
  slug: "mate-de-prueba",
  category: { id: "mates", name: "Mates", slug: "mates" },
  attributes: [],
};

const aliases = Object.fromEntries(
  PERFUME_ATTRIBUTE_FIELDS.map((field) => [
    field.key,
    getCatalogAttributeNameAliases(field.key),
  ]),
);

test("commercial values normalize casing, spaces and accents", () => {
  assert.equal(normalizeCatalogAttributeValue("  ÁMBARADO  "), "ambarado");
  assert.equal(normalizeCatalogAttributeValue("Diseñador"), "disenador");
  assert.equal(
    getCatalogAttributeOptionLabel(CATALOG_ATTRIBUTE_KEYS.gender, "MASCULINO"),
    "Masculino",
  );
});

test("perfume attribute cardinality matches the approved model", () => {
  const fields = Object.fromEntries(
    PERFUME_ATTRIBUTE_FIELDS.map((field) => [field.key, field]),
  );

  assert.equal(fields.commercial_category.multiple, false);
  assert.equal(fields.olfactory_family.multiple, true);
  assert.equal(fields.intensity.multiple, false);
  assert.equal(fields.occasion.multiple, true);
  assert.equal(fields.gender.multiple, false);
  assert.equal(Object.hasOwn(fields, "decant_available"), false);
});

test("multiple values are stored and read as independent attribute rows", () => {
  assert.deepEqual(
    getCatalogAttributeValues(
      perfume.attributes,
      CATALOG_ATTRIBUTE_KEYS.olfactoryFamily,
    ),
    ["dulce", "ambarado"],
  );
  assert.deepEqual(
    getCatalogAttributeValues(
      perfume.attributes,
      CATALOG_ATTRIBUTE_KEYS.occasion,
    ),
    ["cita", "noche"],
  );
});

test("a single-value filter and a multi-value filter can be combined", () => {
  const result = filterQuickCatalogProducts([perfume, mate], {
    attributes: { gender: "masculino", occasion: "noche" },
    attributeAliases: aliases,
  });

  assert.deepEqual(result.map((product) => product.id), ["perfume-1"]);
});

test("a non-matching family excludes the perfume", () => {
  const result = filterQuickCatalogProducts([perfume], {
    attributes: { olfactory_family: "fresco" },
    attributeAliases: aliases,
  });

  assert.deepEqual(result, []);
});

test("search and commercial filters work simultaneously", () => {
  const result = filterQuickCatalogProducts([perfume, mate], {
    search: "perfume dulce",
    categoryId: "perfumes",
    stock: "in",
    attributes: { intensity: "intensa" },
    attributeAliases: aliases,
  });

  assert.deepEqual(result.map((product) => product.id), ["perfume-1"]);
});

test("missing commercial attributes do not break filtering", () => {
  assert.deepEqual(
    filterQuickCatalogProducts([mate], { attributes: {}, attributeAliases: aliases }),
    [mate],
  );
  assert.deepEqual(
    filterQuickCatalogProducts([mate], {
      attributes: { gender: "masculino" },
      attributeAliases: aliases,
    }),
    [],
  );
});

test("legacy Tipo, Marca and Proveedor remain untouched", () => {
  const legacyBefore = perfume.attributes.filter((attribute) =>
    ["Tipo", "Marca", "Proveedor"].includes(attribute.name),
  );

  filterQuickCatalogProducts([perfume], {
    attributes: { gender: "masculino" },
    attributeAliases: aliases,
  });

  assert.deepEqual(
    perfume.attributes.filter((attribute) =>
      ["Tipo", "Marca", "Proveedor"].includes(attribute.name),
    ),
    legacyBefore,
  );
});

test("the product form uses the central managed perfume fields", () => {
  const formSource = readFileSync(
    join(
      testDirectory,
      "..",
      "components",
      "admin",
      "products",
      "product-form.tsx",
    ),
    "utf8",
  );
  const actionSource = readFileSync(
    join(testDirectory, "..", "app", "admin", "productos", "actions.ts"),
    "utf8",
  );

  assert.match(formSource, /getAttributeFieldsForCategory/);
  assert.match(actionSource, /MANAGED_CATALOG_ATTRIBUTE_KEYS/);
  assert.match(actionSource, /PRODUCT_ATTRIBUTE_NAMES\.brand/);
  assert.match(actionSource, /PRODUCT_ATTRIBUTE_NAMES\.type/);
  assert.doesNotMatch(
    PERFUME_ATTRIBUTE_FIELDS.map((field) => field.key).join(","),
    /decant_available/,
  );
});
