import { revalidatePath, revalidateTag } from "next/cache";

/** Tag of the cached public catalog reads (header suggestions, cart price/stock check). */
export const PUBLIC_CATALOG_CACHE_TAG = "public-catalog";

/** Expire the tagged public catalog caches now: the next request reads fresh data instead of serving stale. */
export function revalidatePublicCatalogCaches() {
  revalidateTag(PUBLIC_CATALOG_CACHE_TAG, { expire: 0 });
}

const SECTION_PATHS = ["/perfumes", "/mates", "/accesorios"];

/**
 * After an admin write to a public product: its page (and previous slug), home, sitemap, the affected sections and the
 * tagged caches. Without categorySlugs (e.g. a spreadsheet sync that does not report them) every section is refreshed.
 */
export function revalidateProductPaths({
  productId,
  slug,
  previousSlug,
  categorySlugs,
}: {
  productId?: string;
  slug: string;
  previousSlug?: string;
  categorySlugs?: Array<string | null | undefined>;
}) {
  const paths = new Set(["/admin/productos", "/admin/consulta", "/", "/sitemap.xml", `/producto/${slug}`]);
  if (productId) paths.add(`/admin/productos/${productId}/editar`);
  if (previousSlug && previousSlug !== slug) paths.add(`/producto/${previousSlug}`);

  if (!categorySlugs) {
    for (const path of SECTION_PATHS) paths.add(path);
  } else {
    for (const categorySlug of categorySlugs) {
      if (!categorySlug) continue;
      paths.add("/accesorios");
      paths.add(categorySlug === "perfumes" ? "/perfumes" : "/mates");
    }
  }

  for (const path of paths) revalidatePath(path);
  revalidatePublicCatalogCaches();
}
