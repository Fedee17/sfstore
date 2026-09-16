import {
  PERFUME_GENDER_OPTIONS,
  PERFUME_INTENSITY_OPTIONS,
  PERFUME_OCCASION_OPTIONS,
  PERFUME_OLFACTORY_FAMILY_OPTIONS,
  normalizeCatalogAttributeValue,
} from "@/lib/catalog/attribute-config";
import type {
  PerfumeRecommendationPreferences,
  PerfumeRecommendationProduct,
} from "@/lib/catalog/perfume-recommendation";

export type ConsultationSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type ConsultationMode = "search" | "recommend";

function valuesFor(params: ConsultationSearchParams, key: string) {
  const value = params[key];
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function allowedValues(options: readonly { value: string }[]) {
  return new Set(options.map((option) => option.value));
}

function parseSingleOption(
  params: ConsultationSearchParams,
  key: string,
  options: readonly { value: string }[],
) {
  const allowed = allowedValues(options);
  return (
    valuesFor(params, key)
      .map(normalizeCatalogAttributeValue)
      .find((value) => allowed.has(value)) ?? undefined
  );
}

function parseMultipleOptions(
  params: ConsultationSearchParams,
  key: string,
  options: readonly { value: string }[],
) {
  const allowed = allowedValues(options);
  return [
    ...new Set(
      valuesFor(params, key)
        .map(normalizeCatalogAttributeValue)
        .filter((value) => allowed.has(value)),
    ),
  ];
}

function parsePositiveNumber(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function getConsultationMode(
  params: ConsultationSearchParams,
): ConsultationMode {
  return valuesFor(params, "mode")[0] === "recommend"
    ? "recommend"
    : "search";
}

export function parsePerfumeRecommendationPreferences(
  params: ConsultationSearchParams,
): PerfumeRecommendationPreferences {
  const gender = parseSingleOption(
    params,
    "gender",
    PERFUME_GENDER_OPTIONS,
  );
  const olfactoryFamilies = parseMultipleOptions(
    params,
    "family",
    PERFUME_OLFACTORY_FAMILY_OPTIONS,
  );
  const intensity = parseSingleOption(
    params,
    "intensity",
    PERFUME_INTENSITY_OPTIONS,
  );
  const occasions = parseMultipleOptions(
    params,
    "occasion",
    PERFUME_OCCASION_OPTIONS,
  );
  const maxTransferPrice = parsePositiveNumber(valuesFor(params, "budget")[0]);

  return {
    ...(gender ? { gender } : {}),
    ...(olfactoryFamilies.length > 0 ? { olfactoryFamilies } : {}),
    ...(intensity ? { intensity } : {}),
    ...(occasions.length > 0 ? { occasions } : {}),
    ...(maxTransferPrice ? { maxTransferPrice } : {}),
  };
}

export function hasEffectivePerfumePreferences(
  preferences: PerfumeRecommendationPreferences,
) {
  return Boolean(
    preferences.gender ||
      preferences.olfactoryFamilies?.length ||
      preferences.intensity ||
      preferences.occasions?.length ||
      (Number.isFinite(preferences.maxTransferPrice) &&
        Number(preferences.maxTransferPrice) > 0),
  );
}

export function getEligiblePerfumeRecommendationProducts<
  T extends PerfumeRecommendationProduct,
>(products: T[]) {
  return products.filter((product) => product.status === "active");
}
