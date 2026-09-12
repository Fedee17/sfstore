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

const {
  getPerfumeRecommendationTier,
  isDecantProduct,
  recommendPerfumeGroups,
  recommendPerfumes,
} = await loadRecommendationModule();

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

test("a full perfume and a decant keep the same perfect affinity", () => {
  const full = perfume({ id: "full", name: "Frasco completo" });
  const decant = perfume({
    id: "decant",
    name: "Decant Frasco completo",
    attributes: [
      ...full.attributes.filter((item) => item.name !== "Tipo"),
      attribute("Tipo", "Accesorios"),
    ],
  });
  const groups = recommendPerfumeGroups([decant, full], {
    gender: "masculino",
    intensity: "intensa",
  });
  assert.equal(groups.primaryRecommendations[0].matchPercentage, 100);
  assert.equal(groups.decantRecommendations[0].matchPercentage, 100);
});

test("a decant never appears among primary recommendations", () => {
  const decant = perfume({
    name: "Decant Ejemplo",
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Accesorios")],
  });
  const groups = recommendPerfumeGroups([decant], { gender: "masculino" });
  assert.equal(groups.primaryRecommendations.length, 0);
  assert.equal(groups.decantRecommendations.length, 1);
});

test("an in-stock full perfume appears in primary", () => {
  const groups = recommendPerfumeGroups([perfume({ stock: 1 })], {
    gender: "masculino",
  });
  assert.equal(groups.primaryRecommendations.length, 1);
});

test("an out-of-stock full perfume appears in unavailable", () => {
  const groups = recommendPerfumeGroups([perfume({ stock: 0 })], {
    gender: "masculino",
  });
  assert.equal(groups.unavailableRecommendations.length, 1);
});

test("inStockOnly removes the unavailable group", () => {
  const groups = recommendPerfumeGroups([perfume({ stock: 0 })], {
    gender: "masculino",
    inStockOnly: true,
  });
  assert.deepEqual(groups.unavailableRecommendations, []);
});

test("inStockOnly excludes an out-of-stock decant", () => {
  const decant = perfume({
    name: "Decant Ejemplo",
    stock: 0,
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Accesorios")],
  });
  const groups = recommendPerfumeGroups([decant], {
    gender: "masculino",
    inStockOnly: true,
  });
  assert.deepEqual(groups.decantRecommendations, []);
});

test("isDecantProduct uses the explicit legacy type and normalized name", () => {
  assert.equal(
    isDecantProduct(
      perfume({
        name: "  DECÁNT de prueba",
        attributes: [attribute("Tipo", "ACCESORIOS")],
      }),
    ),
    true,
  );
  assert.equal(
    isDecantProduct(
      perfume({
        name: "Estuche de regalo",
        attributes: [attribute("Tipo", "Accesorios")],
      }),
    ),
    false,
  );
});

test("classification remains deterministic regardless of input order", () => {
  const products = [
    perfume({ id: "b", name: "Beta", slug: "beta", transfer_price: 20 }),
    perfume({ id: "a", name: "Alfa", slug: "alfa", transfer_price: 10 }),
  ];
  const expected = ["Alfa", "Beta"];
  assert.deepEqual(
    recommendPerfumeGroups(products, { gender: "masculino" }).primaryRecommendations.map(
      (item) => item.product.name,
    ),
    expected,
  );
  assert.deepEqual(
    recommendPerfumeGroups(products.toReversed(), { gender: "masculino" }).primaryRecommendations.map(
      (item) => item.product.name,
    ),
    expected,
  );
});

test("applies independent configurable limits to every group", () => {
  const products = [
    perfume({ id: "p1", stock: 1 }),
    perfume({ id: "p2", stock: 1 }),
    perfume({ id: "u1", stock: 0 }),
    perfume({ id: "u2", stock: 0 }),
    perfume({
      id: "s1",
      attributes: [attribute("gender", "masculino"), attribute("Tipo", "Perfume")],
    }),
    perfume({
      id: "s2",
      attributes: [attribute("gender", "masculino"), attribute("Tipo", "Perfume")],
    }),
    perfume({
      id: "d1",
      name: "Decant Uno",
      attributes: [attribute("gender", "masculino"), attribute("Tipo", "Accesorios")],
    }),
    perfume({
      id: "d2",
      name: "Decant Dos",
      attributes: [attribute("gender", "masculino"), attribute("Tipo", "Accesorios")],
    }),
  ];
  const groups = recommendPerfumeGroups(
    products,
    { gender: "masculino", intensity: "intensa" },
    { limits: { primary: 1, secondary: 1, unavailable: 1, decants: 1 } },
  );
  assert.equal(groups.primaryRecommendations.length, 1);
  assert.equal(groups.secondaryRecommendations.length, 1);
  assert.equal(groups.unavailableRecommendations.length, 1);
  assert.equal(groups.decantRecommendations.length, 1);
});

test("no full perfume available does not promote a decant", () => {
  const decant = perfume({
    name: "Decant Único",
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Accesorios")],
  });
  const groups = recommendPerfumeGroups([decant], { gender: "masculino" });
  assert.deepEqual(groups.primaryRecommendations, []);
  assert.equal(groups.decantRecommendations.length, 1);
});

test("only decants available is a valid grouped result", () => {
  const decant = perfume({
    name: "Decant Único",
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Accesorios")],
  });
  const groups = recommendPerfumeGroups([decant], { gender: "masculino" });
  assert.deepEqual(groups.primaryRecommendations, []);
  assert.deepEqual(groups.unavailableRecommendations, []);
  assert.equal(groups.decantRecommendations.length, 1);
});

test("no decants available leaves only the applicable full-perfume group", () => {
  const groups = recommendPerfumeGroups([perfume()], { gender: "masculino" });
  assert.equal(groups.primaryRecommendations.length, 1);
  assert.deepEqual(groups.decantRecommendations, []);
});

test("all commercial groups may be empty", () => {
  const groups = recommendPerfumeGroups([perfume()], { gender: "femenino" });
  assert.deepEqual(groups, {
    primaryRecommendations: [],
    secondaryRecommendations: [],
    unavailableRecommendations: [],
    decantRecommendations: [],
  });
});

test("classifies exact commercial threshold boundaries", () => {
  assert.equal(getPerfumeRecommendationTier(100), "primary");
  assert.equal(getPerfumeRecommendationTier(70), "primary");
  assert.equal(getPerfumeRecommendationTier(69.99), "secondary");
  assert.equal(getPerfumeRecommendationTier(40), "secondary");
  assert.equal(getPerfumeRecommendationTier(39.99), "hidden");
});

test(">=70 percent appears in primary", () => {
  const result = recommendPerfumeGroups([perfume()], {
    gender: "masculino",
    olfactoryFamilies: ["dulce", "frutal"],
    intensity: "intensa",
    occasions: ["noche"],
  });
  assert.equal(result.primaryRecommendations[0].matchPercentage, 87.5);
});

test("40 to 69.99 percent appears in secondary", () => {
  const result = recommendPerfumeGroups([perfume()], {
    gender: "masculino",
    intensity: "media",
  });
  assert.equal(result.secondaryRecommendations[0].matchPercentage, 50);
  assert.deepEqual(result.primaryRecommendations, []);
});

test("an exact 40 percent match remains secondary", () => {
  const result = recommendPerfumeGroups([perfume({ transfer_price: 120_000 })], {
    gender: "masculino",
    olfactoryFamilies: ["frutal"],
    intensity: "intensa",
    occasions: ["diario"],
    maxTransferPrice: 100_000,
  });
  assert.equal(result.secondaryRecommendations[0].matchPercentage, 40);
});

test("below 40 percent is hidden from every commercial group", () => {
  const preferences = {
    gender: "masculino",
    intensity: "media",
    occasions: ["diario", "trabajo"],
  };
  assert.equal(first(preferences).matchPercentage, 33.33);
  assert.deepEqual(recommendPerfumeGroups([perfume()], preferences), {
    primaryRecommendations: [],
    secondaryRecommendations: [],
    unavailableRecommendations: [],
    decantRecommendations: [],
  });
});

test("a decant at or above 40 percent appears only in decants", () => {
  const decant = perfume({
    name: "Decant Ejemplo",
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Accesorios")],
  });
  const result = recommendPerfumeGroups([decant], {
    gender: "masculino",
    intensity: "intensa",
  });
  assert.equal(result.decantRecommendations[0].matchPercentage, 50);
  assert.deepEqual(result.primaryRecommendations, []);
  assert.deepEqual(result.secondaryRecommendations, []);
});

test("a decant below 40 percent is hidden", () => {
  const decant = perfume({
    name: "Decant Ejemplo",
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Accesorios")],
  });
  const result = recommendPerfumeGroups([decant], {
    gender: "masculino",
    intensity: "media",
    occasions: ["diario"],
  });
  assert.deepEqual(result.decantRecommendations, []);
});

test("a perfect decant does not displace a qualifying full perfume", () => {
  const full = perfume({ id: "full" });
  const decant = perfume({
    id: "decant",
    name: "Decant Perfecto",
    attributes: [
      ...full.attributes.filter((item) => item.name !== "Tipo"),
      attribute("Tipo", "Accesorios"),
    ],
  });
  const result = recommendPerfumeGroups([decant, full], {
    gender: "masculino",
    olfactoryFamilies: ["dulce", "frutal"],
    intensity: "intensa",
    occasions: ["noche"],
  });
  assert.equal(result.primaryRecommendations[0].product.id, "full");
  assert.equal(result.decantRecommendations[0].product.id, "decant");
});

test("a 66.67 percent full perfume is secondary, never primary", () => {
  const result = recommendPerfumeGroups([perfume()], {
    gender: "masculino",
    intensity: "intensa",
    occasions: ["diario"],
  });
  assert.equal(result.secondaryRecommendations[0].matchPercentage, 66.67);
  assert.deepEqual(result.primaryRecommendations, []);
});

test("an unavailable perfume must meet the primary threshold", () => {
  const strong = perfume({ id: "strong", stock: 0 });
  const weak = perfume({
    id: "weak",
    stock: 0,
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Perfume")],
  });
  const result = recommendPerfumeGroups([weak, strong], {
    gender: "masculino",
    intensity: "intensa",
  });
  assert.deepEqual(
    result.unavailableRecommendations.map((item) => item.product.id),
    ["strong"],
  );
});

test("ranking stays intact within primary and secondary groups", () => {
  const cheaperPrimary = perfume({ id: "p1", transfer_price: 10 });
  const expensivePrimary = perfume({ id: "p2", transfer_price: 20 });
  const cheaperSecondary = perfume({
    id: "s1",
    transfer_price: 10,
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Perfume")],
  });
  const expensiveSecondary = perfume({
    id: "s2",
    transfer_price: 20,
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Perfume")],
  });
  const result = recommendPerfumeGroups(
    [expensiveSecondary, expensivePrimary, cheaperSecondary, cheaperPrimary],
    { gender: "masculino", intensity: "intensa" },
  );
  assert.deepEqual(
    result.primaryRecommendations.map((item) => item.product.id),
    ["p1", "p2"],
  );
  assert.deepEqual(
    result.secondaryRecommendations.map((item) => item.product.id),
    ["s1", "s2"],
  );
});

test("inStockOnly keeps secondary stock and removes unavailable", () => {
  const secondary = perfume({
    id: "secondary",
    stock: 1,
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Perfume")],
  });
  const unavailable = perfume({ id: "unavailable", stock: 0 });
  const result = recommendPerfumeGroups([secondary, unavailable], {
    gender: "masculino",
    intensity: "intensa",
    inStockOnly: true,
  });
  assert.equal(result.secondaryRecommendations[0].product.id, "secondary");
  assert.deepEqual(result.unavailableRecommendations, []);
});

test("no secondary matches leaves a valid empty secondary group", () => {
  const result = recommendPerfumeGroups([perfume()], { gender: "masculino" });
  assert.deepEqual(result.secondaryRecommendations, []);
});

test("only qualifying decants remains a valid result", () => {
  const decant = perfume({
    name: "Decant Único",
    attributes: [attribute("gender", "masculino"), attribute("Tipo", "Accesorios")],
  });
  const result = recommendPerfumeGroups([decant], { gender: "masculino" });
  assert.deepEqual(result.primaryRecommendations, []);
  assert.deepEqual(result.secondaryRecommendations, []);
  assert.deepEqual(result.unavailableRecommendations, []);
  assert.equal(result.decantRecommendations.length, 1);
});
