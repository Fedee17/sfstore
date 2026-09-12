import {
  CATALOG_ATTRIBUTE_KEYS,
  getCatalogAttributeValues,
  normalizeCatalogAttributeValue,
  type CatalogAttribute,
} from "./attribute-config.ts";

export type PerfumeRecommendationPreferences = {
  gender?: string;
  olfactoryFamilies?: string[];
  intensity?: string;
  occasions?: string[];
  maxTransferPrice?: number;
  inStockOnly?: boolean;
  minMatchPercentage?: number;
};

export type PerfumeRecommendationProduct = {
  id: string;
  name: string;
  slug: string;
  sku?: string | null;
  status?: string;
  stock?: number | null;
  price?: number | null;
  transfer_price?: number | null;
  category?: {
    id?: string;
    name?: string;
    slug: string;
  } | null;
  attributes?: CatalogAttribute[] | null;
};

type ScoredMatch = {
  score: number;
  matched: boolean;
};

export type PerfumeRecommendationMatches = {
  gender?: ScoredMatch & {
    requested: string;
    actual: string | null;
    compatibility: "exact" | "unisex" | "none";
  };
  olfactoryFamily?: ScoredMatch & {
    requested: string[];
    actual: string[];
    matchedValues: string[];
  };
  intensity?: ScoredMatch & {
    requested: string;
    actual: string | null;
  };
  occasion?: ScoredMatch & {
    requested: string[];
    actual: string[];
    matchedValues: string[];
  };
  price?: ScoredMatch & {
    max: number;
    actual: number | null;
    relation: "within" | "within-10-percent" | "over" | "unavailable";
  };
};

export type PerfumeRecommendation<T extends PerfumeRecommendationProduct> = {
  product: T;
  type: string | null;
  score: number;
  maxScore: number;
  matchPercentage: number;
  matches: PerfumeRecommendationMatches;
  matchedCriteria: Array<keyof PerfumeRecommendationMatches>;
};

type NormalizedPreferences = {
  gender: string | null;
  olfactoryFamilies: string[];
  intensity: string | null;
  occasions: string[];
  maxTransferPrice: number | null;
  inStockOnly: boolean;
  minMatchPercentage: number | null;
};

function normalizeValues(values: string[] | undefined) {
  return [
    ...new Set(
      (values ?? [])
        .map(normalizeCatalogAttributeValue)
        .filter(Boolean),
    ),
  ];
}

function normalizePreferences(
  preferences: PerfumeRecommendationPreferences,
): NormalizedPreferences {
  const maxTransferPrice = Number(preferences.maxTransferPrice);
  const minMatchPercentage = Number(preferences.minMatchPercentage);
  return {
    gender: preferences.gender
      ? normalizeCatalogAttributeValue(preferences.gender)
      : null,
    olfactoryFamilies: normalizeValues(preferences.olfactoryFamilies),
    intensity: preferences.intensity
      ? normalizeCatalogAttributeValue(preferences.intensity)
      : null,
    occasions: normalizeValues(preferences.occasions),
    maxTransferPrice:
      Number.isFinite(maxTransferPrice) && maxTransferPrice > 0
        ? maxTransferPrice
        : null,
    inStockOnly: preferences.inStockOnly === true,
    minMatchPercentage: Number.isFinite(minMatchPercentage)
      ? Math.min(100, Math.max(0, minMatchPercentage))
      : null,
  };
}

function getLegacyType(attributes: CatalogAttribute[]) {
  return (
    attributes.find(
      (attribute) => normalizeCatalogAttributeValue(attribute.name) === "tipo",
    )?.value ?? null
  );
}

function proportionalMatch(requested: string[], actual: string[]) {
  const actualValues = new Set(actual);
  const matchedValues = requested.filter((value) => actualValues.has(value));
  return {
    matchedValues,
    score: matchedValues.length / requested.length,
  };
}

function scoreProduct<T extends PerfumeRecommendationProduct>(
  product: T,
  preferences: NormalizedPreferences,
): PerfumeRecommendation<T> {
  const attributes = product.attributes ?? [];
  const matches: PerfumeRecommendationMatches = {};
  let score = 0;
  let maxScore = 0;

  if (preferences.gender) {
    maxScore += 1;
    const actual =
      getCatalogAttributeValues(attributes, CATALOG_ATTRIBUTE_KEYS.gender)[0] ?? null;
    const exact = actual === preferences.gender;
    const unisexCompatible =
      actual === "unisex" &&
      (preferences.gender === "masculino" || preferences.gender === "femenino");
    const criterionScore = exact ? 1 : unisexCompatible ? 0.5 : 0;
    score += criterionScore;
    matches.gender = {
      requested: preferences.gender,
      actual,
      compatibility: exact ? "exact" : unisexCompatible ? "unisex" : "none",
      score: criterionScore,
      matched: criterionScore > 0,
    };
  }

  if (preferences.olfactoryFamilies.length > 0) {
    maxScore += 1;
    const actual = getCatalogAttributeValues(
      attributes,
      CATALOG_ATTRIBUTE_KEYS.olfactoryFamily,
    );
    const familyMatch = proportionalMatch(preferences.olfactoryFamilies, actual);
    score += familyMatch.score;
    matches.olfactoryFamily = {
      requested: preferences.olfactoryFamilies,
      actual,
      matchedValues: familyMatch.matchedValues,
      score: familyMatch.score,
      matched: familyMatch.score > 0,
    };
  }

  if (preferences.intensity) {
    maxScore += 1;
    const actual =
      getCatalogAttributeValues(attributes, CATALOG_ATTRIBUTE_KEYS.intensity)[0] ??
      null;
    const criterionScore = actual === preferences.intensity ? 1 : 0;
    score += criterionScore;
    matches.intensity = {
      requested: preferences.intensity,
      actual,
      score: criterionScore,
      matched: criterionScore > 0,
    };
  }

  if (preferences.occasions.length > 0) {
    maxScore += 1;
    const actual = getCatalogAttributeValues(
      attributes,
      CATALOG_ATTRIBUTE_KEYS.occasion,
    );
    const occasionMatch = proportionalMatch(preferences.occasions, actual);
    score += occasionMatch.score;
    matches.occasion = {
      requested: preferences.occasions,
      actual,
      matchedValues: occasionMatch.matchedValues,
      score: occasionMatch.score,
      matched: occasionMatch.score > 0,
    };
  }

  if (preferences.maxTransferPrice !== null) {
    maxScore += 1;
    const actual =
      product.transfer_price !== null && product.transfer_price !== undefined
        ? Number(product.transfer_price)
        : null;
    const validActual = actual !== null && Number.isFinite(actual) ? actual : null;
    const withinBudget =
      validActual !== null && validActual <= preferences.maxTransferPrice;
    const withinTenPercent =
      validActual !== null &&
      validActual <= preferences.maxTransferPrice * 1.1 + Number.EPSILON;
    const criterionScore = withinBudget ? 1 : withinTenPercent ? 0.5 : 0;
    score += criterionScore;
    matches.price = {
      max: preferences.maxTransferPrice,
      actual: validActual,
      relation:
        validActual === null
          ? "unavailable"
          : withinBudget
            ? "within"
            : withinTenPercent
              ? "within-10-percent"
              : "over",
      score: criterionScore,
      matched: criterionScore > 0,
    };
  }

  const matchPercentage =
    maxScore === 0 ? 0 : Math.round((score / maxScore) * 10_000) / 100;
  const matchedCriteria = (
    Object.entries(matches) as Array<
      [keyof PerfumeRecommendationMatches, ScoredMatch]
    >
  )
    .filter(([, match]) => match.score > 0)
    .map(([criterion]) => criterion);

  return {
    product,
    type: getLegacyType(attributes),
    score,
    maxScore,
    matchPercentage,
    matches,
    matchedCriteria,
  };
}

function compareRecommendations<T extends PerfumeRecommendationProduct>(
  first: PerfumeRecommendation<T>,
  second: PerfumeRecommendation<T>,
) {
  const firstStock = Number(first.product.stock ?? 0) > 0;
  const secondStock = Number(second.product.stock ?? 0) > 0;
  const firstPrice = first.product.transfer_price ?? Number.POSITIVE_INFINITY;
  const secondPrice = second.product.transfer_price ?? Number.POSITIVE_INFINITY;

  return (
    second.matchPercentage - first.matchPercentage ||
    second.score - first.score ||
    Number(secondStock) - Number(firstStock) ||
    firstPrice - secondPrice ||
    first.product.name.localeCompare(second.product.name, "es", {
      sensitivity: "base",
    }) ||
    first.product.slug.localeCompare(second.product.slug) ||
    first.product.id.localeCompare(second.product.id)
  );
}

export function recommendPerfumes<T extends PerfumeRecommendationProduct>(
  products: T[],
  rawPreferences: PerfumeRecommendationPreferences,
) {
  const preferences = normalizePreferences(rawPreferences);
  const hasExplicitThreshold = preferences.minMatchPercentage !== null;

  return products
    .filter((product) => product.category?.slug === "perfumes")
    .filter(
      (product) =>
        !preferences.inStockOnly || Number(product.stock ?? 0) > 0,
    )
    .map((product) => scoreProduct(product, preferences))
    .filter((recommendation) =>
      hasExplicitThreshold
        ? recommendation.matchPercentage >= preferences.minMatchPercentage!
        : recommendation.score > 0,
    )
    .sort(compareRecommendations);
}
