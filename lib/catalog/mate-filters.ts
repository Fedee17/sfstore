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

export const MATE_CATALOG_CATEGORIES: CatalogCategoryOption[] = [
  { label: "Mates", hrefValue: "mates", matchValue: "mates" },
  { label: "Termos", hrefValue: "termos", matchValue: "termos" },
  { label: "Bombillas", hrefValue: "bombillas", matchValue: "bombillas" },
  { label: "Bombillones", hrefValue: "bombillones", matchValue: "bombillones" },
  { label: "Materas", hrefValue: "materas", matchValue: "materas" },
  { label: "Yerbas", hrefValue: "yerbas", matchValue: "yerbas" },
  {
    label: "Latas de yerba",
    hrefValue: "latas-yerba",
    matchValue: "latas-de-yerba",
  },
  {
    label: "Dispenser de yerba",
    hrefValue: "dispenser-yerba",
    matchValue: "dispenser-de-yerba",
  },
  {
    label: "Despolvilladores",
    hrefValue: "despolvilladores",
    matchValue: "despolvilladores",
  },
  { label: "Porta mate", hrefValue: "porta-mate", matchValue: "porta-mate" },
  {
    label: "Combos materos",
    hrefValue: "combos-materos",
    matchValue: "combos-materos",
  },
  {
    label: "Box/regalos materos",
    hrefValue: "box-regalos-materos",
    matchValue: "box-regalos-materos",
  },
];

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
