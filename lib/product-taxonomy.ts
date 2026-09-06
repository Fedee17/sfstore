export const PERFUME_COMMERCIAL_CATEGORIES = [
  "Para hacer sentir presencia",
  "Para usar todos los días",
  "Frescos y versátiles",
  "Dulces y llamativos",
  "Elegantes y nocturnos",
  "Para salir de lo habitual",
  "Para regalar bien",
  "Decants para probar",
] as const;

export const MATE_PRODUCT_TYPES = [
  "Mates",
  "Termos",
  "Bombillas",
  "Bombillones",
  "Materas",
  "Yerbas",
  "Latas de yerba",
  "Dispenser de yerba",
  "Despolvilladores",
  "Porta mate",
  "Combos materos",
  "Box/regalos materos",
] as const;

export const MATE_PUBLIC_CATEGORY_SLUGS = [
  "mates",
  "termos",
  "bombillas",
  "bombillones",
  "materas",
  "yerbas",
  "latas-de-yerba",
  "dispenser-de-yerba",
  "despolvilladores",
  "porta-mate",
  "combos-materos",
  "box-regalos-materos",
  "accesorios",
] as const;

export const PRODUCT_ATTRIBUTE_NAMES = {
  brand: "Marca",
  type: "Tipo",
  commercialCategory: "Categoría comercial",
} as const;

type ProductAttribute = {
  name: string;
  value: string;
};

export function getProductAttribute(
  attributes: ProductAttribute[] | null | undefined,
  name: string,
) {
  return attributes?.find((attribute) => attribute.name === name)?.value ?? "";
}

export function getPerfumeCommercialCategory(
  attributes: ProductAttribute[] | null | undefined,
) {
  const values = getCatalogAttributeValues(
    attributes,
    CATALOG_ATTRIBUTE_KEYS.commercialCategory,
  );

  return values
    .map(
      (value) =>
        PERFUME_COMMERCIAL_CATEGORY_OPTIONS.find(
          (option) => option.value === value,
        )?.label ?? value,
    )
    .join(", ");
}

export function getMateProductType(
  attributes: ProductAttribute[] | null | undefined,
  categoryName?: string | null,
) {
  const type = getProductAttribute(attributes, PRODUCT_ATTRIBUTE_NAMES.type);
  return type || categoryName || "";
}

export function slugifyTaxonomyValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeTaxonomyValue(value: string) {
  return slugifyTaxonomyValue(value);
}
import {
  CATALOG_ATTRIBUTE_KEYS,
  getCatalogAttributeValues,
  PERFUME_COMMERCIAL_CATEGORY_OPTIONS,
} from "@/lib/catalog/attribute-config";
