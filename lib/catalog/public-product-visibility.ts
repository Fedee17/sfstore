export type PublicCatalogSection = "perfumes" | "mates" | "accesorios";

export const publicCategoryLabels = { perfumes: "Perfumes", mates: "Mates y termos", accesorios: "Accesorios" } as const;
export const publicCategoryPaths = { perfumes: "/perfumes", mates: "/mates", accesorios: "/accesorios" } as const;

// A non-perfume category is not necessarily a mate. Keep the matero taxonomy explicit.
const materoCategories = new Set(["mates", "termos", "bombillas", "bombillones", "materas", "yerbas", "latas-de-yerba", "dispenser-de-yerba", "despolvilladores", "porta-mate", "combos-materos", "box-regalos-materos", "accesorios-materos", "vasos-termicos"]);

type PublicProductVisibility = {
  status: string;
  historicalIdentity: boolean;
  categorySlug: string | null | undefined;
  categoryIsActive: boolean;
};

export function resolvePublicCatalogSection({
  status,
  historicalIdentity,
  categorySlug,
  categoryIsActive,
}: PublicProductVisibility): PublicCatalogSection | null {
  if (
    status !== "active" ||
    historicalIdentity ||
    !categoryIsActive ||
    !categorySlug
  ) {
    return null;
  }

  if (categorySlug === "perfumes") return "perfumes";
  return materoCategories.has(categorySlug) ? "mates" : "accesorios";
}
