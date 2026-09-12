import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));

async function loadRecommendationModule() {
  const configSource = readFileSync(
    join(testDirectory, "..", "lib", "catalog", "attribute-config.ts"),
    "utf8",
  );
  const configCompiled = ts.transpileModule(configSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const configUrl = `data:text/javascript;base64,${Buffer.from(configCompiled).toString("base64")}`;
  const recommendationSource = readFileSync(
    join(testDirectory, "..", "lib", "catalog", "perfume-recommendation.ts"),
    "utf8",
  );
  const recommendationCompiled = ts
    .transpileModule(recommendationSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace('from "./attribute-config.ts"', `from "${configUrl}"`);

  return import(
    `data:text/javascript;base64,${Buffer.from(recommendationCompiled).toString("base64")}`
  );
}

const { recommendPerfumes } = await loadRecommendationModule();

function attribute(name, value) {
  return { name, value };
}

function perfume(overrides = {}) {
  return {
    id: "perfume-1",
    name: "Perfume Uno",
    slug: "perfume-uno",
    sku: "PERF-1",
    stock: 2,
    price: 100_000,
    transfer_price: 90_000,
    category: { id: "perfumes", name: "Perfumes", slug: "perfumes" },
    attributes: [
      attribute("gender", "masculino"),
      attribute("olfactory_family", "dulce"),
      attribute("olfactory_family", "ambarado"),
      attribute("intensity", "intensa"),
      attribute("occasion", "noche"),
      attribute("occasion", "cita"),
      attribute("Tipo", "Perfume"),
    ],
    ...overrides,
  };
}

function first(preferences, product = perfume()) {
  return recommendPerfumes([product], preferences)[0];
}

test("scores a perfect match", () => {
  const result = first({
    gender: "masculino",
    olfactoryFamilies: ["dulce", "ambarado"],
    intensity: "intensa",
    occasions: ["noche", "cita"],
    maxTransferPrice: 90_000,
  });
  assert.equal(result.score, 5);
  assert.equal(result.maxScore, 5);
  assert.equal(result.matchPercentage, 100);
});

test("keeps a partial match as a useful recommendation", () => {
  const result = first({ gender: "femenino", intensity: "intensa" });
  assert.equal(result.score, 1);
  assert.equal(result.matchPercentage, 50);
});

test("scores exact gender with one point", () => {
  assert.equal(first({ gender: "MASCULINO" }).matches.gender.score, 1);
});

test("scores unisex compatibility with half a point", () => {
  const result = first(
    { gender: "femenino" },
    perfume({ attributes: [attribute("gender", "unisex")] }),
  );
  assert.equal(result.score, 0.5);
  assert.equal(result.matches.gender.compatibility, "unisex");
});

test("does not invent compatibility for an incompatible gender", () => {
  assert.equal(recommendPerfumes([perfume()], { gender: "femenino" }).length, 0);
});

test("requires exact unisex when the customer requests unisex", () => {
  assert.equal(recommendPerfumes([perfume()], { gender: "unisex" }).length, 0);
});

test("scores multiple families proportionally", () => {
  const result = first({ olfactoryFamilies: ["dulce", "frutal"] });
  assert.equal(result.score, 0.5);
  assert.deepEqual(result.matches.olfactoryFamily.matchedValues, ["dulce"]);
});

test("scores multiple occasions proportionally", () => {
  const result = first({ occasions: ["noche", "diario"] });
  assert.equal(result.score, 0.5);
  assert.deepEqual(result.matches.occasion.matchedValues, ["noche"]);
});

test("scores exact intensity and no proximity", () => {
  assert.equal(first({ intensity: "intensa" }).score, 1);
  assert.equal(recommendPerfumes([perfume()], { intensity: "media" }).length, 0);
});

test("scores a price within budget", () => {
  assert.equal(first({ maxTransferPrice: 90_000 }).matches.price.score, 1);
});

test("scores a price up to ten percent above budget", () => {
  const result = first(
    { maxTransferPrice: 100_000 },
    perfume({ transfer_price: 110_000 }),
  );
  assert.equal(result.score, 0.5);
  assert.equal(result.matches.price.relation, "within-10-percent");
});

test("does not score a price more than ten percent above budget", () => {
  assert.equal(
    recommendPerfumes([perfume({ transfer_price: 110_001 })], {
      maxTransferPrice: 100_000,
    }).length,
    0,
  );
});

test("inStockOnly excludes zero, negative, null and missing stock", () => {
  const products = [
    perfume({ id: "positive", stock: 1 }),
    perfume({ id: "zero", stock: 0 }),
    perfume({ id: "negative", stock: -1 }),
    perfume({ id: "null", stock: null }),
    perfume({ id: "missing", stock: undefined }),
  ];
  assert.deepEqual(
    recommendPerfumes(products, { gender: "masculino", inStockOnly: true }).map(
      (item) => item.product.id,
    ),
    ["positive"],
  );
});

test("an out-of-stock perfume participates when stock is not required", () => {
  assert.equal(first({ gender: "masculino" }, perfume({ stock: 0 })).score, 1);
});

test("returns no default recommendations when criteria are absent", () => {
  assert.deepEqual(recommendPerfumes([perfume()], {}), []);
});

test("tolerates missing attributes without throwing", () => {
  assert.deepEqual(
    recommendPerfumes([perfume({ attributes: null })], { gender: "masculino" }),
    [],
  );
});

test("sorts ties by stock, price and then name", () => {
  const products = [
    perfume({ id: "z", name: "Zulu", slug: "zulu", stock: 0, transfer_price: 10 }),
    perfume({ id: "b", name: "Beta", slug: "beta", stock: 1, transfer_price: 20 }),
    perfume({ id: "a", name: "Alfa", slug: "alfa", stock: 1, transfer_price: 20 }),
    perfume({ id: "c", name: "Gamma", slug: "gamma", stock: 1, transfer_price: 10 }),
  ];
  assert.deepEqual(
    recommendPerfumes(products, { gender: "masculino" }).map(
      (item) => item.product.name,
    ),
    ["Gamma", "Alfa", "Beta", "Zulu"],
  );
});

test("uses stable identifiers after equal names for deterministic ordering", () => {
  const products = [
    perfume({ id: "2", name: "Igual", slug: "igual-b" }),
    perfume({ id: "1", name: "Igual", slug: "igual-a" }),
  ];
  const order = recommendPerfumes(products, { gender: "masculino" }).map(
    (item) => item.product.slug,
  );
  assert.deepEqual(order, ["igual-a", "igual-b"]);
  assert.deepEqual(
    recommendPerfumes(products.toReversed(), { gender: "masculino" }).map(
      (item) => item.product.slug,
    ),
    order,
  );
});

test("normalizes accents, case and surrounding spaces", () => {
  const result = first(
    { olfactoryFamilies: ["  CÍTRICO  "], occasions: ["SALÍDA"] },
    perfume({
      attributes: [
        attribute("Familia olfativa", "Citrico"),
        attribute("Ocasión", "salida"),
      ],
    }),
  );
  assert.equal(result.score, 2);
});

test("treats decants normally and exposes legacy type", () => {
  const result = first(
    { gender: "unisex" },
    perfume({
      name: "Decant Ejemplo",
      attributes: [attribute("gender", "unisex"), attribute("Tipo", "Decant")],
    }),
  );
  assert.equal(result.type, "Decant");
  assert.equal(result.score, 1);
});

test("calculates max score only from entered criteria", () => {
  const result = first({ olfactoryFamilies: ["dulce"], occasions: ["noche"] });
  assert.equal(result.maxScore, 2);
});

test("calculates match percentage from fractional scores", () => {
  const result = first({
    gender: "masculino",
    olfactoryFamilies: ["dulce", "frutal"],
    intensity: "media",
  });
  assert.equal(result.score, 1.5);
  assert.equal(result.matchPercentage, 50);
});

test("a missing transfer price contributes zero without breaking other matches", () => {
  const result = first(
    { gender: "masculino", maxTransferPrice: 100_000 },
    perfume({ transfer_price: null }),
  );
  assert.equal(result.score, 1);
  assert.equal(result.maxScore, 2);
  assert.equal(result.matches.price.relation, "unavailable");
});

test("applies an optional minimum match threshold", () => {
  const products = [
    perfume({ id: "exact" }),
    perfume({
      id: "partial",
      attributes: [attribute("gender", "unisex"), attribute("intensity", "intensa")],
    }),
  ];
  assert.deepEqual(
    recommendPerfumes(products, {
      gender: "masculino",
      intensity: "intensa",
      minMatchPercentage: 80,
    }).map((item) => item.product.id),
    ["exact"],
  );
});

test("deduplicates repeated preference values", () => {
  const result = first({ olfactoryFamilies: ["dulce", "DULCE"] });
  assert.equal(result.score, 1);
  assert.equal(result.maxScore, 1);
});

test("ignores products outside the Perfumes category", () => {
  assert.deepEqual(
    recommendPerfumes(
      [perfume({ category: { id: "mates", name: "Mates", slug: "mates" } })],
      { gender: "masculino" },
    ),
    [],
  );
});

test("the real-data runner selects no cost and contains no write operation", () => {
  const source = readFileSync(
    join(testDirectory, "..", "scripts", "run-perfume-recommendations.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /\bcost\b/i);
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\s*\(/);
  assert.match(source, /\.select\s*\(/);
});
