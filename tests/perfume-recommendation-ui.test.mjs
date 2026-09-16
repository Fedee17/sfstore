import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));

function compileModule(path) {
  return ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const configUrl = `data:text/javascript;base64,${Buffer.from(compileModule(
  join(testDirectory, "..", "lib", "catalog", "attribute-config.ts"),
)).toString("base64")}`;
const querySource = compileModule(
  join(testDirectory, "..", "lib", "admin", "perfume-recommendation-query.ts"),
).replace('from "@/lib/catalog/attribute-config"', `from "${configUrl}"`);
const reasonsSource = compileModule(
  join(testDirectory, "..", "lib", "admin", "perfume-recommendation-reasons.ts"),
).replace('from "@/lib/catalog/attribute-config"', `from "${configUrl}"`);
const engineSource = compileModule(
  join(testDirectory, "..", "lib", "catalog", "perfume-recommendation.ts"),
).replace('from "./attribute-config.ts"', `from "${configUrl}"`);

const {
  getConsultationMode,
  getEligiblePerfumeRecommendationProducts,
  hasEffectivePerfumePreferences,
  parsePerfumeRecommendationPreferences,
} = await import(
  `data:text/javascript;base64,${Buffer.from(querySource).toString("base64")}`
);
const { getPerfumeRecommendationReasons } = await import(
  `data:text/javascript;base64,${Buffer.from(reasonsSource).toString("base64")}`
);
const { recommendPerfumeGroups } = await import(
  `data:text/javascript;base64,${Buffer.from(engineSource).toString("base64")}`
);

test("empty query params produce no recommendation preferences", () => {
  assert.deepEqual(parsePerfumeRecommendationPreferences({}), {});
  assert.equal(getConsultationMode({}), "search");
});

test("gender is parsed from the central allowed values", () => {
  assert.deepEqual(parsePerfumeRecommendationPreferences({ gender: "UNISEX" }), {
    gender: "unisex",
  });
});

test("multiple families are normalized, deduplicated and validated", () => {
  assert.deepEqual(
    parsePerfumeRecommendationPreferences({
      family: ["Fresco", "dulce,frutal", "fresco", "desconocida"],
    }),
    { olfactoryFamilies: ["fresco", "dulce", "frutal"] },
  );
});

test("intensity is parsed as a single valid option", () => {
  assert.deepEqual(
    parsePerfumeRecommendationPreferences({ intensity: "Intensa" }),
    { intensity: "intensa" },
  );
});

test("multiple occasions are parsed without unknown values", () => {
  assert.deepEqual(
    parsePerfumeRecommendationPreferences({
      occasion: ["diario", "salida", "inventada"],
    }),
    { occasions: ["diario", "salida"] },
  );
});

test("a valid positive budget becomes maxTransferPrice", () => {
  assert.deepEqual(parsePerfumeRecommendationPreferences({ budget: "60000" }), {
    maxTransferPrice: 60_000,
  });
});

test("invalid budgets and unknown params are ignored", () => {
  assert.deepEqual(
    parsePerfumeRecommendationPreferences({
      budget: "no-es-un-numero",
      unknown: "value",
    }),
    {},
  );
  assert.deepEqual(parsePerfumeRecommendationPreferences({ budget: "-10" }), {});
});

test("effective preferences require at least one commercial criterion", () => {
  assert.equal(hasEffectivePerfumePreferences({}), false);
  assert.equal(
    hasEffectivePerfumePreferences({ olfactoryFamilies: [] }),
    false,
  );
  assert.equal(
    hasEffectivePerfumePreferences({ occasions: ["diario"] }),
    true,
  );
  assert.equal(
    hasEffectivePerfumePreferences({ maxTransferPrice: 60_000 }),
    true,
  );
});

function product(overrides = {}) {
  return {
    id: "product-1",
    name: "Perfume",
    slug: "perfume",
    status: "active",
    stock: 2,
    price: 100_000,
    transfer_price: 80_000,
    category: { id: "perfumes", name: "Perfumes", slug: "perfumes" },
    attributes: [
      { name: "gender", value: "unisex" },
      { name: "olfactory_family", value: "fresco" },
      { name: "occasion", value: "diario" },
      { name: "Tipo", value: "Perfume" },
    ],
    ...overrides,
  };
}

test("only active products are eligible for guided recommendations", () => {
  const eligible = getEligiblePerfumeRecommendationProducts([
    product({ id: "active" }),
    product({ id: "draft", status: "draft" }),
    product({ id: "archived", status: "archived" }),
  ]);
  assert.deepEqual(eligible.map((item) => item.id), ["active"]);
});

test("active out-of-stock products can remain in unavailable recommendations", () => {
  const groups = recommendPerfumeGroups(
    getEligiblePerfumeRecommendationProducts([
      product({ id: "available", stock: 2 }),
      product({ id: "unavailable", stock: 0 }),
      product({ id: "draft", stock: 2, status: "draft" }),
    ]),
    { gender: "unisex" },
  );
  assert.deepEqual(
    groups.primaryRecommendations.map((item) => item.product.id),
    ["available"],
  );
  assert.deepEqual(
    groups.unavailableRecommendations.map((item) => item.product.id),
    ["unavailable"],
  );
});

test("decants stay in their separate commercial group", () => {
  const groups = recommendPerfumeGroups(
    getEligiblePerfumeRecommendationProducts([
      product({ id: "full" }),
      product({
        id: "decant",
        name: "Decant Perfume",
        attributes: [
          { name: "gender", value: "unisex" },
          { name: "Tipo", value: "Decant" },
        ],
      }),
    ]),
    { gender: "unisex" },
  );
  assert.deepEqual(
    groups.primaryRecommendations.map((item) => item.product.id),
    ["full"],
  );
  assert.deepEqual(
    groups.decantRecommendations.map((item) => item.product.id),
    ["decant"],
  );
});

function recommendation(matches) {
  return {
    product: product(),
    type: "Perfume",
    score: 1,
    maxScore: 1,
    matchPercentage: 100,
    matches,
    matchedCriteria: Object.keys(matches),
  };
}

test("commercial reasons are generated only from real positive matches", () => {
  const reasons = getPerfumeRecommendationReasons(
    recommendation({
      olfactoryFamily: {
        requested: ["fresco", "dulce"],
        actual: ["fresco"],
        matchedValues: ["fresco"],
        score: 0.5,
        matched: true,
      },
      intensity: {
        requested: "intensa",
        actual: "media",
        score: 0,
        matched: false,
      },
      occasion: {
        requested: ["diario"],
        actual: ["diario"],
        matchedValues: ["diario"],
        score: 1,
        matched: true,
      },
      price: {
        max: 60_000,
        actual: 55_000,
        relation: "within",
        score: 1,
        matched: true,
      },
    }),
    5,
  );
  assert.deepEqual(reasons, [
    "Fresco",
    "Ideal para todos los días",
    "Dentro de tu presupuesto",
  ]);
  assert.equal(reasons.includes("Intensidad media"), false);
});

test("visible commercial reasons have a configurable conservative limit", () => {
  const reasons = getPerfumeRecommendationReasons(
    recommendation({
      olfactoryFamily: {
        requested: ["fresco", "dulce"],
        actual: ["fresco", "dulce"],
        matchedValues: ["fresco", "dulce"],
        score: 1,
        matched: true,
      },
      intensity: {
        requested: "intensa",
        actual: "intensa",
        score: 1,
        matched: true,
      },
      occasion: {
        requested: ["salida"],
        actual: ["salida"],
        matchedValues: ["salida"],
        score: 1,
        matched: true,
      },
    }),
  );
  assert.equal(reasons.length, 3);
});

test("Consulta stays protected and does not recommend without criteria", () => {
  const page = readFileSync(
    join(testDirectory, "..", "app", "admin", "consulta", "page.tsx"),
    "utf8",
  );
  assert.match(page, /await requireAdminSession\(\)/);
  assert.match(page, /mode === "recommend" && hasPreferences/);
  assert.match(page, /recommendPerfumeGroups\(/);
});

test("Consulta keeps one cost-free catalog read and the existing quick search", () => {
  const service = readFileSync(
    join(testDirectory, "..", "services", "admin-catalog.ts"),
    "utf8",
  );
  const quickView = readFileSync(
    join(
      testDirectory,
      "..",
      "components",
      "admin",
      "consulta",
      "quick-catalog-view.tsx",
    ),
    "utf8",
  );
  const page = readFileSync(
    join(testDirectory, "..", "app", "admin", "consulta", "page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(service, /\bcost\b/);
  assert.equal(page.match(/getQuickCatalogProducts\(\)/g)?.length, 1);
  assert.match(quickView, /filterQuickCatalogProducts\(/);
});
