import type { SupportedProductSheet } from "@/lib/product-import/types";

export const PRODUCT_IMPORT_SLUG_ALIASES = Object.freeze({
  "bombillas-plana": "bombillas",
  "lattafa-qaed-al-fursan-untamed": "qaed-al-fursan-untamed",
} satisfies Readonly<Record<string, string>>);

export function resolveProductImportSlugAlias(
  sourceSheet: SupportedProductSheet,
  sourceSlug: string,
) {
  if (sourceSheet !== "Precios Productos") return sourceSlug;
  return PRODUCT_IMPORT_SLUG_ALIASES[
    sourceSlug as keyof typeof PRODUCT_IMPORT_SLUG_ALIASES
  ] ?? sourceSlug;
}

export function getProductImportLookupSlugs(
  sourceSheet: SupportedProductSheet,
  sourceSlug: string,
  previousSourceSlug?: string,
) {
  return [sourceSlug, previousSourceSlug]
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => resolveProductImportSlugAlias(sourceSheet, slug))
    .filter((slug, index, slugs) => slugs.indexOf(slug) === index);
}

export function selectExistingProductForImport<T extends { slug: string }>(
  products: readonly T[],
  sourceSheet: SupportedProductSheet,
  sourceSlug: string,
  previousSourceSlug?: string,
) {
  const lookupSlugs = getProductImportLookupSlugs(
    sourceSheet,
    sourceSlug,
    previousSourceSlug,
  );
  return lookupSlugs
    .map((slug) => products.find((product) => product.slug === slug))
    .find((product): product is T => Boolean(product)) ?? null;
}
