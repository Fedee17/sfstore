import type {
  CatalogCategoryOption,
  CatalogFilterGroup,
} from "@/components/catalog/catalog-sidebar";
import {
  PERFUME_COMMERCIAL_CATEGORY_OPTIONS,
  PERFUME_GENDER_OPTIONS,
  PERFUME_INTENSITY_OPTIONS,
  PERFUME_OCCASION_OPTIONS,
  PERFUME_OLFACTORY_FAMILY_OPTIONS,
} from "@/lib/catalog/attribute-config";
import { normalizeTaxonomyValue } from "@/lib/product-taxonomy";

export const PERFUME_CATALOG_CATEGORIES: CatalogCategoryOption[] =
  PERFUME_COMMERCIAL_CATEGORY_OPTIONS.map((item) => ({
    label: item.label,
    hrefValue: item.value,
    matchValue: item.value,
  }));

const PERFUME_ATTRIBUTE_FILTERS: CatalogFilterGroup[] = [
  {
    label: "Familia olfativa",
    param: "familia",
    options: [...PERFUME_OLFACTORY_FAMILY_OPTIONS],
  },
  {
    label: "Intensidad",
    param: "intensidad",
    options: [...PERFUME_INTENSITY_OPTIONS],
  },
  {
    label: "Momento",
    param: "momento",
    options: [...PERFUME_OCCASION_OPTIONS],
  },
  {
    label: "Género",
    param: "genero",
    options: [...PERFUME_GENDER_OPTIONS],
  },
];

export const PERFUME_FILTERS_BY_CATEGORY: Record<
  string,
  CatalogFilterGroup[]
> = Object.fromEntries(
  PERFUME_CATALOG_CATEGORIES.map((category) => [
    category.matchValue,
    PERFUME_ATTRIBUTE_FILTERS,
  ]),
);

const legacyCategoryValues = new Map(
  PERFUME_COMMERCIAL_CATEGORY_OPTIONS.map((item) => [
    normalizeTaxonomyValue(item.label),
    item.value,
  ]),
);

export function normalizePerfumeCategory(value: string) {
  const normalized = normalizeTaxonomyValue(value);
  const directMatch = PERFUME_CATALOG_CATEGORIES.find(
    (item) => item.hrefValue === normalized,
  );

  return directMatch?.matchValue ?? legacyCategoryValues.get(normalized) ?? normalized;
}
