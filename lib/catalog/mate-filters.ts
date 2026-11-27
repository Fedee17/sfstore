import type {
  CatalogCategoryOption,
  CatalogFilterGroup,
} from "@/components/catalog/catalog-sidebar";
import {
  MATE_COLOR_OPTIONS,
  MATE_MATERIAL_OPTIONS,
  MATE_TYPE_OPTIONS,
  MATE_USE_CASE_OPTIONS,
} from "@/lib/catalog/attribute-config";
import { normalizeTaxonomyValue } from "@/lib/product-taxonomy";
import { MATERO_SUBCATEGORIES } from "@/lib/catalog/matero-taxonomy";

// Menu entries come from the shared matero taxonomy, in its order.
export const MATE_CATALOG_CATEGORIES: CatalogCategoryOption[] = MATERO_SUBCATEGORIES.flatMap(({ slug, menu }) =>
  menu ? [{ label: menu.label, hrefValue: menu.hrefValue, matchValue: slug }] : []);

export const MATE_FILTERS_BY_CATEGORY: Record<string, CatalogFilterGroup[]> = {
  mates: [
    {
      label: "Tipo",
      param: "tipo",
      options: [...MATE_TYPE_OPTIONS],
    },
    {
      label: "Material",
      param: "material",
      options: [...MATE_MATERIAL_OPTIONS],
    },
    {
      label: "Color",
      param: "color",
      options: [...MATE_COLOR_OPTIONS],
    },
    {
      label: "Uso",
      param: "uso",
      options: [...MATE_USE_CASE_OPTIONS],
    },
  ],
};

export function normalizeMateCategory(value: string) {
  const normalized = normalizeTaxonomyValue(value);
  const category = MATE_CATALOG_CATEGORIES.find(
    (item) =>
      item.hrefValue === normalized || item.matchValue === normalized,
  );

  return category?.matchValue ?? normalized;
}
