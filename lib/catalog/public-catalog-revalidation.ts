import { revalidatePath, revalidateTag } from "next/cache";

/** Tag of the cached public catalog reads (header suggestions, cart price/stock check). */
export const PUBLIC_CATALOG_CACHE_TAG = "public-catalog";

const SECTION_PATHS = ["/perfumes", "/mates", "/accesorios"];

/**
 * Cache invalidation after a write that is already committed. It never throws: a failure must not report a saved
 * sale, purchase, order or product as failed. One warning names the operation, without the internal error detail.
 * `publicCatalog` also expires the tagged public catalog caches at once (the next request reads fresh data).
 */
export function revalidateAfterWrite(operation: string, paths: Iterable<string>, { publicCatalog = false } = {}) {
  let failed = false;
  for (const path of new Set(paths)) {
    try { revalidatePath(path); } catch { failed = true; }
  }
  if (publicCatalog) {
    try { revalidateTag(PUBLIC_CATALOG_CACHE_TAG, { expire: 0 }); } catch { failed = true; }
  }
  if (failed) console.warn(`[cache] ${operation}: la operación quedó guardada; no se pudo actualizar la caché.`);
}

type WrittenProduct = {
  productId?: string;
  slug: string;
  previousSlug?: string;
  /** Without categories (e.g. a spreadsheet sync that does not report them) every section is refreshed. */
  categorySlugs?: Array<string | null | undefined>;
};

function productPaths({ productId, slug, previousSlug, categorySlugs }: WrittenProduct) {
  const paths = ["/admin/productos", "/admin/consulta", "/", "/sitemap.xml", `/producto/${slug}`];
  if (productId) paths.push(`/admin/productos/${productId}/editar`);
  if (previousSlug && previousSlug !== slug) paths.push(`/producto/${previousSlug}`);
  if (!categorySlugs) return [...paths, ...SECTION_PATHS];
  for (const categorySlug of categorySlugs) {
    if (!categorySlug) continue;
    paths.push("/accesorios", categorySlug === "perfumes" ? "/perfumes" : "/mates");
  }
  return paths;
}

/**
 * After an admin write to public products: their pages (and previous slugs), home, sitemap, the affected sections and
 * the tagged caches, as one batch so a bulk import revalidates each path and the tag once.
 */
export function revalidateProducts(operation: string, products: readonly WrittenProduct[], extraPaths: readonly string[] = []) {
  revalidateAfterWrite(operation, [...products.flatMap(productPaths), ...extraPaths], { publicCatalog: true });
}
