import type { Product } from "../../types/product.ts";
import { publicationAvailable } from "../products/public-families.ts";
import { availableFirst } from "./availability-order.ts";
import { CATALOG_ATTRIBUTE_KEYS, getCatalogAttributeValues } from "./attribute-config.ts";
import { isDecantProduct, recommendPerfumes } from "./perfume-recommendation.ts";

type RelatedCandidate = Product & { categorySlug?: string };

const RELATED_LIMIT = 4;

// Matero cross-sell: kinds of product (one or more subcategories each, in preference order) in order of usefulness
// next to the one on screen.
const materoKinds: Record<string, string[]> = {
  mates: ["mates"], bombillas: ["bombillas", "bombillones"], termos: ["termos", "vasos-termicos"], materas: ["materas"],
  yerba: ["yerbas", "latas-de-yerba", "dispenser-de-yerba"], otros: ["porta-mate", "accesorios-materos", "despolvilladores", "accesorios"],
  regalos: ["combos-materos", "box-regalos-materos"],
};
const materoOrder = ["mates", "bombillas", "termos", "materas", "yerba", "otros", "regalos"];
const materoKind = (slug: string | undefined) => Object.keys(materoKinds).find(kind => slug && materoKinds[kind].includes(slug));
// In the real catalog porta mates, dispenser and despolvillador sit in the public «Accesorios» section under the
// generic «accesorios» subcategory; electronics and gift boxes there are not matero complements.
const isMateroAccessory = (product: RelatedCandidate) => product.category === "accesorios" && product.categorySlug === "accesorios";

const gender = (product: RelatedCandidate) => getCatalogAttributeValues(product.attributes, CATALOG_ATTRIBUTE_KEYS.gender)[0];
const opposite: Record<string, string> = { masculino: "femenino", femenino: "masculino" };
const isDecant = ({ id, name, slug, attributes }: RelatedCandidate) => isDecantProduct({ id, name, slug, attributes });

/** Perfumes ranked by olfactory family and intensity with the existing recommender; gender is a filter, never crossed. */
function perfumeCandidates(current: RelatedCandidate, candidates: RelatedCandidate[]) {
  const currentGender = gender(current);
  const decant = isDecant(current);
  const compatible = candidates.filter(product => isDecant(product) === decant
    && !(currentGender && gender(product) === opposite[currentGender]));
  const olfactoryFamilies = getCatalogAttributeValues(current.attributes, CATALOG_ATTRIBUTE_KEYS.olfactoryFamily);
  const intensity = getCatalogAttributeValues(current.attributes, CATALOG_ATTRIBUTE_KEYS.intensity)[0];
  if (!olfactoryFamilies.length && !intensity) return { ranked: [], rest: compatible };
  const ranked = recommendPerfumes(
    compatible.map(product => ({ id: product.id, name: product.name, slug: product.slug, stock: Number(publicationAvailable(product)), attributes: product.attributes, category: { slug: "perfumes" }, product })),
    { gender: currentGender, olfactoryFamilies, intensity },
  ).map(recommendation => recommendation.product.product);
  return { ranked, rest: compatible.filter(product => !ranked.includes(product)) };
}

/** Mates and termos: one product per complementary kind in turn, then more of the same kind. */
function materoCandidates(current: RelatedCandidate, candidates: RelatedCandidate[]) {
  const own = materoKind(current.categorySlug);
  const groups = materoOrder.filter(kind => kind !== own)
    .map(kind => materoKinds[kind].flatMap(slug => availableFirst(candidates.filter(product => product.categorySlug === slug))));
  const ranked: RelatedCandidate[] = [];
  for (let round = 0; groups.some(group => group.length > round); round++)
    for (const group of groups) if (group[round]) ranked.push(group[round]);
  return { ranked, rest: candidates.filter(product => !ranked.includes(product)) };
}

/**
 * CONV-01: suggestions for «Más en…» on a product page. Same public section, never the product on screen or its family,
 * only with a photo; available products first and sold-out ones only to fill the gap.
 */
export function selectRelatedProducts<T extends RelatedCandidate>(current: T, catalog: readonly T[], limit = RELATED_LIMIT): T[] {
  const family = current.familyId ?? (current.kind === "family" ? current.id : undefined);
  const candidates = catalog.filter(product => (product.category === current.category || (current.category === "mates" && isMateroAccessory(product)))
    && product.id !== current.id
    && !(family && (product.familyId === family || product.id === family)) && Boolean(product.primaryImageUrl?.trim()));
  const { ranked, rest } = current.category === "perfumes" ? perfumeCandidates(current, candidates)
    : current.category === "mates" ? materoCandidates(current, candidates)
    : { ranked: [], rest: candidates };
  const ordered = [...ranked, ...availableFirst(rest)] as T[];
  return [...ordered.filter(publicationAvailable), ...ordered.filter(product => !publicationAvailable(product))].slice(0, limit);
}
