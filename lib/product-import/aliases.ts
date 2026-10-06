import type { SupportedProductSheet } from "@/lib/product-import/types";

import { getYaraRosaCanonicalId, YARA_ROSA } from "../products/yara-rosa-consolidation.ts";

export const PRODUCT_IMPORT_SLUG_ALIASES = Object.freeze({
  "bombillas-plana": "bombillas",
  "lattafa-qaed-al-fursan-untamed": "qaed-al-fursan-untamed",
} satisfies Readonly<Record<string, string>>);

export function resolveProductImportSlugAlias(
  sourceSheet: SupportedProductSheet,
  sourceSlug: string,
) {
  if (getYaraRosaCanonicalId(sourceSlug)) return YARA_ROSA.canonicalSlug;
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

export function selectExistingProductForImport<T extends { slug: string; id?: string }>(
  products: readonly T[],
  sourceSheet: SupportedProductSheet,
  sourceSlug: string,
  previousSourceSlug?: string,
) {
  const canonicalId = getYaraRosaCanonicalId(sourceSlug) ??
    (previousSourceSlug ? getYaraRosaCanonicalId(previousSourceSlug) : null);
  if (canonicalId) {
    const canonical = products.find((product) => product.id === canonicalId && product.slug === YARA_ROSA.canonicalSlug);
    if (!canonical) throw new Error("No se encontro la identidad canonica de Yara Rosa. Revisar manualmente; no crear ni usar el duplicado.");
    return canonical;
  }
  const lookupSlugs = getProductImportLookupSlugs(
    sourceSheet,
    sourceSlug,
    previousSourceSlug,
  );
  return lookupSlugs
    .map((slug) => products.find((product) => product.slug === slug))
    .find((product): product is T => Boolean(product)) ?? null;
}

export function preserveCanonicalImportIdentity<T extends { name: string; slug: string }>(
  row: T,
  existing: { id: string; name: string; slug: string } | null,
): T {
  return existing?.id === YARA_ROSA.canonicalId
    ? { ...row, name: existing.name, slug: existing.slug }
    : row;
}
