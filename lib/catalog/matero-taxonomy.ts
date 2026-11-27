// Single source of truth for the subcategories of the public «Mates» section (CAT-03, 26/11).
// Read by public-product-visibility (section), related-products (cross-sell) and mate-filters (storefront menu).
// To add a subcategory inside an existing kind, add one entry here; no other module changes.

/** Cross-sell kinds, in order of usefulness next to the product on screen. */
export const MATERO_KIND_ORDER = ["mates", "bombillas", "termos", "materas", "yerba", "otros", "regalos"] as const;
export type MateroKind = (typeof MATERO_KIND_ORDER)[number];

type MateroSubcategory = {
  slug: string;
  kind: MateroKind;
  /** Entry of the Mates menu; subcategories without it are public but not listed there. */
  menu?: { label: string; hrefValue: string };
};

/** Order: Mates menu order, and within a kind, the preference order of its subcategories in the cross-sell. */
export const MATERO_SUBCATEGORIES: readonly MateroSubcategory[] = [
  { slug: "mates", kind: "mates", menu: { label: "Mates", hrefValue: "mates" } },
  { slug: "termos", kind: "termos", menu: { label: "Termos", hrefValue: "termos" } },
  { slug: "vasos-termicos", kind: "termos" },
  { slug: "bombillas", kind: "bombillas", menu: { label: "Bombillas", hrefValue: "bombillas" } },
  { slug: "bombillones", kind: "bombillas", menu: { label: "Bombillones", hrefValue: "bombillones" } },
  { slug: "materas", kind: "materas", menu: { label: "Materas", hrefValue: "materas" } },
  { slug: "yerbas", kind: "yerba", menu: { label: "Yerbas", hrefValue: "yerbas" } },
  { slug: "latas-de-yerba", kind: "yerba", menu: { label: "Latas de yerba", hrefValue: "latas-yerba" } },
  { slug: "dispenser-de-yerba", kind: "yerba", menu: { label: "Dispenser de yerba", hrefValue: "dispenser-yerba" } },
  { slug: "despolvilladores", kind: "otros", menu: { label: "Despolvilladores", hrefValue: "despolvilladores" } },
  { slug: "porta-mate", kind: "otros", menu: { label: "Portamate", hrefValue: "porta-mate" } },
  { slug: "accesorios-materos", kind: "otros" },
  { slug: "combos-materos", kind: "regalos", menu: { label: "Combos materos", hrefValue: "combos-materos" } },
  { slug: "box-regalos-materos", kind: "regalos", menu: { label: "Regalos materos", hrefValue: "box-regalos-materos" } },
];

const bySlug = new Map(MATERO_SUBCATEGORIES.map(entry => [entry.slug, entry]));

export const isMateroSubcategory = (slug: string | null | undefined) => Boolean(slug && bySlug.has(slug));
export const materoKind = (slug: string | null | undefined): MateroKind | undefined => (slug ? bySlug.get(slug)?.kind : undefined);
export const materoKindSubcategories = (kind: MateroKind) => MATERO_SUBCATEGORIES.filter(entry => entry.kind === kind).map(entry => entry.slug);
