import type {
  CatalogCategoryOption,
  CatalogFilterGroup,
} from "@/components/catalog/catalog-sidebar";
import {
  CATALOG_ATTRIBUTE_KEYS,
  getCatalogAttributeField,
  getCatalogAttributeValues,
  normalizeCatalogAttributeValue,
  PERFUME_COMMERCIAL_CATEGORY_OPTIONS,
  PERFUME_GENDER_OPTIONS,
  PERFUME_INTENSITY_OPTIONS,
  PERFUME_OCCASION_OPTIONS,
  PERFUME_OLFACTORY_FAMILY_OPTIONS,
} from "@/lib/catalog/attribute-config";
import type { CatalogAttributeKey } from "@/lib/catalog/attribute-config";
import { normalizeTaxonomyValue } from "@/lib/product-taxonomy";

const retiredPerfumeCategories = new Set(["disenador", "de-disenador", "nicho", "otro"]);

export function isRetiredPerfumeCategory(value: string) {
  return retiredPerfumeCategories.has(normalizeTaxonomyValue(value));
}

export const PERFUME_CATALOG_CATEGORIES: CatalogCategoryOption[] =
  PERFUME_COMMERCIAL_CATEGORY_OPTIONS
    .filter(({ value }) => !retiredPerfumeCategories.has(value))
    .map((item) => ({
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

type FilterablePublication = {
  attributes?: { name: string; value: string }[] | null;
  variants?: FilterablePublication[];
};

/** A family publication matches when any of its SKUs does: its variants may differ, for example in volume. */
export function publicationHasCatalogAttribute(product: FilterablePublication, key: CatalogAttributeKey, value: string) {
  const wanted = normalizeCatalogAttributeValue(value);
  return [product, ...(product.variants ?? [])].some((sku) => getCatalogAttributeValues(sku.attributes, key).includes(wanted));
}

/** Perfume filters plus «Contenido», listing only the volumes loaded in the given catalog, smallest first. */
export function perfumeFiltersByCategory(products: readonly FilterablePublication[]): Record<string, CatalogFilterGroup[]> {
  const loaded = new Set(products.flatMap((product) => [product, ...(product.variants ?? [])])
    .flatMap((sku) => getCatalogAttributeValues(sku.attributes, CATALOG_ATTRIBUTE_KEYS.volume)));
  const options = (getCatalogAttributeField(CATALOG_ATTRIBUTE_KEYS.volume)?.options ?? []).filter((option) => loaded.has(option.value));
  const groups = options.length
    ? [...PERFUME_ATTRIBUTE_FILTERS, { label: "Contenido", param: "contenido", options: [...options] }]
    : PERFUME_ATTRIBUTE_FILTERS;
  return Object.fromEntries(Object.keys(PERFUME_FILTERS_BY_CATEGORY).map((category) => [category, groups]));
}

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
