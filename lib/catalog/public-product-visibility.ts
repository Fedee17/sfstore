export type PublicCatalogSection = "perfumes" | "mates";

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

  return categorySlug === "perfumes" ? "perfumes" : "mates";
}
