import { isMateroSubcategory } from "./matero-taxonomy.ts";

export type PublicCatalogSection = "perfumes" | "mates" | "accesorios";

export const publicCategoryLabels = { perfumes: "Perfumes", mates: "Mates y termos", accesorios: "Accesorios" } as const;
export const publicCategoryPaths = { perfumes: "/perfumes", mates: "/mates", accesorios: "/accesorios" } as const;


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
  // A non-perfume category is not necessarily a mate: only the shared matero taxonomy decides.
  return isMateroSubcategory(categorySlug) ? "mates" : "accesorios";
}
